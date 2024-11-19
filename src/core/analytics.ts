import Analytics from 'analytics';
import type { AnalyticsConfig } from '../types';
import { BaseTracker } from './trackers/base';

interface AnalyticsInstanceConfig {
  app?: string;
  version?: string | number;
  debug?: boolean;
  plugins?: Record<string, unknown>[];
}

type ImportantEventType =
  | 'page_view'
  | 'session_start'
  | 'session_end'
  | 'user_interaction'
  | 'error'
  | 'conversion'
  | 'performance';

interface AnalyticsEvent {
  type: string;
  data: Record<string, any>;
  timestamp: number;
}

export class ThorbisAnalytics {
  private config: AnalyticsConfig;
  private analytics: any;
  private trackers: Map<string, BaseTracker> = new Map();
  private eventQueue: AnalyticsEvent[] = [];
  private flushTimeout: NodeJS.Timeout | null = null;
  private readonly maxBatchSize: number;
  private readonly flushInterval: number;
  private analyticsEvents: AnalyticsEvent[] = [];
  private startTime: number = Date.now();
  private lastActivityTime: number = Date.now();
  private isIdle: boolean = false;
  private readonly IDLE_THRESHOLD = 30000; // 30 seconds
  private webVitals: {
    cls: number | null;
    fid: number | null;
    lcp: number | null;
    fcp: number | null;
    ttfb: number | null;
  } = {
    cls: null,
    fid: null,
    lcp: null,
    fcp: null,
    ttfb: null,
  };

  constructor(config: AnalyticsConfig) {
    this.config = {
      ...config,
      debug: config.debug ?? true,
    };

    // Initialize analytics with proper config type and custom handlers
    const analyticsConfig: AnalyticsInstanceConfig = {
      app: 'thorbis-analytics',
      version: process.env.NEXT_PUBLIC_VERSION || '1.0.0',
      debug: this.config.debug,
      plugins: [
        {
          name: 'thorbis-plugin',
          page: ({ payload }: { payload?: any }) => {
            if (this.analyticsEvents && payload?.properties) {
              this.analyticsEvents.push({
                type: 'page_view',
                data: {
                  url: payload.properties.url,
                  referrer: payload.properties.referrer,
                  title: document.title,
                  timestamp: Date.now(),
                },
                timestamp: Date.now(),
              });
            }
          },
          track: ({ payload }: { payload?: any }) => {
            if (
              payload?.event &&
              this.isImportantEvent(payload.event) &&
              this.analyticsEvents
            ) {
              this.analyticsEvents.push({
                type: payload.event,
                data: {
                  ...payload.properties,
                  timestamp: Date.now(),
                },
                timestamp: Date.now(),
              });
            }
          },
        },
      ],
    };

    this.analytics = Analytics(analyticsConfig);

    // Default batch size of 10 events or flush every 5 seconds
    this.maxBatchSize = config.batchConfig?.maxBatchSize || 10;
    this.flushInterval = config.batchConfig?.flushInterval || 5000;

    // Add event listeners for session end
    if (typeof window !== 'undefined') {
      this.setupEventListeners();
    }
  }

