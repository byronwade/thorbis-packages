import { logger } from './utils/logger';
import { storage } from './utils/storage';
import { setupAllTracking } from './events';
import type { AnalyticsConfig, EventData } from './types';

export class Analytics {
  private config: AnalyticsConfig;
  private sessionId: string;
  private initialized: boolean = false;

  constructor() {
    this.sessionId = Math.random().toString(36).substring(2);
    this.config = {
      appId: 'default',
      version: '1.0.0',
    };
    logger.debug('Analytics instance created', { sessionId: this.sessionId });
  }

  async init(config?: Partial<AnalyticsConfig>) {
    logger.info('Initializing analytics with config:', config);

    this.config = { ...this.config, ...config };
    await storage.init();
    this.initialized = true;

    if (typeof window !== 'undefined') {
      setupAllTracking();
    }

    const initData = {
      config: this.config,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      userAgent:
        typeof window !== 'undefined' ? window.navigator.userAgent : 'server',
      screenResolution:
        typeof window !== 'undefined'
          ? `${window.screen.width}x${window.screen.height}`
          : undefined,
      viewport:
        typeof window !== 'undefined'
          ? `${window.innerWidth}x${window.innerHeight}`
          : undefined,
      language: typeof window !== 'undefined' ? navigator.language : undefined,
    };

    logger.info('Analytics initialized successfully', initData);
    await this.track('analytics_initialized', initData);
  }

  async track(eventName: string, data: Record<string, any> = {}) {
    if (!this.initialized) {
      logger.warn('Analytics not initialized. Event not tracked:', eventName);
      return;
    }

    const event: EventData = {
      type: eventName,
      timestamp: Date.now(),
      data: {
        ...data,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
        path:
          typeof window !== 'undefined' ? window.location.pathname : undefined,
        referrer: typeof window !== 'undefined' ? document.referrer : undefined,
        viewport:
          typeof window !== 'undefined'
            ? `${window.innerWidth}x${window.innerHeight}`
            : undefined,
      },
      sessionId: this.sessionId,
    };

    logger.debug(`Tracking event: ${eventName}`, {
      ...event,
      timestamp: new Date(event.timestamp).toISOString(),
    });

    await storage.storeBehaviorData(event);

    logger.info(`Event tracked successfully: ${eventName}`, {
      eventType: eventName,
      timestamp: new Date(event.timestamp).toISOString(),
      sessionId: this.sessionId,
      data: event.data,
    });
  }
}

export const analytics = new Analytics();
export const trackEvent = analytics.track.bind(analytics);
