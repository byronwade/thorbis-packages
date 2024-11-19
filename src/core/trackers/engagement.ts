import { BaseTracker } from './base';

interface HeatmapPoint {
  x: number;
  y: number;
  value: number; // Intensity/weight
  timestamp: number;
  elementInfo?: {
    tag: string;
    id?: string;
    classes: string[];
    text?: string;
    path: string;
    dimensions: DOMRect;
    zIndex: number;
    visibility: number;
  };
}

interface EngagementMetrics {
  interactions: {
    clicks: Array<{
      timestamp: string;
      elementId: string;
      elementType: string;
      position: { x: number; y: number };
      context: {
        nearestHeading?: string;
        section?: string;
        text?: string;
      };
    }>;
    rageClicks: Array<{
      timestamp: string;
      elementId: string;
      clickCount: number;
      position: { x: number; y: number };
    }>;
    hovers: Array<{
      timestamp: string;
      duration: number;
      elementType: string;
      elementPath: string;
      position: { x: number; y: number };
      content: string;
      context: {
        nearestHeading?: string;
        section?: string;
      };
    }>;
    textSelections: Array<{
      timestamp: string;
      text: string;
      elementType: string;
      elementPath: string;
      selectionLength: number;
      duration: number;
      context: {
        paragraph?: string;
        nearestHeading?: string;
        section?: string;
      };
      metrics: {
        wordsSelected: number;
        selectionSpeed: number;
        readingTime: number;
        copied: boolean;
      };
    }>;
  };
  attention: {
    zones: Array<{
      selector: string;
      timeSpent: number;
      interactions: number;
      visibility: number;
    }>;
  };
  scrolling: {
    depths: Array<{
      percentage: number;
      timestamp: string;
      dwellTime: number;
    }>;
    milestones: Array<{
      depth: number;
      timestamp: string;
      timeToReach: number;
    }>;
  };
  timing: {
    totalTime: number;
    activeTime: number;
    idleTime: number;
  };
  heatmap: {
    clicks: HeatmapPoint[];
    moves: HeatmapPoint[];
    hovers: HeatmapPoint[];
    scrollDepth: {
      max: number;
      distribution: { [key: string]: number };
      timestamps: Array<{ depth: number; timestamp: number }>;
    };
    rageClicks: Array<{
      points: HeatmapPoint[];
      count: number;
      timestamp: number;
      element: string;
    }>;
    visualization: {
      points: Array<{ x: number; y: number; value: number }>;
      config: {
        width: number;
        height: number;
        maxIntensity: number;
        minIntensity: number;
      };
    };
  };
}

interface HeatmapData {
  viewport: {
    width: number;
    height: number;
    scrollHeight: number;
    scrollWidth: number;
  };
  interactions: {
    clicks: Array<{
      x: number;
      y: number;
      value: number; // Intensity
      timestamp: number;
      elementInfo?: {
        tag: string;
        id?: string;
        classes: string[];
        text?: string;
        path: string;
      };
    }>;
    moves: Array<{
      x: number;
      y: number;
      value: number;
      timestamp: number;
    }>;
    hovers: Array<{
      x: number;
      y: number;
      duration: number;
      value: number;
      timestamp: number;
      elementInfo?: {
        tag: string;
        text?: string;
        path: string;
      };
    }>;
    rageClicks: Array<{
      x: number;
      y: number;
      count: number;
      timestamp: number;
      element: string;
    }>;
  };
  visualization: {
    points: Array<{
      x: number; // Normalized 0-100
      y: number; // Normalized 0-100
      value: number; // 0-1
      type: 'click' | 'move' | 'hover';
    }>;
    config: {
      width: number;
      height: number;
      maxIntensity: number;
      minIntensity: number;
      radius: number;
    };
    segments: {
      hotspots: Array<{
        x: number;
        y: number;
        radius: number;
        intensity: number;
        elements: string[];
      }>;
      coldspots: Array<{
        x: number;
        y: number;
        width: number;
        height: number;
      }>;
    };
  };
}

export class EngagementTracker extends BaseTracker {
  private metrics: EngagementMetrics;
  private moveThrottleTimer: NodeJS.Timeout | null = null;
  private observer: IntersectionObserver | null = null;
  private lastPosition = { x: 0, y: 0, timestamp: 0 };
  private readonly INTERACTION_THRESHOLDS = {
    hover: 500, // ms
    rageClick: {
      interval: 500,
      threshold: 3,
      timeout: 1000,
    },
    intensity: {
      decay: 0.95,
      moveThrottle: 50,
      radius: 50, // pixels
    },
  };

  constructor(analytics: any) {
    super(analytics);
    this.metrics = this.initializeMetrics();
    if (typeof window !== 'undefined') {
      this.setupEventListeners();
    }
  }