  private setupEventListeners(): void {
    // Use passive listeners for better performance
    const options = { passive: true };

    window.addEventListener('beforeunload', this.handleSessionEnd, options);
    window.addEventListener(
      'visibilitychange',
      this.handleVisibilityChange,
      options
    );
    window.addEventListener('pagehide', this.handleSessionEnd, options);

    // Use requestIdleCallback for non-critical tasks
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(() => this.checkIdleState(), {
        timeout: 1000,
      });
    } else {
      setInterval(() => this.checkIdleState(), 1000);
    }
  }

  private checkIdleState = (): void => {
    const now = Date.now();
    if (now - this.lastActivityTime > this.IDLE_THRESHOLD && !this.isIdle) {
      this.isIdle = true;
      this.analytics.track('userIdle', {
        duration: now - this.lastActivityTime,
        timestamp: new Date().toISOString(),
      });
    }
  };

  public async init(): Promise<void> {
    try {
      if (!this.config.debug) return;

      // Prevent multiple initializations
      if (this.trackers.size > 0) {
        console.warn('Analytics already initialized');
        return;
      }

      console.log('\n🚀 Initializing Thorbis Analytics\n');

      // Initialize trackers using dynamic imports for better performance
      await this.initializeTrackers();

      console.log(
        '\n✅ Active Trackers:',
        Array.from(this.trackers.keys()).join(', '),
        '\n'
      );
    } catch (error) {
      console.error('❌ Analytics initialization failed:', error);
      throw error;
    }
  }

  private async initializeTrackers(): Promise<void> {
    const trackerModules = {
      demographics: () =>
        this.config.options?.demographics && import('./trackers/demographics'),
      engagement: () =>
        this.config.options?.engagement && import('./trackers/engagement'),
      error: () => this.config.options?.error && import('./trackers/error'),
      forms: () => this.config.options?.forms && import('./trackers/forms'),
      media: () => this.config.options?.media && import('./trackers/media'),
      navigation: () =>
        this.config.options?.navigation && import('./trackers/navigation'),
      pageViews: () =>
        this.config.options?.pageViews && import('./trackers/pageViews'),
      performance: () =>
        this.config.options?.performance && import('./trackers/performance'),
      project: () =>
        this.config.options?.project && import('./trackers/project'),
      search: () => this.config.options?.search && import('./trackers/search'),
      session: () => true && import('./trackers/session'),
      seo: () => this.config.options?.seo && import('./trackers/seo'),
    };

    const initPromises = Object.entries(trackerModules).map(
      async ([name, loader]) => {
        try {
          const shouldLoad = await loader();
          if (shouldLoad) {
            const module = await shouldLoad;
            const TrackerClass = Object.values(module)[0];
            const tracker = new TrackerClass(this.analytics);
            this.trackers.set(name, tracker);
            await tracker.init();
            if (this.config.debug) {
              console.log(`⚙️  Loaded ${name}`);
            }
          }
        } catch (error) {
          console.warn(`Failed to load ${name} tracker:`, error);
        }
      }
    );

    await Promise.all(initPromises);
  }

  private handleSessionEnd = async (event: Event): Promise<void> => {
    const payload = await this.collectSessionData();

    if (event.type === 'beforeunload') {
      // Use sendBeacon for better reliability during page unload
      const blob = new Blob([JSON.stringify(payload)], {
        type: 'application/json',
      });
      navigator.sendBeacon('/api/events', blob);
      return;
    }

    // For other cases, use fetch with keepalive
    try {
      await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      });

      if (this.config.debug) {
        console.log('📊 Session ended:', {
          sessionId: this.config.sessionId,
          duration: payload.session.duration,
          events: payload.session.events.length,
        });
      }
    } catch (error) {
      console.error('Failed to send session data:', error);
    }
  };

  private handleVisibilityChange = async (): Promise<void> => {
    if (document.visibilityState === 'hidden') {
      await this.handleSessionEnd(new Event('visibilitychange'));
    }
  };

  private async collectSessionData(): Promise<any> {
    const trackerData = await this.collectAllTrackerData();

    return {
      sessionId: this.config.sessionId,
      timestamp: Date.now(),
      type: 'session_end',
      metadata: this.getMetadata(),
      session: {
        id: this.config.sessionId,
        startTime: this.startTime,
        endTime: Date.now(),
        duration: Date.now() - this.startTime,
        events: this.analyticsEvents,
        data: trackerData,
      },
    };
  }

  private getMetadata(): Record<string, any> {
    return {
      url: window.location.href,
      userAgent: navigator.userAgent,
      screenSize: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      device: {
        platform: navigator.platform,
        language: navigator.language,
        connection:
          'connection' in navigator
            ? {
                type: (navigator as any).connection?.effectiveType,
                downlink: (navigator as any).connection?.downlink,
              }
            : null,
        screen: {
          width: window.screen.width,
          height: window.screen.height,
          colorDepth: window.screen.colorDepth,
          orientation: window.screen.orientation.type,
        },
      },
    };
  }

  private async collectAllTrackerData(): Promise<Record<string, any>> {
    const data: Record<string, any> = {};

    for (const [name, tracker] of this.trackers) {
      try {
        data[name] = await Promise.resolve(tracker.getData());
      } catch (error) {
        console.warn(`Failed to collect data from ${name} tracker:`, error);
        data[name] = null;
      }
    }

    return data;
  }

  private isImportantEvent(eventType: string): boolean {
    const importantEvents: ImportantEventType[] = [
      'page_view',
      'session_start',
      'session_end',
      'user_interaction',
      'error',
      'conversion',
      'performance',
    ];
    return importantEvents.includes(eventType as ImportantEventType);
  }

  public cleanup(): void {
    // Clear any pending timeouts
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
    }

    // Remove event listeners
    window.removeEventListener('beforeunload', this.handleSessionEnd);
    window.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('pagehide', this.handleSessionEnd);

    // Cleanup all trackers
    this.trackers.forEach((tracker) => {
      try {
        tracker.cleanup();
      } catch (error) {
        console.warn('Error cleaning up tracker:', error);
      }
    });

    // Clear all data
    this.trackers.clear();
    this.eventQueue = [];
    this.analyticsEvents = [];
  }
}

export type { AnalyticsConfig };
