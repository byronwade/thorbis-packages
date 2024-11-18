import type { AnalyticsInstance } from 'analytics';

export abstract class BaseTracker {
  protected analytics: AnalyticsInstance;
  protected debug: boolean;

  constructor(analytics: AnalyticsInstance, debug: boolean = false) {
    this.analytics = analytics;
    this.debug = debug;
  }

  protected log(message: string, data?: any) {
    if (this.debug) {
      console.debug(`🔍 Thorbis Debug: ${message}`, data);
    }
  }

  abstract init(): Promise<void> | void;
  abstract cleanup(): void;
}
