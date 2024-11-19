import type { AnalyticsInstance } from 'analytics';

export abstract class BaseTracker {
  protected analytics: any;
  protected enabled: boolean;

  constructor(analytics: any, enabled: boolean = true) {
    this.analytics = analytics;
    this.enabled = enabled;
  }

  protected log(message: string, data?: any): void {
    if (this.enabled) {
      if (data) {
        console.group(`📊 ${message}`);
        console.log(data);
        console.groupEnd();
      } else {
        console.log(`📊 ${message}`);
      }
    }
  }

  abstract init(): Promise<void>;
  abstract cleanup(): void;
  abstract getData(): any;
}
