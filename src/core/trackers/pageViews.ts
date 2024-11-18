import { BaseTracker } from './base';

interface EnhancedPageViewData {
  basic: {
    url: string;
    path: string;
    title: string;
    referrer: string;
    timestamp: string;
    language: string;
    viewport: {
      width: number;
      height: number;
      ratio: number;
    };
  };
  timing: {
    startTime: number;
    endTime?: number;
    timeOnPage: number;
    loadTime: number;
    readyTime: number;
    renderTime: number;
    interactionTime?: number; // Time to first interaction
  };
  engagement: {
    readPercentage: number;
    scrollDepth: number;
    interactionCount: number;
    focusTime: number;
    blurTime: number;
    activeTime: number;
    idleTime: number;
  };
  visibility: {
    initialVisibility: boolean;
    visibilityChanges: number;
    totalVisibleTime: number;
    totalHiddenTime: number;
    lastVisibilityChange: string;
  };
  performance: {
    fcp: number; // First Contentful Paint
    lcp: number; // Largest Contentful Paint
    fid: number; // First Input Delay
    cls: number; // Cumulative Layout Shift
    ttfb: number; // Time to First Byte
    domLoad: number;
    windowLoad: number;
  };
  context: {
    previousPage?: string;
    nextPage?: string;
    entryType: 'direct' | 'navigation' | 'reload' | 'back_forward' | 'external';
    exitType?: 'navigation' | 'close' | 'external' | 'timeout';
    queryParams: Record<string, string>;
    hashFragment?: string;
  };
  meta: {
    pageType: string;
    category?: string;
    tags: string[];
    author?: string;
    publishDate?: string;
    wordCount?: number;
    hasVideo: boolean;
    hasComments: boolean;
    hasSocialShare: boolean;
  };
}

// Add custom type definitions for Web Vitals
interface FirstInputEntry extends PerformanceEntry {
  processingStart: number;
}

export class PageViewTracker extends BaseTracker {
  private currentPageData: EnhancedPageViewData;
  private visibilityStart: number = Date.now();
  private interactionCount: number = 0;
  private scrollPositions: Set<number> = new Set();
  private observer: PerformanceObserver | null = null;
  private readonly IDLE_THRESHOLD = 30000; // 30 seconds
  private lastActivityTime: number = Date.now();
  private isIdle: boolean = false;

  constructor(analytics: any, debug: boolean = false) {
    super(analytics, debug);
    this.currentPageData = this.initializePageViewData();

    // Bind methods
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.handleScroll = this.handleScroll.bind(this);
    this.handleInteraction = this.handleInteraction.bind(this);
    this.checkIdleState = this.checkIdleState.bind(this);
  }

  init() {
    if (typeof window === 'undefined') return;

    // Initialize page view tracking
    this.trackInitialPageView();

    // Set up event listeners
    this.setupEventListeners();

    // Track performance metrics
    this.trackPerformanceMetrics();

    // Start idle checking
    setInterval(this.checkIdleState, 1000);

    this.log('PageView tracker initialized');
  }

