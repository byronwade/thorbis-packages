import Analytics from 'analytics';
import type { AnalyticsConfig } from '../types';
import { BaseTracker } from './trackers/base';

// Define the Analytics configuration type
interface AnalyticsInstanceConfig {
  app?: string;
  version?: string | number;
  debug?: boolean;
  plugins?: Record<string, unknown>[];
}

// Debug plugin to log all analytics events
const debugPlugin = {
  name: 'debug-plugin',
  page: ({ payload }: any) => {
    console.log('📄 Page View:', payload);
  },
  track: ({ payload }: any) => {
    console.log('🔍 Track Event:', payload);
  },
  identify: ({ payload }: any) => {
    console.log('👤 Identify:', payload);
  },
};

export class ThorbisAnalytics {
  private config: AnalyticsConfig;
  private analytics: any;
  private eventBuffer: any[] = [];
  private readonly API_ENDPOINT = 'https://thorbis.com/api/events';
  private trackers: Map<string, BaseTracker> = new Map();

  constructor(config: AnalyticsConfig) {
    this.config = {
      ...config,
      debug: config.debug ?? true,
    };

    // Initialize analytics with proper config type
    const analyticsConfig: AnalyticsInstanceConfig = {
      app: 'thorbis-analytics',
      version: process.env.NEXT_PUBLIC_VERSION || '1.0.0',
      debug: this.config.debug,
      plugins: [debugPlugin],
    };

    this.analytics = Analytics(analyticsConfig);
  }

  async init() {
    try {
      console.group('🚀 Thorbis Analytics Initialization');
      console.log('Starting initialization...');

      // Initialize SEO and Project trackers first and await their completion
      if (this.config.options?.project) {
        console.group('📊 Project Analysis');
        const { ProjectTracker } = await import('./trackers/project');
        const projectTracker = new ProjectTracker(this.analytics);
        this.trackers.set('project', projectTracker);
        await projectTracker.init();
        console.groupEnd();
      }

      if (this.config.options?.seo) {
        console.group('🔍 SEO Analysis');
        const { SEOTracker } = await import('./trackers/seo');
        const seoTracker = new SEOTracker(this.analytics);
        this.trackers.set('seo', seoTracker);
        await seoTracker.init();
        console.groupEnd();
      }

      // Initialize other trackers
      const enabledTrackers: [string, BaseTracker][] = [];

      if (this.config.options?.pageViews) {
        const { PageViewTracker } = await import('./trackers/pageViews');
        enabledTrackers.push(['pageView', new PageViewTracker(this.analytics)]);
      }

      if (this.config.options?.navigation) {
        const { NavigationTracker } = await import('./trackers/navigation');
        enabledTrackers.push([
          'navigation',
          new NavigationTracker(this.analytics),
        ]);
      }

      if (this.config.options?.engagement) {
        const { EngagementTracker } = await import('./trackers/engagement');
        enabledTrackers.push([
          'engagement',
          new EngagementTracker(this.analytics),
        ]);
      }

      if (this.config.options?.forms) {
        const { FormsTracker } = await import('./trackers/forms');
        enabledTrackers.push(['forms', new FormsTracker(this.analytics)]);
      }

      // Initialize remaining trackers sequentially
      for (const [name, tracker] of enabledTrackers) {
        this.trackers.set(name, tracker);
        await tracker.init();
      }

      if (this.config.debug) {
        console.group('📊 Active Trackers');
        console.table(
          Array.from(this.trackers.keys()).map((name) => ({
            Tracker: name,
            Status: 'Active',
          }))
        );
        console.groupEnd();

        console.group('⚙️ Configuration');
        console.table(this.config);
        console.groupEnd();
      }

      console.groupEnd(); // End Analytics Initialization
    } catch (error) {
      console.error('❌ Analytics initialization failed:', error);
      throw error;
    }
  }

  // Use a more efficient event batching system
  private batchedEvents = new Map<string, any[]>();
  private batchTimeouts = new Map<string, NodeJS.Timeout>();
  private readonly BATCH_DELAY = 1000; // 1 second

  track(eventName: string, properties: any = {}, options: any = {}) {
    const { userId, anonymousId } = this.getUserData();
    const event = {
      ...properties,
      userId,
      anonymousId,
      timestamp: new Date().toISOString(),
      context: {
        page: {
          url: window.location.href,
          path: window.location.pathname,
          title: document.title,
          referrer: document.referrer,
        },
        ...options.context,
      },
    };

    // Add to batch
    const events = this.batchedEvents.get(eventName) || [];
    events.push(event);
    this.batchedEvents.set(eventName, events);

    // Clear existing timeout
    const existingTimeout = this.batchTimeouts.get(eventName);
    if (existingTimeout) clearTimeout(existingTimeout);

    // Set new timeout
    this.batchTimeouts.set(
      eventName,
      setTimeout(() => this.flushEventBatch(eventName), this.BATCH_DELAY)
    );
  }

  private async flushEventBatch(eventName: string) {
    const events = this.batchedEvents.get(eventName);
    if (!events?.length) return;

    try {
      await this.analytics.track(eventName, {
        events,
        count: events.length,
        batchId: crypto.randomUUID(),
      });
      this.batchedEvents.delete(eventName);
      this.batchTimeouts.delete(eventName);
    } catch (error) {
      console.error(`Failed to flush ${eventName} events:`, error);
    }
  }

  // Use a more memory-efficient cleanup
  async cleanup() {
    // Flush all batched events
    await Promise.all(
      Array.from(this.batchedEvents.keys()).map((eventName) =>
        this.flushEventBatch(eventName)
      )
    );

    // Cleanup trackers
    for (const tracker of this.trackers.values()) {
      tracker.cleanup();
    }

    this.trackers.clear();
    this.batchedEvents.clear();
    this.batchTimeouts.clear();
  }

  private getUserData() {
    const userId = localStorage.getItem('thorbis_user_id');
    const anonymousId =
      localStorage.getItem('thorbis_anonymous_id') || crypto.randomUUID();

    if (!userId && anonymousId) {
      localStorage.setItem('thorbis_anonymous_id', anonymousId);
    }

    return {
      userId: userId || null,
      anonymousId,
    };
  }
}

export type { AnalyticsConfig } from '../types';
