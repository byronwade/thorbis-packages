import { BaseTracker } from './base';

interface PerformanceMetrics {
  fcp: number;
  lcp: number;
  fid: number;
  cls: number;
  ttfb: number;
  domLoad: number;
  windowLoad: number;
  resources: Array<{
    name: string;
    duration: number;
    size: number;
    type: string;
  }>;
}

// Add custom type definitions for Web Vitals
interface LayoutShiftEntry extends PerformanceEntry {
  value: number;
  hadRecentInput: boolean;
}

interface FirstInputEntry extends PerformanceEntry {
  processingStart: number;
}

interface ResourceEntry extends PerformanceResourceTiming {
  initiatorType: string;
}

export class PerformanceTracker extends BaseTracker {
  private metrics: Partial<PerformanceMetrics> = {};
  private observer: PerformanceObserver | null = null;

  async init() {
    if (typeof window === 'undefined') return;

    this.trackNavigationTiming();
    this.trackWebVitals();
    this.trackResourceTiming();

    this.log('Performance tracker initialized');
  }

  private trackNavigationTiming() {
    window.addEventListener('load', () => {
      const navigation = performance.getEntriesByType(
        'navigation'
      )[0] as PerformanceNavigationTiming;

      this.metrics.ttfb = navigation.responseStart - navigation.requestStart;
      this.metrics.domLoad =
        navigation.domContentLoadedEventEnd - navigation.requestStart;
      this.metrics.windowLoad =
        navigation.loadEventEnd - navigation.requestStart;

      this.analytics.track('performanceTiming', {
        ttfb: this.metrics.ttfb,
        domLoad: this.metrics.domLoad,
        windowLoad: this.metrics.windowLoad,
        timestamp: new Date().toISOString(),
      });
    });
  }

  private trackWebVitals() {
    // First Contentful Paint
    this.observePerformance(['paint'], (entries) => {
      for (const entry of entries) {
        if (entry.name === 'first-contentful-paint') {
          this.metrics.fcp = entry.startTime;
          this.analytics.track('webVital', {
            metric: 'FCP',
            value: entry.startTime,
            timestamp: new Date().toISOString(),
          });
        }
      }
    });

    // Largest Contentful Paint
    this.observePerformance(['largest-contentful-paint'], (entries) => {
      const lastEntry = entries.at(-1);
      if (lastEntry) {
        this.metrics.lcp = lastEntry.startTime;
        this.analytics.track('webVital', {
          metric: 'LCP',
          value: lastEntry.startTime,
          timestamp: new Date().toISOString(),
        });
      }
    });

    // First Input Delay
    this.observePerformance(['first-input'], (entries) => {
      const firstInput = entries[0] as FirstInputEntry;
      if (firstInput) {
        this.metrics.fid = firstInput.processingStart - firstInput.startTime;
        this.analytics.track('webVital', {
          metric: 'FID',
          value: this.metrics.fid,
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Layout Shifts
    this.observePerformance(['layout-shift'], (entries) => {
      let cumulativeScore = 0;
      for (const entry of entries) {
        const layoutShift = entry as LayoutShiftEntry;
        if (!layoutShift.hadRecentInput) {
          cumulativeScore += layoutShift.value;
        }
      }

      this.metrics.cls = cumulativeScore;
      this.analytics.track('webVital', {
        metric: 'CLS',
        value: cumulativeScore,
        timestamp: new Date().toISOString(),
      });
    });
  }

  private trackResourceTiming() {
    this.observePerformance(['resource'], (entries) => {
      const resources = entries.map((entry) => {
        const resource = entry as ResourceEntry;
        return {
          name: resource.name,
          duration: resource.duration,
          size: resource.transferSize,
          type: resource.initiatorType,
        };
      });

      this.metrics.resources = resources;
      this.analytics.track('resourceTiming', {
        resources,
        timestamp: new Date().toISOString(),
      });
    });
  }

  private observePerformance(
    entryTypes: string[],
    callback: (entries: PerformanceEntry[]) => void
  ) {
    try {
      this.observer = new PerformanceObserver((list) =>
        callback(list.getEntries())
      );
      this.observer.observe({ entryTypes });
    } catch (error) {
      this.log(`Failed to observe ${entryTypes.join(', ')}`, error);
    }
  }

  cleanup() {
    if (this.observer) {
      this.observer.disconnect();
    }

    this.analytics.track('performanceReport', {
      ...this.metrics,
      timestamp: new Date().toISOString(),
    });
  }
}
