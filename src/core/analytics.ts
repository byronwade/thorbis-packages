import Analytics from 'analytics';
import type { AnalyticsConfig } from '../types';
import { PageViewTracker } from './trackers/pageViews';
import { NavigationTracker } from './trackers/navigation';
import { EngagementTracker } from './trackers/engagement';
import { FormsTracker } from './trackers/forms';

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
  private pageViewTracker: PageViewTracker;
  private navigationTracker: NavigationTracker;
  private engagementTracker: EngagementTracker;
  private formsTracker: FormsTracker;

  constructor(config: AnalyticsConfig) {
    this.config = config;

    // Initialize analytics package with debug plugin
    this.analytics = Analytics({
      app: 'thorbis-analytics',
      debug: config.debug,
      plugins: [
        debugPlugin,
        // Add other plugins here
      ],
    });

    // Initialize trackers with analytics instance
    this.pageViewTracker = new PageViewTracker(this.analytics);
    this.navigationTracker = new NavigationTracker(this.analytics);
    this.engagementTracker = new EngagementTracker(this.analytics);
    this.formsTracker = new FormsTracker(this.analytics);
  }

  async init() {
    try {
      if (this.config.debug) {
        console.debug('🔧 Thorbis Debug: Initializing analytics...');
      }

      // Wait for analytics to be ready
      await new Promise((resolve) => this.analytics.ready(resolve));

      // Initialize trackers
      await Promise.all([
        this.pageViewTracker.init(),
        this.navigationTracker.init(),
        this.engagementTracker.init(),
        this.formsTracker.init(),
      ]);

      if (this.config.debug) {
        console.debug('🚀 Thorbis Analytics initialized successfully', {
          sessionId: this.config.sessionId,
          debug: this.config.debug,
        });
      }
    } catch (error) {
      console.error('❌ Thorbis Error: Failed to initialize analytics', error);
      throw error;
    }
  }

  cleanup() {
    try {
      if (this.config.debug) {
        console.debug('🧹 Thorbis Debug: Starting cleanup...');
      }

      this.pageViewTracker.cleanup();
      this.navigationTracker.cleanup();
      this.engagementTracker.cleanup();
      this.formsTracker.cleanup();

      if (this.config.debug) {
        console.debug('✅ Thorbis Debug: Cleanup completed');
      }
    } catch (error) {
      console.error('❌ Thorbis Error: Cleanup failed', error);
    }
  }
}

export type { AnalyticsConfig } from '../types';
