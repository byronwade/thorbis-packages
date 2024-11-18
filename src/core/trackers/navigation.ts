import { BaseTracker } from './base';

interface NavigationMetrics {
  session: {
    entryPage: string;
    exitPage?: string;
    pathLength: number;
    uniquePages: number;
    loops: number; // Number of times user visited same page
    backButtonUsage: number;
    forwardButtonUsage: number;
    averageTimePerPage: number;
  };
  path: Array<{
    url: string;
    title: string;
    timestamp: string;
    referrer: string;
    type: 'initial' | 'navigation' | 'back' | 'forward' | 'reload' | 'external';
    method: 'pushState' | 'replaceState' | 'popstate' | 'load' | 'redirect';
    performance: {
      loadTime: number;
      transitionTime: number;
      renderTime: number;
    };
    context: {
      previousPage: string;
      nextPage?: string;
      timeOnPage: number;
      scrollDepth: number;
      exitTrigger?: 'link' | 'back' | 'close' | 'external' | 'reload';
    };
  }>;
  patterns: {
    commonFlows: Array<{
      path: string[];
      frequency: number;
      averageTime: number;
      conversionRate: number;
    }>;
    exitPoints: Array<{
      url: string;
      exitCount: number;
      averageTimeBeforeExit: number;
      exitReasons: Record<string, number>;
    }>;
    entryPoints: Array<{
      url: string;
      entryCount: number;
      bounceRate: number;
      sources: Record<string, number>;
    }>;
  };
  timing: {
    averagePageLoad: number;
    averageTransition: number;
    slowestPages: Array<{
      url: string;
      loadTime: number;
      timestamp: string;
    }>;
    navigationTiming: {
      dns: number;
      tcp: number;
      ttfb: number;
      domLoad: number;
      windowLoad: number;
    };
  };
}

export class NavigationTracker extends BaseTracker {
  private metrics: NavigationMetrics;
  private currentPage: {
    url: string;
    startTime: number;
    scrollDepth: number;
    hasInteracted: boolean;
  };
  private pageHistory: Set<string>;
  private readonly SLOW_PAGE_THRESHOLD = 3000; // 3 seconds

  constructor(analytics: any, debug: boolean = false) {
    super(analytics, debug);
    this.metrics = this.initializeMetrics();
    this.currentPage = {
      url: '',
      startTime: Date.now(),
      scrollDepth: 0,
      hasInteracted: false,
    };
    this.pageHistory = new Set();

    // Bind methods
    this.handleNavigation = this.handleNavigation.bind(this);
    this.handlePopState = this.handlePopState.bind(this);
    this.handleScroll = this.handleScroll.bind(this);
    this.handleInteraction = this.handleInteraction.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
  }

  init() {
    if (typeof window === 'undefined') return;

    // Track initial page load
    this.handleInitialLoad();

    // Set up navigation listeners
    window.addEventListener('popstate', this.handlePopState);
    window.addEventListener('scroll', this.handleScroll);
    window.addEventListener('click', this.handleInteraction);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);

    // Intercept history methods
    this.interceptHistoryMethods();

    // Track external links
    this.trackExternalLinks();

