import { BaseTracker } from './base';

interface PerformanceMetrics {
  timing: {
    loadTime: number;
    domInteractive: number;
    domComplete: number;
    ttfb: number;
    domLoad: number;
    windowLoad: number;
    fcp: number;
    lcp: number;
    fid: number;
    cls: number;
    inp: number;
    tbt: number;
  };
  resources: Array<{
    name: string;
    type: string;
    duration: number;
    size: number;
    protocol: string;
    priority?: string;
    status?: number;
    initiator?: string;
    cached?: boolean;
  }>;
  memory?: {
    jsHeapSizeLimit: number;
    totalJSHeapSize: number;
    usedJSHeapSize: number;
    gcTime?: number;
  };
  network: {
    effectiveType?: string;
    downlink?: number;
    rtt?: number;
    saveData?: boolean;
  };
  paint: {
    firstPaint: number;
    firstContentfulPaint: number;
    largestContentfulPaint?: number;
  };
  interactivity: {
    firstInputDelay?: number;
    totalBlockingTime: number;
    cumulativeLayoutShift: number;
    interactionToNextPaint?: number;
  };
  errors: Array<{
    type: string;
    count: number;
    timestamp: number;
  }>;
}

interface FirstInputEntry extends PerformanceEntry {
  processingStart: number;
  startTime: number;
}

interface LayoutShiftEntry extends PerformanceEntry {
  value: number;
  hadRecentInput: boolean;
}

interface ResourceEntry extends PerformanceResourceTiming {
  initiatorType: string;
  transferSize: number;
  nextHopProtocol: string;
}

export class PerformanceTracker extends BaseTracker {
  private metrics: PerformanceMetrics = {
    timing: {
      loadTime: 0,
      domInteractive: 0,
      domComplete: 0,
      ttfb: 0,
      domLoad: 0,
      windowLoad: 0,
      fcp: 0,
      lcp: 0,
      fid: 0,
      cls: 0,
      inp: 0,
      tbt: 0,
    },
    resources: [],
    network: {},
    paint: {
      firstPaint: 0,
      firstContentfulPaint: 0,
    },
    interactivity: {
      totalBlockingTime: 0,
      cumulativeLayoutShift: 0,
    },
    errors: [],
  };

  private observers: Map<string, PerformanceObserver> = new Map();
  private clsEntries: LayoutShiftEntry[] = [];
  private longTasksStartTime: number = 0;
  private readonly MAX_CLS_ENTRIES = 100;
  private readonly LONG_TASK_THRESHOLD = 50; // ms
  private readonly RESOURCE_TIMING_BUFFER_SIZE = 150;