  private initializeMetrics(): EngagementMetrics {
    return {
      interactions: {
        clicks: [],
        rageClicks: [],
        hovers: [],
        textSelections: [],
      },
      attention: {
        zones: [],
      },
      scrolling: {
        depths: [],
        milestones: [],
      },
      timing: {
        totalTime: 0,
        activeTime: 0,
        idleTime: 0,
      },
      heatmap: {
        clicks: [],
        moves: [],
        hovers: [],
        scrollDepth: {
          max: 0,
          distribution: {},
          timestamps: [],
        },
        rageClicks: [],
        visualization: {
          points: [],
          config: {
            width: typeof window !== 'undefined' ? window.innerWidth : 0,
            height: typeof window !== 'undefined' ? window.innerHeight : 0,
            maxIntensity: 0,
            minIntensity: 0,
          },
        },
      },
    };
  }

  private setupEventListeners(): void {
    try {
      // Use passive event listeners for better performance
      const options = { passive: true };

      window.addEventListener('click', this.handleClick, options);
      window.addEventListener('mousemove', this.handleMouseMove, options);
      window.addEventListener('scroll', this.handleScroll, options);
      window.addEventListener('resize', this.handleResize, options);
      document.addEventListener('selectionchange', this.handleTextSelection);
      document.addEventListener('copy', this.handleCopy);

      // Set up attention tracking with IntersectionObserver
      this.setupAttentionTracking();

      // Set up performance monitoring
      this.setupPerformanceMonitoring();
    } catch (error) {
      console.warn('Error setting up event listeners:', error);
    }
  }

  private setupPerformanceMonitoring(): void {
    if ('PerformanceObserver' in window) {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.entryType === 'longtask') {
              // Log long tasks that might affect interaction
              console.warn('Long task detected:', entry.duration);
            }
          }
        });

        observer.observe({ entryTypes: ['longtask'] });
      } catch (error) {
        console.warn('Performance monitoring not supported:', error);
      }
    }
  }

  private handleClick = (event: MouseEvent): void => {
    try {
      const target = event.target;
      if (!target || !(target instanceof Element)) return;

      const now = Date.now();
      const point = this.createInteractionPoint(event, target, 1.0);

      // Use requestAnimationFrame for visual updates
      requestAnimationFrame(() => {
        this.updateMetrics(point, target as Element);
      });

      // Track analytics asynchronously
      setTimeout(() => {
        this.trackAnalytics('click', point);
      }, 0);
    } catch (error) {
      console.warn('Error handling click:', error);
    }
  };

  private handleMouseMove = (() => {
    let rafId: number;
    let lastProcessedTime = 0;
    const THROTTLE = 50; // ms

    return (event: MouseEvent): void => {
      try {
        const now = Date.now();
        if (now - lastProcessedTime < THROTTLE) return;

        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          const target = event.target;
          if (!target || !(target instanceof Element)) return;

          const point = this.createInteractionPoint(event, target, 0.3);
          this.updateMetrics(point, target);
          lastProcessedTime = now;
        });
      } catch (error) {
        console.warn('Error handling mouse move:', error);
      }
    };
  })();

  private createInteractionPoint(
    event: MouseEvent,
    target: Element,
    intensity: number
  ): InteractionPoint {
    return {
      x: event.pageX,
      y: event.pageY,
      value: this.calculateIntensity(event.pageX, event.pageY, intensity),
      timestamp: Date.now(),
      elementInfo: this.getElementInfo(target),
    };
  }

  private getElementInfo(element: Element): ElementInfo {
    return {
      tag: element.tagName.toLowerCase(),
      id: element.id || undefined,
      classes: Array.from(element.classList),
      text: element.textContent?.slice(0, 100),
      path: this.getElementPath(element),
      dimensions: element.getBoundingClientRect(),
      zIndex: parseInt(window.getComputedStyle(element).zIndex) || 0,
      visibility: this.calculateElementVisibility(element),
    };
  }

  private updateMetrics(point: InteractionPoint, target: Element): void {
    // Update metrics in a single batch
    const updates = {
      heatmap: this.updateHeatmap(point),
      attention: this.updateAttention(target),
      interactions: this.updateInteractions(point, target),
    };

    Object.assign(this.metrics, updates);
  }

  private trackAnalytics(type: string, data: any): void {
    if (this.analytics?.track) {
      try {
        this.analytics.track(`engagement_${type}`, {
          ...data,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.warn('Error tracking analytics:', error);
      }
    }
  }

  cleanup(): void {
    try {
      if (this.moveThrottleTimer) {
        clearTimeout(this.moveThrottleTimer);
      }
      if (this.observer) {
        this.observer.disconnect();
      }

      const options = { passive: true };
      window.removeEventListener('click', this.handleClick, options);
      window.removeEventListener('mousemove', this.handleMouseMove, options);
      window.removeEventListener('scroll', this.handleScroll, options);
      window.removeEventListener('resize', this.handleResize, options);
      document.removeEventListener('selectionchange', this.handleTextSelection);
      document.removeEventListener('copy', this.handleCopy);
    } catch (error) {
      console.warn('Error during cleanup:', error);
    }
  }
}