    this.log('Navigation tracker initialized');
  }

  private initializeMetrics(): NavigationMetrics {
    return {
      session: {
        entryPage: window.location.href,
        pathLength: 1,
        uniquePages: 1,
        loops: 0,
        backButtonUsage: 0,
        forwardButtonUsage: 0,
        averageTimePerPage: 0,
      },
      path: [],
      patterns: {
        commonFlows: [],
        exitPoints: [],
        entryPoints: [
          {
            url: window.location.href,
            entryCount: 1,
            bounceRate: 0,
            sources: {
              [document.referrer || 'direct']: 1,
            },
          },
        ],
      },
      timing: {
        averagePageLoad: 0,
        averageTransition: 0,
        slowestPages: [],
        navigationTiming: {
          dns: 0,
          tcp: 0,
          ttfb: 0,
          domLoad: 0,
          windowLoad: 0,
        },
      },
    };
  }

  private handleInitialLoad() {
    const navigationTiming = performance.getEntriesByType(
      'navigation'
    )[0] as PerformanceNavigationTiming;

    this.currentPage = {
      url: window.location.href,
      startTime: Date.now(),
      scrollDepth: 0,
      hasInteracted: false,
    };

    this.pageHistory.add(window.location.href);

    const pathEntry = {
      url: window.location.href,
      title: document.title,
      timestamp: new Date().toISOString(),
      referrer: document.referrer,
      type: 'initial' as const,
      method: 'load' as const,
      performance: {
        loadTime: navigationTiming.loadEventEnd - navigationTiming.startTime,
        transitionTime: 0,
        renderTime:
          navigationTiming.domContentLoadedEventEnd -
          navigationTiming.startTime,
      },
      context: {
        previousPage: document.referrer,
        timeOnPage: 0,
        scrollDepth: 0,
      },
    };

    this.metrics.path.push(pathEntry);
    this.updateTimingMetrics(pathEntry.performance);
    this.trackNavigation('initialLoad', pathEntry);
  }

  private interceptHistoryMethods() {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    const self = this;

    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      self.handleNavigation('pushState');
    };

    history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      self.handleNavigation('replaceState');
    };
  }

  private handlePopState() {
    const isBackNavigation =
      this.metrics.path.length > 1 &&
      this.metrics.path[this.metrics.path.length - 2].url ===
        window.location.href;

    if (isBackNavigation) {
      this.metrics.session.backButtonUsage++;
      this.handleNavigation('popstate', 'back');
    } else {
      this.metrics.session.forwardButtonUsage++;
      this.handleNavigation('popstate', 'forward');
    }
  }

  private handleNavigation(method: string, type: string = 'navigation') {
    const previousPage = this.currentPage;
    const currentUrl = window.location.href;
    const timestamp = new Date().toISOString();

    // Update current page metrics before changing
    this.updateCurrentPageMetrics();

    // Create new navigation entry
    const navigationEntry = {
      url: currentUrl,
      title: document.title,
      timestamp,
      referrer: previousPage.url,
      type: type as
        | 'initial'
        | 'navigation'
        | 'back'
        | 'forward'
        | 'reload'
        | 'external',
      method: method as
        | 'pushState'
        | 'replaceState'
        | 'popstate'
        | 'load'
        | 'redirect',
      performance: {
        loadTime: 0,
        transitionTime: Date.now() - previousPage.startTime,
        renderTime: 0,
      },
      context: {
        previousPage: previousPage.url,
        timeOnPage: 0,
        scrollDepth: previousPage.scrollDepth,
        exitTrigger: type === 'back' ? ('back' as const) : ('link' as const),
      },
    };

    // Update session metrics
    this.metrics.session.pathLength++;
    if (!this.pageHistory.has(currentUrl)) {
      this.metrics.session.uniquePages++;
      this.pageHistory.add(currentUrl);
    } else {
      this.metrics.session.loops++;
    }

    // Update current page tracking
    this.currentPage = {
      url: currentUrl,
      startTime: Date.now(),
      scrollDepth: 0,
      hasInteracted: false,
    };

    // Add to path history
    this.metrics.path.push(navigationEntry);

    // Update patterns
    this.updateNavigationPatterns();

    // Track the navigation event
    this.trackNavigation('navigation', navigationEntry);
  }

  private updateCurrentPageMetrics() {
    const timeOnPage = Date.now() - this.currentPage.startTime;
    const lastPathEntry = this.metrics.path[this.metrics.path.length - 1];

    if (lastPathEntry) {
      lastPathEntry.context.timeOnPage = timeOnPage;
      lastPathEntry.context.scrollDepth = this.currentPage.scrollDepth;
    }

    // Update average time per page
    const totalTime = this.metrics.path.reduce(
      (sum, entry) => sum + entry.context.timeOnPage,
      0
    );
    this.metrics.session.averageTimePerPage =
      totalTime / this.metrics.path.length;
  }

  private updateNavigationPatterns() {
    // Update common flows
    if (this.metrics.path.length >= 3) {
      const flow = this.metrics.path.slice(-3).map((entry) => entry.url);
      const existingFlow = this.metrics.patterns.commonFlows.find(
        (pattern) => JSON.stringify(pattern.path) === JSON.stringify(flow)
      );

      if (existingFlow) {
        existingFlow.frequency++;
        existingFlow.averageTime =
          (existingFlow.averageTime +
            this.metrics.path[this.metrics.path.length - 2].context
              .timeOnPage) /
          2;
      } else {
        this.metrics.patterns.commonFlows.push({
          path: flow,
          frequency: 1,
          averageTime:
            this.metrics.path[this.metrics.path.length - 2].context.timeOnPage,
          conversionRate: 0, // To be calculated based on goals
        });
      }
    }

    // Update exit points
    const previousPage = this.metrics.path[this.metrics.path.length - 2];
    if (previousPage) {
      const existingExit = this.metrics.patterns.exitPoints.find(
        (exit) => exit.url === previousPage.url
      );
      if (existingExit) {
        existingExit.exitCount++;
        existingExit.averageTimeBeforeExit =
          (existingExit.averageTimeBeforeExit +
            previousPage.context.timeOnPage) /
          2;
        existingExit.exitReasons[
          previousPage.context.exitTrigger || 'unknown'
        ] =
          (existingExit.exitReasons[
            previousPage.context.exitTrigger || 'unknown'
          ] || 0) + 1;
      } else {
        this.metrics.patterns.exitPoints.push({
          url: previousPage.url,
          exitCount: 1,
          averageTimeBeforeExit: previousPage.context.timeOnPage,
          exitReasons: {
            [previousPage.context.exitTrigger || 'unknown']: 1,
          },
        });
      }
    }
  }

  private updateTimingMetrics(performance: {
    loadTime: number;
    transitionTime: number;
    renderTime: number;
  }) {
    // Update averages
    const pathLength = this.metrics.path.length;
    this.metrics.timing.averagePageLoad =
      (this.metrics.timing.averagePageLoad * (pathLength - 1) +
        performance.loadTime) /
      pathLength;
    this.metrics.timing.averageTransition =
      (this.metrics.timing.averageTransition * (pathLength - 1) +
        performance.transitionTime) /
      pathLength;

    // Update slowest pages
    if (performance.loadTime > this.SLOW_PAGE_THRESHOLD) {
      this.metrics.timing.slowestPages.push({
        url: window.location.href,
        loadTime: performance.loadTime,
        timestamp: new Date().toISOString(),
      });
      // Keep only top 5 slowest pages
      this.metrics.timing.slowestPages.sort((a, b) => b.loadTime - a.loadTime);
      this.metrics.timing.slowestPages = this.metrics.timing.slowestPages.slice(
        0,
        5
      );
    }
  }

  private handleScroll = () => {
    const scrollDepth =
      ((window.scrollY + window.innerHeight) /
        document.documentElement.scrollHeight) *
      100;
    this.currentPage.scrollDepth = Math.max(
      this.currentPage.scrollDepth,
      Math.round(scrollDepth)
    );
  };

  private handleInteraction = () => {
    this.currentPage.hasInteracted = true;
  };

  private handleVisibilityChange = () => {
    if (document.hidden) {
      this.updateCurrentPageMetrics();
    }
  };

  private trackExternalLinks() {
    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const link = target.closest('a');

      if (link && link.hostname !== window.location.hostname) {
        this.trackNavigation('externalNavigation', {
          url: link.href,
          title: link.title || link.textContent || 'External Link',
          timestamp: new Date().toISOString(),
          type: 'external',
          method: 'link',
          referrer: window.location.href,
          performance: {
            loadTime: 0,
            transitionTime: Date.now() - this.currentPage.startTime,
            renderTime: 0,
          },
          context: {
            previousPage: window.location.href,
            timeOnPage: Date.now() - this.currentPage.startTime,
            scrollDepth: this.currentPage.scrollDepth,
            exitTrigger: 'external',
          },
        });
      }
    });
  }

  private trackNavigation(eventName: string, data: any) {
    this.analytics.track(eventName, {
      ...data,
      sessionMetrics: this.metrics.session,
      patterns: this.metrics.patterns,
      timing: this.metrics.timing,
    });
  }

  cleanup() {
    // Update final metrics
    this.updateCurrentPageMetrics();

    // Set exit page
    this.metrics.session.exitPage = this.currentPage.url;

    // Track final navigation state
    this.trackNavigation('navigationEnd', {
      sessionMetrics: this.metrics.session,
      finalPath: this.metrics.path,
      patterns: this.metrics.patterns,
      timing: this.metrics.timing,
    });

    // Remove event listeners
    window.removeEventListener('popstate', this.handlePopState);
    window.removeEventListener('scroll', this.handleScroll);
    window.removeEventListener('click', this.handleInteraction);
    document.removeEventListener(
      'visibilitychange',
      this.handleVisibilityChange
    );
  }
}
