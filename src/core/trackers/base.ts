import type { AnalyticsInstance } from 'analytics';

export abstract class BaseTracker {
  protected analytics: any;
  protected debug: boolean;

  constructor(analytics: any, debug: boolean = true) {
    this.analytics = analytics;
    this.debug = debug;
  }

  protected log(message: string, data?: any): void {
    if (this.debug) {
      if (data) {
        console.group(`📊 ${message}`);
        console.log(data);
        console.groupEnd();
      } else {
        console.log(`📊 ${message}`);
      }
    }
  }

  abstract init(): void;
  abstract cleanup(): void;
}
