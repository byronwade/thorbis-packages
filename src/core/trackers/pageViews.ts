import { BaseTracker } from './base';

interface PageViewMetrics {
  totalViews: number;
  uniqueViews: number;
  averageTimeOnPage: number;
  bounceRate: number;
  exitRate: number;
  pages: Array<{
    url: string;
    title: string;
    timestamp: string;
    timeOnPage: number;
    scrollDepth: number;
    referrer: string;
    performance: {
      loadTime: number;
      renderTime: number;
      resourcesLoaded: number;
    };
    interactions: {
      clicks: number;
      scrolls: number;
      forms: number;
      totalInteractions: number;
    };
    visibility: {
      totalTime: number;
      visibleTime: number;
      hiddenTime: number;
      lastVisibilityChange: number;
    };
    context: {
      deviceType: string;
      viewport: {
        width: number;
        height: number;
      };
      connection: {
        type: string;
        speed: number;
      };
      userAgent: string;
    };
  }>;
}

interface EnhancedPageViewData {
  url: string;
  title: string;
  timestamp: string;
  referrer: string;
  performance: {
    loadTime: number;
    renderTime: number;
    resourcesLoaded: number;
  };
  interactions: {
    clicks: number;
    scrolls: number;
    forms: number;
    totalInteractions: number;
  };
  visibility: {
    totalTime: number;
    visibleTime: number;
    hiddenTime: number;
    lastVisibilityChange: number;
  };
  context: {
    deviceType: string;
    viewport: {
      width: number;
      height: number;
    };
    connection: {
      type: string;
      speed: number;
    };
    userAgent: string;
  };
}

export class PageViewTracker extends BaseTracker {
  private metrics: PageViewMetrics;
  private currentPageData: EnhancedPageViewData;
  private visibilityStart: number = Date.now();
  private interactionCount: number = 0;
  private scrollPositions: Set<number> = new Set();
  private observer: PerformanceObserver | null = null;
  private readonly IDLE_THRESHOLD = 30000; // 30 seconds
  private lastActivityTime: number = Date.now();
  private isIdle: boolean = false;
  private readonly SCROLL_THROTTLE = 100; // ms
  private scrollThrottleTimer: NodeJS.Timeout | null = null;
  private readonly INTERACTION_THROTTLE = 50; // ms
  private interactionThrottleTimer: NodeJS.Timeout | null = null;
  private uniquePageViews: Set<string> = new Set();
  private sessionStartTime: number = Date.now();

  constructor(analytics: any) {
    super(analytics);
    this.metrics = this.initializeMetrics();
    this.currentPageData = this.initializePageViewData();
  }

  private initializeMetrics(): PageViewMetrics {
    return {
      totalViews: 0,
      uniqueViews: 0,
      averageTimeOnPage: 0,
      bounceRate: 0,
      exitRate: 0,
      pages: [],
    };
  }

  private initializePageViewData(): EnhancedPageViewData {
    return {
      url: typeof window !== 'undefined' ? window.location.href : '',
      title: typeof window !== 'undefined' ? document.title : '',
      timestamp: new Date().toISOString(),
      referrer: typeof window !== 'undefined' ? document.referrer : '',
      performance: {
        loadTime: 0,
        renderTime: 0,
        resourcesLoaded: 0,
      },
      interactions: {
        clicks: 0,
        scrolls: 0,
        forms: 0,
        totalInteractions: 0,
      },
      visibility: {
        totalTime: 0,
        visibleTime: 0,
        hiddenTime: 0,
        lastVisibilityChange: Date.now(),
      },
      context: this.getPageContext(),
    };
  }

  async init(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      // Track initial page view
      this.trackPageView();

      // Set up event listeners with proper cleanup
      this.setupEventListeners();

      // Track performance metrics
      this.setupPerformanceTracking();

      // Start idle checking with requestIdleCallback for better performance
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(this.checkIdleState, { timeout: 1000 });
      } else {
        setInterval(this.checkIdleState, 1000);
      }