  private initializePageViewData(): EnhancedPageViewData {
    const url = new URL(window.location.href);
    return {
      basic: {
        url: url.href,
        path: url.pathname,
        title: document.title,
        referrer: document.referrer,
        timestamp: new Date().toISOString(),
        language: document.documentElement.lang,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          ratio: window.devicePixelRatio,
        },
      },
      timing: {
        startTime: Date.now(),
        timeOnPage: 0,
        loadTime: 0,
        readyTime: 0,
        renderTime: 0,
      },
      engagement: {
        readPercentage: 0,
        scrollDepth: 0,
        interactionCount: 0,
        focusTime: 0,
        blurTime: 0,
        activeTime: 0,
        idleTime: 0,
      },
      visibility: {
        initialVisibility: !document.hidden,
        visibilityChanges: 0,
        totalVisibleTime: 0,
        totalHiddenTime: 0,
        lastVisibilityChange: new Date().toISOString(),
      },
      performance: {
        fcp: 0,
        lcp: 0,
        fid: 0,
        cls: 0,
        ttfb: 0,
        domLoad: 0,
        windowLoad: 0,
      },
      context: {
        entryType: this.determineEntryType(),
        queryParams: Object.fromEntries(url.searchParams),
        hashFragment: url.hash || undefined,
      },
      meta: this.collectPageMetadata(),
    };
  }

  private setupEventListeners() {
    // Visibility changes
    document.addEventListener('visibilitychange', this.handleVisibilityChange);

    // Scroll tracking
    window.addEventListener('scroll', this.handleScroll);

    // User interactions
    window.addEventListener('click', this.handleInteraction);
    window.addEventListener('keydown', this.handleInteraction);
    window.addEventListener('mousemove', this.handleInteraction);
    window.addEventListener('touchstart', this.handleInteraction);

    // Navigation
    window.addEventListener('popstate', this.handleNavigation);
    this.interceptHistoryMethods();
  }

  private trackInitialPageView() {
    // Track initial page load timing
    if (window.performance) {
      const navigation = performance.getEntriesByType(
        'navigation'
      )[0] as PerformanceNavigationTiming;
      this.currentPageData.timing.loadTime = navigation.loadEventEnd;
      this.currentPageData.timing.readyTime =
        navigation.domContentLoadedEventEnd;
      this.currentPageData.timing.renderTime = navigation.domInteractive;
    }

    // Track initial view
    this.analytics.page({
      ...this.currentPageData.basic,
      timing: this.currentPageData.timing,
      context: this.currentPageData.context,
      meta: this.currentPageData.meta,
    });
  }

  private trackPerformanceMetrics() {
    // Create performance observer for web vitals
    if ('PerformanceObserver' in window) {
      // First Contentful Paint
      this.observePerformanceEntry('paint', (entries: PerformanceEntry[]) => {
        for (const entry of entries) {
          if (entry.name === 'first-contentful-paint') {
            this.currentPageData.performance.fcp = entry.startTime;
            this.trackPerformanceUpdate('fcp');
          }
        }
      });

      // Largest Contentful Paint
      this.observePerformanceEntry(
        'largest-contentful-paint',
        (entries: PerformanceEntry[]) => {
          const lastEntry = entries.at(-1);
          if (lastEntry) {
            this.currentPageData.performance.lcp = lastEntry.startTime;
            this.trackPerformanceUpdate('lcp');
          }
        }
      );

      // First Input Delay
      this.observePerformanceEntry(
        'first-input',
        (entries: PerformanceEntry[]) => {
          const firstInput = entries[0] as FirstInputEntry;
          if (firstInput) {
            this.currentPageData.performance.fid =
              firstInput.processingStart - firstInput.startTime;
            this.trackPerformanceUpdate('fid');
          }
        }
      );

      // Layout Shifts
      this.observePerformanceEntry(
        'layout-shift',
        (entries: PerformanceEntry[]) => {
          let cumulativeScore = 0;
          for (const entry of entries) {
            if (!(entry as any).hadRecentInput) {
              cumulativeScore += (entry as any).value;
            }
          }
          this.currentPageData.performance.cls = cumulativeScore;
          this.trackPerformanceUpdate('cls');
        }
      );
    }
  }

  private handleVisibilityChange() {
    const now = Date.now();
    const timeSinceLastChange =
      now -
      new Date(this.currentPageData.visibility.lastVisibilityChange).getTime();

    this.currentPageData.visibility.visibilityChanges++;
    this.currentPageData.visibility.lastVisibilityChange =
      new Date().toISOString();

    if (document.hidden) {
      this.currentPageData.visibility.totalVisibleTime += timeSinceLastChange;
      this.updateEngagementMetrics();
    } else {
      this.currentPageData.visibility.totalHiddenTime += timeSinceLastChange;
    }

    this.trackVisibilityChange();
  }

  private handleScroll = () => {
    const scrollDepth = this.calculateScrollDepth();
    this.currentPageData.engagement.scrollDepth = Math.max(
      this.currentPageData.engagement.scrollDepth,
      scrollDepth
    );

    // Track read percentage based on content visibility
    const readPercentage = this.calculateReadPercentage();
    this.currentPageData.engagement.readPercentage = Math.max(
      this.currentPageData.engagement.readPercentage,
      readPercentage
    );

    // Track scroll position for milestones
    const milestone = Math.floor(scrollDepth / 25) * 25;
    if (milestone > 0 && !this.scrollPositions.has(milestone)) {
      this.scrollPositions.add(milestone);
      this.trackScrollMilestone(milestone);
    }
  };

  private handleInteraction = () => {
    this.interactionCount++;
    this.lastActivityTime = Date.now();
    this.isIdle = false;

    if (!this.currentPageData.timing.interactionTime) {
      this.currentPageData.timing.interactionTime =
        Date.now() - this.currentPageData.timing.startTime;
    }

    this.currentPageData.engagement.interactionCount = this.interactionCount;
  };

  private checkIdleState() {
    const now = Date.now();
    const timeSinceLastActivity = now - this.lastActivityTime;

    if (timeSinceLastActivity >= this.IDLE_THRESHOLD && !this.isIdle) {
      this.isIdle = true;
      this.updateEngagementMetrics();
    }
  }

  private calculateScrollDepth(): number {
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    const scrollTop = window.scrollY;
    return Math.round(((scrollTop + windowHeight) / documentHeight) * 100);
  }

  private calculateReadPercentage(): number {
    // Calculate based on visible content elements
    const contentElements = document.querySelectorAll(
      'p, h1, h2, h3, h4, h5, h6'
    );
    let visibleElements = 0;

    contentElements.forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        visibleElements++;
      }
    });

    return Math.round((visibleElements / contentElements.length) * 100);
  }

  private updateEngagementMetrics() {
    const now = Date.now();
    const timeSpent = now - this.currentPageData.timing.startTime;

    this.currentPageData.timing.timeOnPage = timeSpent;
    this.currentPageData.engagement.activeTime =
      timeSpent - this.currentPageData.engagement.idleTime;

    if (this.isIdle) {
      this.currentPageData.engagement.idleTime += now - this.lastActivityTime;
    }

    this.trackEngagementUpdate();
  }

  private collectPageMetadata() {
    return {
      pageType:
        document
          .querySelector('meta[name="page-type"]')
          ?.getAttribute('content') || 'unknown',
      category:
        document
          .querySelector('meta[name="category"]')
          ?.getAttribute('content') || undefined,
      tags: Array.from(document.querySelectorAll('meta[name="keywords"]'))
        .map((el) => el.getAttribute('content')?.split(',') || [])
        .flat()
        .map((tag) => tag.trim()),
      author:
        document
          .querySelector('meta[name="author"]')
          ?.getAttribute('content') || undefined,
      publishDate:
        document
          .querySelector('meta[name="published-date"]')
          ?.getAttribute('content') || undefined,
      wordCount: this.countWords(),
      hasVideo: document.querySelectorAll('video').length > 0,
      hasComments: document.querySelectorAll('[data-comments]').length > 0,
      hasSocialShare: document.querySelectorAll('[data-share]').length > 0,
    };
  }

  private countWords(): number {
    const content = document.querySelector('article') || document.body;
    const text = content.textContent || '';
    return text.trim().split(/\s+/).length;
  }

  private determineEntryType(): EnhancedPageViewData['context']['entryType'] {
    if (!document.referrer) return 'direct';
    if (performance.navigation.type === 1) return 'reload';
    if (performance.navigation.type === 2) return 'back_forward';
    if (new URL(document.referrer).origin !== window.location.origin)
      return 'external';
    return 'navigation';
  }

  private interceptHistoryMethods() {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    const self = this;

    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      self.handleNavigation(new PopStateEvent('pushstate'));
    };

    history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      self.handleNavigation(new PopStateEvent('replacestate'));
    };
  }

  private handleNavigation = (event: PopStateEvent | string) => {
    // Update exit information for current page
    this.currentPageData.context.exitType = 'navigation';
    this.currentPageData.timing.endTime = Date.now();

    // Track final state of current page
    this.updateEngagementMetrics();
    this.trackPageExit();

    // Initialize tracking for new page
    this.currentPageData = this.initializePageViewData();
    this.trackInitialPageView();
  };

  private observePerformanceEntry(
    entryType: string,
    callback: (entries: PerformanceEntry[]) => void
  ) {
    try {
      const observer = new PerformanceObserver((list) =>
        callback(list.getEntries())
      );
      observer.observe({ entryTypes: [entryType] });
    } catch (error) {
      this.log(`Failed to observe ${entryType}`, error);
    }
  }

  private trackPerformanceUpdate(metric: string) {
    this.analytics.track('pagePerformance', {
      metric,
      value:
        this.currentPageData.performance[
          metric as keyof typeof this.currentPageData.performance
        ],
      url: this.currentPageData.basic.url,
      timestamp: new Date().toISOString(),
    });
  }

  private trackVisibilityChange() {
    this.analytics.track('pageVisibility', {
      hidden: document.hidden,
      visibilityState: document.visibilityState,
      visibilityMetrics: this.currentPageData.visibility,
      timestamp: new Date().toISOString(),
    });
  }

  private trackScrollMilestone(milestone: number) {
    this.analytics.track('pageScroll', {
      depth: milestone,
      readPercentage: this.currentPageData.engagement.readPercentage,
      url: this.currentPageData.basic.url,
      timestamp: new Date().toISOString(),
    });
  }

  private trackEngagementUpdate() {
    this.analytics.track('pageEngagement', {
      engagement: this.currentPageData.engagement,
      timing: this.currentPageData.timing,
      url: this.currentPageData.basic.url,
      timestamp: new Date().toISOString(),
    });
  }

  private trackPageExit() {
    this.analytics.track('pageExit', {
      ...this.currentPageData,
      timestamp: new Date().toISOString(),
    });
  }

  cleanup() {
    // Remove event listeners
    document.removeEventListener(
      'visibilitychange',
      this.handleVisibilityChange
    );
    window.removeEventListener('scroll', this.handleScroll);
    window.removeEventListener('click', this.handleInteraction);
    window.removeEventListener('keydown', this.handleInteraction);
    window.removeEventListener('mousemove', this.handleInteraction);
    window.removeEventListener('touchstart', this.handleInteraction);
    window.removeEventListener('popstate', (e: PopStateEvent) =>
      this.handleNavigation(e)
    );

    // Disconnect performance observers
    if (this.observer) {
      this.observer.disconnect();
    }

    // Track final page state
    this.currentPageData.timing.endTime = Date.now();
    this.updateEngagementMetrics();
    this.trackPageExit();
  }
}