  async init(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      // Initialize performance tracking
      this.setupPerformanceObservers();
      this.trackNavigationTiming();
      this.trackNetworkInfo();
      this.trackMemoryUsage();
      this.setupResourceTimingBuffer();

      // Track initial page load
      this.trackInitialLoad();

      this.log('Performance tracker initialized');
    } catch (error) {
      console.warn('Error initializing performance tracker:', error);
    }
  }

  getData(): any {
    return {
      ...this.metrics,
      summary: {
        pageLoad: {
          total: this.metrics.timing.loadTime,
          interactive: this.metrics.timing.domInteractive,
          complete: this.metrics.timing.domComplete,
        },
        resources: {
          total: this.metrics.resources.length,
          size: this.calculateTotalResourceSize(),
          types: this.getResourceTypeBreakdown(),
          cached: this.getCachedResourcesCount(),
        },
        performance: {
          score: this.calculatePerformanceScore(),
          issues: this.findPerformanceIssues(),
          recommendations: this.generateRecommendations(),
        },
      },
    };
  }

  private setupPerformanceObservers(): void {
    if (!('PerformanceObserver' in window)) return;

    const observerConfig: Record<
      string,
      (entries: PerformanceObserverEntryList) => void
    > = {
      paint: this.handlePaintEntries.bind(this),
      'largest-contentful-paint': this.handleLCPEntries.bind(this),
      'first-input': this.handleFIDEntries.bind(this),
      'layout-shift': this.handleCLSEntries.bind(this),
      longtask: this.handleLongTaskEntries.bind(this),
      resource: this.handleResourceEntries.bind(this),
      navigation: this.handleNavigationEntries.bind(this),
    };

    Object.entries(observerConfig).forEach(([type, callback]) => {
      try {
        const observer = new PerformanceObserver((list) => {
          callback(list);
        });
        observer.observe({ entryTypes: [type] });
        this.observers.set(type, observer);
      } catch (error) {
        console.warn(`Failed to observe ${type}:`, error);
      }
    });
  }

  private handlePaintEntries(entries: PerformanceObserverEntryList): void {
    entries.getEntries().forEach((entry) => {
      if (entry.name === 'first-paint') {
        this.metrics.paint.firstPaint = entry.startTime;
      } else if (entry.name === 'first-contentful-paint') {
        this.metrics.paint.firstContentfulPaint = entry.startTime;
      }
    });
  }

  private handleLCPEntries(entries: PerformanceObserverEntryList): void {
    const lastEntry = entries.getEntries().at(-1);
    if (lastEntry) {
      this.metrics.paint.largestContentfulPaint = lastEntry.startTime;
    }
  }

  private handleFIDEntries(entries: PerformanceObserverEntryList): void {
    entries.getEntries().forEach((entry) => {
      const firstInput = entry as FirstInputEntry;
      this.metrics.interactivity.firstInputDelay =
        firstInput.processingStart - firstInput.startTime;
    });
  }

  private handleCLSEntries(entries: PerformanceObserverEntryList): void {
    entries.getEntries().forEach((entry) => {
      const layoutShift = entry as LayoutShiftEntry;
      if (!layoutShift.hadRecentInput) {
        this.clsEntries.push(layoutShift);
        if (this.clsEntries.length > this.MAX_CLS_ENTRIES) {
          this.clsEntries.shift();
        }
        this.updateCLS();
      }
    });
  }

  private handleLongTaskEntries(entries: PerformanceObserverEntryList): void {
    entries.getEntries().forEach((entry) => {
      if (entry.duration > this.LONG_TASK_THRESHOLD) {
        this.metrics.interactivity.totalBlockingTime +=
          entry.duration - this.LONG_TASK_THRESHOLD;
      }
    });
  }

  private handleResourceEntries(entries: PerformanceObserverEntryList): void {
    entries.getEntries().forEach((entry) => {
      const resource = entry as ResourceEntry;
      this.metrics.resources.push({
        name: resource.name,
        type: resource.initiatorType,
        duration: resource.duration,
        size: resource.transferSize,
        protocol: resource.nextHopProtocol,
        cached: resource.transferSize === 0,
        status: (resource as any).responseStatus,
      });
    });
  }

  private handleNavigationEntries(entries: PerformanceObserverEntryList): void {
    const navigation = entries.getEntries()[0] as PerformanceNavigationTiming;
    if (!navigation) return;

    this.metrics.timing = {
      ...this.metrics.timing,
      ttfb: navigation.responseStart - navigation.requestStart,
      domLoad: navigation.domContentLoadedEventEnd - navigation.startTime,
      windowLoad: navigation.loadEventEnd - navigation.startTime,
      domInteractive: navigation.domInteractive - navigation.startTime,
      domComplete: navigation.domComplete - navigation.startTime,
      loadTime: navigation.loadEventEnd - navigation.startTime,
    };
  }

  private trackNavigationTiming(): void {
    if (!performance.getEntriesByType) return;

    const navigation = performance.getEntriesByType(
      'navigation'
    )[0] as PerformanceNavigationTiming;
    if (!navigation) return;

    this.metrics.timing = {
      ...this.metrics.timing,
      ttfb: navigation.responseStart - navigation.requestStart,
      domLoad: navigation.domContentLoadedEventEnd - navigation.startTime,
      windowLoad: navigation.loadEventEnd - navigation.startTime,
      domInteractive: navigation.domInteractive - navigation.startTime,
      domComplete: navigation.domComplete - navigation.startTime,
      loadTime: navigation.loadEventEnd - navigation.startTime,
    };
  }

  private trackNetworkInfo(): void {
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      this.metrics.network = {
        effectiveType: connection?.effectiveType,
        downlink: connection?.downlink,
        rtt: connection?.rtt,
        saveData: connection?.saveData,
      };
    }
  }

  private trackMemoryUsage(): void {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      this.metrics.memory = {
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
        totalJSHeapSize: memory.totalJSHeapSize,
        usedJSHeapSize: memory.usedJSHeapSize,
      };
    }
  }

  private setupResourceTimingBuffer(): void {
    if ('performance' in window) {
      const setResourceTimingBufferSize = () => {
        performance.setResourceTimingBufferSize(
          this.RESOURCE_TIMING_BUFFER_SIZE
        );
      };

      // Set initial buffer size
      setResourceTimingBufferSize();

      // Clear buffer when it's nearly full
      performance.onresourcetimingbufferfull = () => {
        performance.clearResourceTimings();
        setResourceTimingBufferSize();
      };
    }
  }

  private trackInitialLoad(): void {
    window.addEventListener('load', () => {
      this.trackNavigationTiming();
      this.trackNetworkInfo();
      this.trackMemoryUsage();

      // Track in analytics
      this.analytics.track('pageLoad', {
        timing: this.metrics.timing,
        network: this.metrics.network,
        memory: this.metrics.memory,
        timestamp: new Date().toISOString(),
      });
    });
  }

  private updateCLS(): void {
    let maxSessionValue = 0;
    let currentSessionValue = 0;
    let currentSessionStartTime = 0;

    this.clsEntries.forEach((entry) => {
      if (currentSessionStartTime === 0) {
        currentSessionStartTime = entry.startTime;
      }

      // Check if this entry is part of the current session or a new one
      const gap = entry.startTime - currentSessionStartTime;
      if (gap > 1000 || gap < 0) {
        maxSessionValue = Math.max(maxSessionValue, currentSessionValue);
        currentSessionValue = entry.value;
        currentSessionStartTime = entry.startTime;
      } else {
        currentSessionValue += entry.value;
      }
    });

    this.metrics.interactivity.cumulativeLayoutShift = Math.max(
      maxSessionValue,
      currentSessionValue
    );
  }

  private calculateTotalResourceSize(): number {
    return this.metrics.resources.reduce(
      (total, resource) => total + (resource.size || 0),
      0
    );
  }

  private getResourceTypeBreakdown(): Record<string, number> {
    return this.metrics.resources.reduce((acc, resource) => {
      acc[resource.type] = (acc[resource.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private getCachedResourcesCount(): number {
    return this.metrics.resources.filter((r) => r.cached).length;
  }

  private calculatePerformanceScore(): number {
    const weights = {
      lcp: 0.25,
      fid: 0.25,
      cls: 0.15,
      ttfb: 0.15,
      tbt: 0.2,
    };

    const scores = {
      lcp: this.scoreLCP(this.metrics.timing.lcp),
      fid: this.scoreFID(this.metrics.interactivity.firstInputDelay || 0),
      cls: this.scoreCLS(this.metrics.interactivity.cumulativeLayoutShift),
      ttfb: this.scoreTTFB(this.metrics.timing.ttfb),
      tbt: this.scoreTBT(this.metrics.interactivity.totalBlockingTime),
    };

    return Object.entries(weights).reduce(
      (score, [metric, weight]) =>
        score + scores[metric as keyof typeof scores] * weight,
      0
    );
  }

  private scoreLCP(lcp: number): number {
    if (lcp <= 2500) return 1;
    if (lcp <= 4000) return 0.5;
    return 0;
  }

  private scoreFID(fid: number): number {
    if (fid <= 100) return 1;
    if (fid <= 300) return 0.5;
    return 0;
  }

  private scoreCLS(cls: number): number {
    if (cls <= 0.1) return 1;
    if (cls <= 0.25) return 0.5;
    return 0;
  }

  private scoreTTFB(ttfb: number): number {
    if (ttfb <= 800) return 1;
    if (ttfb <= 1800) return 0.5;
    return 0;
  }

  private scoreTBT(tbt: number): number {
    if (tbt <= 200) return 1;
    if (tbt <= 600) return 0.5;
    return 0;
  }

  private findPerformanceIssues(): string[] {
    const issues: string[] = [];

    if (this.metrics.timing.lcp > 2500) {
      issues.push('Slow Largest Contentful Paint');
    }
    if (
      this.metrics.interactivity.firstInputDelay &&
      this.metrics.interactivity.firstInputDelay > 100
    ) {
      issues.push('High First Input Delay');
    }
    if (this.metrics.interactivity.cumulativeLayoutShift > 0.1) {
      issues.push('High Cumulative Layout Shift');
    }
    if (this.metrics.timing.ttfb > 800) {
      issues.push('Slow Time to First Byte');
    }
    if (this.metrics.interactivity.totalBlockingTime > 300) {
      issues.push('High Total Blocking Time');
    }

    const largeResources = this.metrics.resources.filter(
      (r) => r.size > 1000000
    );
    if (largeResources.length > 0) {
      issues.push(`${largeResources.length} resources over 1MB`);
    }

    return issues;
  }

  private generateRecommendations(): string[] {
    const recommendations: string[] = [];

    if (this.metrics.timing.lcp > 2500) {
      recommendations.push('Optimize Largest Contentful Paint element');
    }
    if (this.metrics.interactivity.totalBlockingTime > 300) {
      recommendations.push('Reduce JavaScript execution time');
    }
    if (this.metrics.interactivity.cumulativeLayoutShift > 0.1) {
      recommendations.push(
        'Prevent layout shifts by setting dimensions for images and embeds'
      );
    }
    if (this.metrics.timing.ttfb > 800) {
      recommendations.push('Improve server response time');
    }

    const uncachedResources = this.metrics.resources.filter((r) => !r.cached);
    if (uncachedResources.length > 0) {
      recommendations.push('Implement proper caching strategies');
    }

    return recommendations;
  }

  cleanup(): void {
    this.observers.forEach((observer) => observer.disconnect());
    this.observers.clear();
    this.clsEntries = [];
  }
}
