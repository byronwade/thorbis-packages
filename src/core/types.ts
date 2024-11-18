export interface TrackerOptions {
  debug?: boolean;
  sampling?: number;
  throttle?: number;
  sessionTimeout?: number;
  storageType?: 'localStorage' | 'sessionStorage' | 'indexedDB';
  compression?: boolean;
  batchSize?: number;
  flushInterval?: number;
  endpoints?: {
    events?: string;
    sessions?: string;
    insights?: string;
  };
}

export interface AnalyticsConfig {
  sessionId: string;
  disabled?: boolean;
  debug?: boolean;
  options?: {
    pageViews?: boolean;
    navigation?: boolean;
    engagement?: boolean;
    forms?: boolean;
    search?: boolean;
    content?: boolean;
    heatmaps?: boolean;
    media?: boolean;
    demographics?: boolean;
    seo?: boolean;
    project?: boolean;
    performance?: boolean;
  };
  endpoints?: {
    events?: string;
    sessions?: string;
    insights?: string;
  };
  sampling?: number;
  throttle?: number;
  sessionTimeout?: number;
  storageType?: 'localStorage' | 'sessionStorage' | 'indexedDB';
  compression?: boolean;
  batchSize?: number;
  flushInterval?: number;
}
