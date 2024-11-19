import { BaseTracker } from './base';

interface NavigationMetrics {
  session: {
    entryPage: string;
    exitPage?: string;
    pathLength: number;
    uniquePages: Set<string>;
    loops: number;
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
  private pageStartTime: number = Date.now();
  private lastPageUrl: string = '';
  private navigationHistory: string[] = [];
  private readonly MAX_HISTORY_LENGTH = 100;
  private readonly SLOW_PAGE_THRESHOLD = 3000; // 3 seconds
  private observer: PerformanceObserver | null = null;
  private readonly DEBOUNCE_TIME = 150; // ms
  private debounceTimer: NodeJS.Timeout | null = null;

  constructor(analytics: any) {
    super(analytics);
    this.metrics = this.initializeMetrics();
    this.handleNavigation = this.handleNavigation.bind(this);
    this.handlePopState = this.handlePopState.bind(this);
    this.handleBeforeUnload = this.handleBeforeUnload.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
  }

  private initializeMetrics(): NavigationMetrics {
    return {
      session: {
        entryPage: typeof window !== 'undefined' ? window.location.href : '',
        pathLength: 0,
        uniquePages: new Set([typeof window !== 'undefined' ? window.location.pathname : '']),
        loops: 0,
        backButtonUsage: 0,
        forwardButtonUsage: 0,
        averageTimePerPage: 0,
      },
      path: [],
      patterns: {
        commonFlows: [],
        exitPoints: [],
        entryPoints: [],
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

  async init(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      // Track initial page load
      this.trackInitialPage();

      // Set up navigation tracking with passive listeners
      this.setupNavigationTracking();

      // Track performance metrics
      this.setupPerformanceTracking();

      this.log('Navigation tracker initialized');
    } catch (error) {
      console.warn('Error initializing navigation tracker:', error);
    }
  }

  getData(): any {
    return {
      session: {
        ...this.metrics.session,
        uniquePages: Array.from(this.metrics.session.uniquePages),
      },
      path: this.metrics.path,
      patterns: {
        ...this.metrics.patterns,
        commonFlows: this.analyzeNavigationPatterns(),
        exitPoints: this.analyzeExitPoints(),
        entryPoints: this.analyzeEntryPoints(),
      },
      timing: {
        ...this.metrics.timing,
        averagePageLoad: this.calculateAverageLoadTime(),
        averageTransition: this.calculateAverageTransitionTime(),
      },
      summary: {
        totalPages: this.metrics.session.uniquePages.size,
        averageTimePerPage: this.calculateAverageTimePerPage(),
        bounceRate: this.calculateBounceRate(),
        exitRate: this.calculateExitRate(),
        navigationEfficiency: this.calculateNavigationEfficiency(),
      },
    };
  }

  private setupNavigationTracking(): void {
    // Use passive listeners for better performance
    const options = { passive: true };

    // Track history changes
    window.addEventListener('popstate', this.handlePopState, options);
    window.addEventListener('beforeunload', this.handleBeforeUnload, options);
    document.addEventListener('visibilitychange', this.handleVisibilityChange, options);

    // Track programmatic navigation
    this.interceptHistoryMethods();
    this.interceptLinkClicks();
  }

  private setupPerformanceTracking(): void {
    if ('PerformanceObserver' in window) {
      try {
        this.observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry) => {
            if (entry.entryType === 'navigation') {
              this.updateNavigationTiming(entry as PerformanceNavigationTiming);
            }
          });
        });

        this.observer.observe({ entryTypes: ['navigation'] });
      } catch (error) {
        console.warn('PerformanceObserver not supported:', error);
      }
    }
  }

  private interceptHistoryMethods(): void {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = (...args) => {
      originalPushState.apply(history, args);
      this.handleNavigation('pushState');
    };

    history.replaceState = (...args) => {
      originalReplaceState.apply(history, args);
      this.handleNavigation('replaceState');
    };
  }

  private interceptLinkClicks(): void {
    document.addEventListener('click', (event) => {
      const link = (event.target as HTMLElement).closest('a');
      if (!link) return;

      const href = link.getAttribute('href');
      if (!href) return;

      const isExternal = href.startsWith('http') && !href.includes(window.location.hostname);
      if (isExternal) {
        this.trackExternalNavigation(href);
      }
    }, { passive: true });
  }

  private handleNavigation(method: string): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    this.debounceTimer = setTimeout(() => {
      const currentUrl = window.location.href;
      if (currentUrl === this.lastPageUrl) return;

      this.trackPageTransition(method);
      this.lastPageUrl = currentUrl;
    }, this.DEBOUNCE_TIME);
  }

  private handlePopState = (): void => {
    this.metrics.session.backButtonUsage++;
    this.handleNavigation('popstate');
  };

  private handleBeforeUnload = (): void => {
    this.trackPageExit('close');
  };

  private handleVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') {
      this.trackPageExit('background');
    }
  };

  private trackInitialPage(): void {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    
    this.metrics.path.push({
      url: window.location.href,
      title: document.title,
      timestamp: new Date().toISOString(),
      referrer: document.referrer,
      type: 'initial',
      method: 'load',
      performance: {
        loadTime: navigation ? navigation.loadEventEnd - navigation.startTime : 0,
        transitionTime: 0,
        renderTime: navigation ? navigation.domComplete - navigation.startTime : 0,
      },
      context: {
        previousPage: document.referrer,
        timeOnPage: 0,
        scrollDepth: 0,
      },
    });

    this.lastPageUrl = window.location.href;
    this.navigationHistory.push(window.location.pathname);
  }

  private trackPageTransition(method: string): void {
    const currentTime = Date.now();
    const timeOnPreviousPage = currentTime - this.pageStartTime;

    this.metrics.path.push({
      url: window.location.href,
      title: document.title,
      timestamp: new Date().toISOString(),
      referrer: this.lastPageUrl,
      type: this.determineNavigationType(method),
      method: method as any,
      performance: {
        loadTime: 0, // Will be updated by PerformanceObserver
        transitionTime: performance.now(),
        renderTime: 0, // Will be updated by PerformanceObserver
      },
      context: {
        previousPage: this.lastPageUrl,
        timeOnPage: timeOnPreviousPage,
        scrollDepth: this.calculateScrollDepth(),
      },
    });

    this.metrics.session.uniquePages.add(window.location.pathname);
    this.metrics.session.pathLength++;
    this.pageStartTime = currentTime;

    // Update navigation history
    this.navigationHistory.push(window.location.pathname);
    if (this.navigationHistory.length > this.MAX_HISTORY_LENGTH) {
      this.navigationHistory.shift();
    }

    // Check for navigation loops
    this.detectNavigationLoops();
  }

  private trackPageExit(trigger: 'link' | 'back' | 'close' | 'external' | 'reload'): void {
    const lastPath = this.metrics.path[this.metrics.path.length - 1];
    if (lastPath) {
      lastPath.context.exitTrigger = trigger;
      lastPath.context.timeOnPage = Date.now() - this.pageStartTime;
      lastPath.context.scrollDepth = this.calculateScrollDepth();
    }

    this.metrics.session.exitPage = window.location.href;
  }

  private trackExternalNavigation(url: string): void {
    this.analytics.track('externalNavigation', {
      from: window.location.href,
      to: url,
      timestamp: new Date().toISOString(),
    });
  }

  private updateNavigationTiming(entry: PerformanceNavigationTiming): void {
    this.metrics.timing.navigationTiming = {
      dns: entry.domainLookupEnd - entry.domainLookupStart,
      tcp: entry.connectEnd - entry.connectStart,
      ttfb: entry.responseStart - entry.requestStart,
      domLoad: entry.domContentLoadedEventEnd - entry.startTime,
      windowLoad: entry.loadEventEnd - entry.startTime,
    };

    // Update the last navigation entry with actual performance data
    const lastPath = this.metrics.path[this.metrics.path.length - 1];
    if (lastPath) {
      lastPath.performance.loadTime = entry.loadEventEnd - entry.startTime;
      lastPath.performance.renderTime = entry.domComplete - entry.startTime;
    }

    // Track slow pages
    if (entry.loadEventEnd - entry.startTime > this.SLOW_PAGE_THRESHOLD) {
      this.metrics.timing.slowestPages.push({
        url: window.location.href,
        loadTime: entry.loadEventEnd - entry.startTime,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private determineNavigationType(method: string): NavigationMetrics['path'][0]['type'] {
    if (method === 'popstate') return 'back';
    if (method === 'pushState') return 'navigation';
    if (method === 'replaceState') return 'navigation';
    if (method === 'load') return 'initial';
    return 'navigation';
  }

  private calculateScrollDepth(): number {
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    const scrollTop = window.scrollY;
    return Math.round(((scrollTop + windowHeight) / documentHeight) * 100);
  }

  private detectNavigationLoops(): void {
    const pathStr = this.navigationHistory.join(',');
    const matches = pathStr.match(/(.+?)\1+/g);
    if (matches) {
      this.metrics.session.loops += matches.length;
    }
  }

  private analyzeNavigationPatterns(): NavigationMetrics['patterns']['commonFlows'] {
    const flows: Map<string, { count: number; times: number[] }> = new Map();
    const pathLength = 3; // Look for patterns of 3 pages

    for (let i = 0; i <= this.navigationHistory.length - pathLength; i++) {
      const path = this.navigationHistory.slice(i, i + pathLength);
      const pathKey = path.join(',');
      
      const existing = flows.get(pathKey) || { count: 0, times: [] };
      existing.count++;
      flows.set(pathKey, existing);
    }

    return Array.from(flows.entries())
      .map(([path, data]) => ({
        path: path.split(','),
        frequency: data.count,
        averageTime: data.times.reduce((a, b) => a + b, 0) / data.times.length,
        conversionRate: 0, // Would need conversion goals to calculate
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5);
  }

  private analyzeExitPoints(): NavigationMetrics['patterns']['exitPoints'] {
    const exitPoints = new Map<string, { count: number; times: number[]; reasons: Record<string, number> }>();

    this.metrics.path.forEach((path) => {
      if (path.context.exitTrigger) {
        const existing = exitPoints.get(path.url) || { count: 0, times: [], reasons: {} };
        existing.count++;
        existing.times.push(path.context.timeOnPage);
        existing.reasons[path.context.exitTrigger] = (existing.reasons[path.context.exitTrigger] || 0) + 1;
        exitPoints.set(path.url, existing);
      }
    });

    return Array.from(exitPoints.entries())
      .map(([url, data]) => ({
        url,
        exitCount: data.count,
        averageTimeBeforeExit: data.times.reduce((a, b) => a + b, 0) / data.times.length,
        exitReasons: data.reasons,
      }))
      .sort((a, b) => b.exitCount - a.exitCount);
  }

  private analyzeEntryPoints(): NavigationMetrics['patterns']['entryPoints'] {
    const entryPoints = new Map<string, { count: number; bounces: number; sources: Record<string, number> }>();

    this.metrics.path.forEach((path, index) => {
      if (path.type === 'initial' || !this.metrics.path[index - 1]) {
        const existing = entryPoints.get(path.url) || { count: 0, bounces: 0, sources: {} };
        existing.count++;
        
        // Count as bounce if it's the only page viewed
        if (this.metrics.path.length === 1) {
          existing.bounces++;
        }

        const source = new URL(path.referrer || 'direct').hostname || 'direct';
        existing.sources[source] = (existing.sources[source] || 0) + 1;
        
        entryPoints.set(path.url, existing);
      }
    });

    return Array.from(entryPoints.entries())
      .map(([url, data]) => ({
        url,
        entryCount: data.count,
        bounceRate: (data.bounces / data.count) * 100,
        sources: data.sources,
      }))
      .sort((a, b) => b.entryCount - a.entryCount);
  }

  private calculateAverageLoadTime(): number {
    const loadTimes = this.metrics.path
      .map(p => p.performance.loadTime)
      .filter(time => time > 0);
    return loadTimes.length ? loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length : 0;
  }

  private calculateAverageTransitionTime(): number {
    const transitionTimes = this.metrics.path
      .map(p => p.performance.transitionTime)
      .filter(time => time > 0);
    return transitionTimes.length ? transitionTimes.reduce((a, b) => a + b, 0) / transitionTimes.length : 0;
  }

  private calculateAverageTimePerPage(): number {
    const timesOnPage = this.metrics.path
      .map(p => p.context.timeOnPage)
      .filter(time => time > 0);
    return timesOnPage.length ? timesOnPage.reduce((a, b) => a + b, 0) / timesOnPage.length : 0;
  }

  private calculateBounceRate(): number {
    const singlePageSessions = this.metrics.path.length === 1 ? 1 : 0;
    return (singlePageSessions / this.metrics.path.length) * 100;
  }

  private calculateExitRate(): number {
    const exits = this.metrics.path.filter(p => p.context.exitTrigger).length;
    return (exits / this.metrics.path.length) * 100;
  }

  private calculateNavigationEfficiency(): number {
    const uniquePages = this.metrics.session.uniquePages.size;
    const totalNavigations = this.metrics.session.pathLength;
    return uniquePages ? (uniquePages / totalNavigations) * 100 : 0;
  }

  cleanup(): void {
    window.removeEventListener('popstate', this.handlePopState);
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    
    if (this.observer) {
      this.observer.disconnect();
    }
    
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Restore original history methods
    if (history.pushState.toString().includes('handleNavigation')) {
      delete (history as any).pushState;
    }
    if (history.replaceState.toString().includes('handleNavigation')) {
      delete (history as any).replaceState;
    }
  }
}
