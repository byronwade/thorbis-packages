declare module 'analytics' {
  export interface AnalyticsInstance {
    track(eventName: string, data?: Record<string, any>): Promise<void>;
    page(data?: Record<string, any>): Promise<void>;
  }

  export interface AnalyticsConfig {
    app: string;
    plugins?: any[];
  }

  export default function Analytics(config: AnalyticsConfig): AnalyticsInstance;
}
