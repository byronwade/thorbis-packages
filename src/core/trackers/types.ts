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

export interface MediaData {
  mediaId: string;
  type: 'video' | 'audio';
  action: 'play' | 'pause' | 'seek' | 'complete';
  position: number;
  timestamp: string;
  duration?: number;
  metadata?: {
    title?: string;
    source?: string;
    quality?: string;
    playbackRate: number;
  };
  buffered?: Array<{ start: number; end: number }>;
  volume?: number;
  muted?: boolean;
  playbackRate?: number;
}

export interface MediaProgressData extends Omit<MediaData, 'action'> {
  progress: number;
  playbackQuality?: {
    droppedFrames?: number;
    totalFrames?: number;
  };
}

export interface MediaDownloadData {
  mediaId: string;
  type: 'document';
  action: 'download';
  timestamp: string;
  url: string;
  metadata?: {
    fileName?: string;
    fileSize?: number;
    fileType?: string;
  };
}

export interface HeatmapData {
  clicks: Array<{
    x: number;
    y: number;
    elementId?: string;
    timestamp: string;
  }>;
  scrollDepths: Array<{
    depth: number;
    timestamp: string;
  }>;
}

export interface SearchData {
  query: string;
  results: number;
  timestamp: string;
  filters?: Record<string, any>;
  resultClicks?: Array<{
    position: number;
    itemId: string;
    timestamp: string;
  }>;
}

export interface ContentData {
  pageId: string;
  type: 'article' | 'product' | 'landing' | 'other';
  views: number;
  shares: number;
  comments: number;
  averageTimeSpent: number;
  timestamp: string;
}

// Base Event Interface
export interface BaseEvent {
  event_id: string;
  user_id: string;
  timestamp: string;
  session_id: string;
}

// User Event Types
export interface UserEvent extends BaseEvent {
  event_type:
    | 'page_view'
    | 'click'
    | 'form_submit'
    | 'search_query'
    | 'media_interaction'
    | 'error';
  metadata: {
    page_url: string;
    referrer_url?: string;
    element_id?: string;
    element_type?: string;
    value?: string;
    position?: { x: number; y: number };
    viewport_size?: { width: number; height: number };
  };
  context?: {
    campaign?: string;
    source?: string;
    medium?: string;
    term?: string;
    content?: string;
  };
}

// Session Data
export interface SessionData {
  session_id: string;
  user_id: string;
  start_time: string;
  end_time?: string;
  path: Array<{
    page_url: string;
    time_spent: number;
    scroll_depth?: number;
    interactions?: number;
  }>;
  device: {
    type: 'mobile' | 'desktop' | 'tablet';
    os: string;
    os_version: string;
    browser: string;
    browser_version: string;
    screen_resolution: string;
    viewport_size: string;
    connection_type?: string;
  };
  geolocation: {
    country: string;
    region?: string;
    city?: string;
    timezone: string;
    latitude?: number;
    longitude?: number;
  };
  performance: {
    page_load_time: number;
    time_to_interactive: number;
    first_contentful_paint: number;
    largest_contentful_paint: number;
  };
}

// Content Performance
export interface ContentPerformance {
  content_id: string;
  url: string;
  type: 'article' | 'video' | 'product' | 'landing';
  metadata: {
    title: string;
    author: string;
    publishDate: string;
    category: string;
    tags: (string | null)[];
    wordCount: number;
    readingTime: number;
    hasVideo: boolean;
    hasImages: boolean;
  };
  metrics: {
    views: number;
    unique_views: number;
    time_spent_avg: number;
    engagement_rate: number;
    click_through_rate: number;
    bounce_rate: number;
    conversion_rate?: number;
    read_completion_rate: number;
  };
  interactions: {
    likes: number;
    shares: number;
    comments: number;
    saves: number;
    clicks: number;
    highlights: number;
    copies: number;
  };
  scroll_depth_distribution: {
    '25%': number;
    '50%': number;
    '75%': number;
    '100%': number;
  };
  engagement_signals: {
    scroll_speed: number[];
    time_to_first_interaction: number | null;
    interaction_frequency: number;
    return_visits: number;
    exit_points: string[];
  };
  traffic_sources: {
    referrer: string;
    utm_source: string;
    utm_medium: string;
    utm_campaign: string;
  };
  performance_metrics: {
    load_time: number;
    time_to_interactive: number;
    largest_contentful_paint: number;
  };
  user_segments: Set<string>;
  ab_test_variants: Map<string, string>;
}

// AI Insights
export interface AIInsight {
  insight_id: string;
  user_id: string;
  timestamp: string;
  insight_type:
    | 'content_recommendation'
    | 'churn_risk'
    | 'personalization'
    | 'anomaly';
  confidence_score: number;
  description: string;
  suggested_action: string;
  data_points: {
    behavioral_patterns: Array<{
      pattern_type: string;
      frequency: number;
      significance: number;
    }>;
    content_affinities: Array<{
      category: string;
      score: number;
    }>;
    engagement_trends: Array<{
      metric: string;
      trend: 'increasing' | 'decreasing' | 'stable';
      change_rate: number;
    }>;
  };
  metadata: {
    model_version: string;
    features_used: string[];
    generation_time: string;
  };
}

// Export all previous interfaces as well
export * from './media';
export * from './heatmap';
export * from './search';
export * from './content';
