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
  };
}

// Page Views
export interface PageViewData {
  url: string;
  referrer: string;
  timestamp: string;
  timeSpent: number;
}

// Navigation
export interface NavigationData {
  entryPage: string;
  exitPage?: string;
  pathTaken: string[];
  backButtonUsed: boolean;
}

// Engagement
export interface EngagementData {
  clicks: ClickData[];
  scroll: ScrollData;
  hover: HoverData[];
  video?: VideoInteractionData;
}

// Forms
export interface FormData {
  formId: string;
  fields: FormFieldInteraction[];
  timeSpent: number;
  abandoned: boolean;
}

// Demographics
export interface UserDemographics {
  device: DeviceInfo;
  location: GeoLocation;
  trafficSource: TrafficSource;
  userType: UserType;
}

// Supporting interfaces
export interface ClickData {
  elementId?: string;
  elementType: string;
  position: { x: number; y: number };
  timestamp: string;
}

export interface ScrollData {
  maxDepth: number;
  timestamps: { depth: number; time: string }[];
}

export interface HoverData {
  elementId?: string;
  duration: number;
  timestamp: string;
}

interface VideoInteractionData {
  videoId: string;
  actions: Array<{
    type: 'play' | 'pause' | 'skip' | 'complete';
    timestamp: string;
  }>;
}

export interface FormFieldInteraction {
  fieldId: string;
  timeSpent: number;
  completed: boolean;
}

interface DeviceInfo {
  type: 'mobile' | 'desktop' | 'tablet';
  os: string;
  browser: string;
  version: string;
}

interface GeoLocation {
  country: string;
  region?: string;
  city?: string;
  timezone: string;
}

interface TrafficSource {
  referrer?: string;
  utm?: {
    campaign?: string;
    source?: string;
    medium?: string;
  };
}

interface UserType {
  isNew: boolean;
  isRegistered: boolean;
}