      this.log('PageView tracker initialized');
    } catch (error) {
      console.error('Error initializing PageView tracker:', error);
    }
  }

  getData(): any {
    const currentTime = Date.now();
    const sessionDuration = currentTime - this.sessionStartTime;

    return {
      metrics: {
        ...this.metrics,
        averageTimeOnPage: this.calculateAverageTimeOnPage(),
        bounceRate: this.calculateBounceRate(),
        exitRate: this.calculateExitRate(),
      },
      currentPage: {
        ...this.currentPageData,
        visibility: {
          ...this.currentPageData.visibility,
          totalTime: currentTime - this.visibilityStart,
        },
        interactions: {
          ...this.currentPageData.interactions,
          totalInteractions: this.interactionCount,
        },
      },
      session: {
        duration: sessionDuration,
        pagesViewed: this.metrics.pages.length,
        uniquePages: this.uniquePageViews.size,
        averageTimePerPage: sessionDuration / this.metrics.pages.length,
        deepestScroll: Math.max(...Array.from(this.scrollPositions)),
      },
    };
  }

  cleanup(): void {
    try {
      // Clean up event listeners
      this.removeEventListeners();

      // Clean up performance observer
      if (this.observer) {
        this.observer.disconnect();
      }

      // Clear any pending timers
      if (this.scrollThrottleTimer) {
        clearTimeout(this.scrollThrottleTimer);
      }
      if (this.interactionThrottleTimer) {
        clearTimeout(this.interactionThrottleTimer);
      }

      // Track final page data
      this.trackPageExit();
    } catch (error) {
      console.error('Error cleaning up PageView tracker:', error);
    }
  }

  private setupEventListeners(): void {
    // Use passive listeners for better performance
    const options = { passive: true };

    window.addEventListener('scroll', this.handleScroll, options);
    window.addEventListener('click', this.handleInteraction, options);
    window.addEventListener('keydown', this.handleInteraction, options);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('beforeunload', this.handlePageExit);
  }

  private removeEventListeners(): void {
    window.removeEventListener('scroll', this.handleScroll);
    window.removeEventListener('click', this.handleInteraction);
    window.removeEventListener('keydown', this.handleInteraction);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('beforeunload', this.handlePageExit);
  }

  private setupPerformanceTracking(): void {
    if ('PerformanceObserver' in window) {
      try {
        this.observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          this.updatePerformanceMetrics(entries);
        });

        this.observer.observe({
          entryTypes: ['navigation', 'resource', 'paint'],
        });
      } catch (error) {
        console.warn('PerformanceObserver not supported:', error);
      }
    }
  }

  private handleScroll = (() => {
    let lastScrollY = window.scrollY;
    let scrollTimeout: NodeJS.Timeout | null = null;

    return (event: Event): void => {
      if (this.scrollThrottleTimer) return;

      this.scrollThrottleTimer = setTimeout(() => {
        const currentScrollY = window.scrollY;
        const scrollDepth = this.calculateScrollDepth();
        this.scrollPositions.add(scrollDepth);

        // Update metrics only if significant scroll occurred
        if (Math.abs(currentScrollY - lastScrollY) > 50) {
          this.currentPageData.interactions.scrolls++;
          this.interactionCount++;
          lastScrollY = currentScrollY;
        }

        if (scrollTimeout) {
          clearTimeout(scrollTimeout);
        }

        // Track scroll stop after 150ms of no scrolling
        scrollTimeout = setTimeout(() => {
          this.analytics.track('scroll', {
            depth: scrollDepth,
            timestamp: new Date().toISOString(),
          });
        }, 150);

        this.scrollThrottleTimer = null;
      }, this.SCROLL_THROTTLE);
    };
  })();

  private handleInteraction = (event: Event): void => {
    if (this.interactionThrottleTimer) return;

    this.interactionThrottleTimer = setTimeout(() => {
      this.interactionCount++;
      this.lastActivityTime = Date.now();
      this.isIdle = false;

      if (event.type === 'click') {
        this.currentPageData.interactions.clicks++;
      }

      this.interactionThrottleTimer = null;
    }, this.INTERACTION_THROTTLE);
  };

  private handleVisibilityChange = (): void => {
    const now = Date.now();
    const timeSinceLastChange = now - this.currentPageData.visibility.lastVisibilityChange;

    if (document.hidden) {
      this.currentPageData.visibility.visibleTime += timeSinceLastChange;
    } else {
      this.currentPageData.visibility.hiddenTime += timeSinceLastChange;
    }

    this.currentPageData.visibility.lastVisibilityChange = now;
  };

  private handlePageExit = (): void => {
    this.trackPageExit();
  };

  private checkIdleState = (): void => {
    const now = Date.now();
    const timeSinceLastActivity = now - this.lastActivityTime;

    if (timeSinceLastActivity >= this.IDLE_THRESHOLD && !this.isIdle) {
      this.isIdle = true;
      this.analytics.track('userIdle', {
        duration: timeSinceLastActivity,
        timestamp: new Date().toISOString(),
      });
    }
  };

  private trackPageView(): void {
    this.metrics.totalViews++;
    if (!this.uniquePageViews.has(window.location.href)) {
      this.uniquePageViews.add(window.location.href);
      this.metrics.uniqueViews++;
    }

    this.analytics.track('pageView', {
      url: window.location.href,
      title: document.title,
      referrer: document.referrer,
      timestamp: new Date().toISOString(),
    });
  }

  private trackPageExit(): void {
    const pageData = {
      ...this.currentPageData,
      timeOnPage: Date.now() - this.visibilityStart,
      scrollDepth: Math.max(...Array.from(this.scrollPositions)),
    };

    this.metrics.pages.push(pageData);

    this.analytics.track('pageExit', {
      ...pageData,
      timestamp: new Date().toISOString(),
    });
  }

  private calculateScrollDepth(): number {
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    const scrollTop = window.scrollY;
    return Math.round(((scrollTop + windowHeight) / documentHeight) * 100);
  }

  private updatePerformanceMetrics(entries: PerformanceEntry[]): void {
    entries.forEach((entry) => {
      if (entry.entryType === 'navigation') {
        const nav = entry as PerformanceNavigationTiming;
        this.currentPageData.performance.loadTime = nav.loadEventEnd - nav.startTime;
        this.currentPageData.performance.renderTime = nav.domComplete - nav.startTime;
      } else if (entry.entryType === 'resource') {
        this.currentPageData.performance.resourcesLoaded++;
      }
    });
  }

  private getPageContext(): EnhancedPageViewData['context'] {
    return {
      deviceType: this.getDeviceType(),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      connection: {
        type: (navigator as any).connection?.effectiveType || 'unknown',
        speed: (navigator as any).connection?.downlink || 0,
      },
      userAgent: navigator.userAgent,
    };
  }

  private getDeviceType(): string {
    const ua = navigator.userAgent;
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
      return 'tablet';
    }
    if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
      return 'mobile';
    }
    return 'desktop';
  }

  private calculateAverageTimeOnPage(): number {
    if (this.metrics.pages.length === 0) return 0;
    const totalTime = this.metrics.pages.reduce((sum, page) => sum + page.timeOnPage, 0);
    return Math.round(totalTime / this.metrics.pages.length);
  }

  private calculateBounceRate(): number {
    if (this.metrics.totalViews === 0) return 0;
    const bounces = this.metrics.pages.filter(page => page.interactions.totalInteractions === 0).length;
    return (bounces / this.metrics.totalViews) * 100;
  }

  private calculateExitRate(): number {
    if (this.metrics.totalViews === 0) return 0;
    const exits = this.metrics.pages.filter(page => !page.referrer.includes(window.location.hostname)).length;
    return (exits / this.metrics.totalViews) * 100;
  }
}
