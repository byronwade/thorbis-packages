export interface AnalyticsConfig {
  sessionId: string;
  debug?: boolean;
  options: {
    pageViews?: boolean;
    navigation?: boolean;
    engagement?: boolean;
    forms?: boolean;
    heatmaps?: boolean;
    seo?: boolean;
    project?: boolean;
    performance?: boolean;
    demographics?: boolean;
    error?: boolean;
    media?: boolean;
    search?: boolean;
  };
  batchConfig?: {
    maxBatchSize?: number;
    flushInterval?: number;
  };
}

export interface PageViewData {
  url: string;
  title: string;
  timestamp: number;
  referrer?: string;
}

export interface NavigationData {
  from: string;
  to: string;
  type: 'pushState' | 'replaceState' | 'popState';
  timestamp: number;
}

export interface EngagementData {
  type: string;
  element: string;
  timestamp: number;
  data?: any;
}

export interface CustomFormData {
  formId: string;
  action: string;
  fields: Record<string, any>;
  timestamp: number;
}

export interface UserDemographics {
  device: string;
  browser: string;
  os: string;
  language: string;
  location?: {
    country?: string;
    region?: string;
    city?: string;
  };
}

export interface ClickData {
  x: number;
  y: number;
  element: string;
  timestamp: number;
}

export interface ScrollData {
  depth: number;
  direction: 'up' | 'down';
  timestamp: number;
}

export interface HoverData {
  element: string;
  duration: number;
  timestamp: number;
}

declare global {
  interface Window {
    // Framework detection
    __NEXT_DATA__?: any;
    __NUXT__?: any;
    next?: any;
    React?: { version: string };
    Vue?: { version: string };
    angular?: any;
    Svelte?: any;
    Gatsby?: any;
    __GATSBY?: any;
    Remix?: any;
    __remixManifest?: any;

    // Build tools
    webpackJsonp?: any[];
    __vite__?: any;
    parcelRequire?: any;

    // State management
    __REDUX_DEVTOOLS_EXTENSION__?: any;
    __RECOIL_DEVTOOLS_GLOBAL_HOOK__?: any;
    Vuex?: any;

    // Testing
    Jest?: any;
    Cypress?: any;
    Playwright?: any;

    // React DevTools
    __REACT_DEVTOOLS_GLOBAL_HOOK__?: any;
  }

  interface Navigator {
    connection?: {
      effectiveType: string;
      downlink: number;
      rtt?: number;
      saveData?: boolean;
    };
  }

  interface PerformanceResourceEntry extends PerformanceEntry {
    initiatorType: string;
    transferSize: number;
    nextHopProtocol: string;
  }
}

// Export types without conflicts
export type {
  AnalyticsConfig,
  PageViewData,
  NavigationData,
  EngagementData,
  CustomFormData as FormData,
  UserDemographics,
  ClickData,
  ScrollData,
  HoverData,
};
