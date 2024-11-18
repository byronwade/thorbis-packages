import { BaseTracker } from './base';
import type { SessionData, UserEvent } from './types';

export class SessionTracker extends BaseTracker {
  private sessionData: SessionData;
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  private activityTimeout: NodeJS.Timeout | null = null;
  private lastActivity: number = Date.now();

  constructor(analytics: any, debug: boolean = false) {
    super(analytics, debug);
    this.sessionData = this.initializeSessionData();

    // Bind methods
    this.handleActivity = this.handleActivity.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.updatePath = this.updatePath.bind(this);
  }

  async init() {
    if (typeof window === 'undefined') return;

    // Set up activity tracking
    window.addEventListener('click', this.handleActivity);
    window.addEventListener('scroll', this.handleActivity);
    window.addEventListener('keypress', this.handleActivity);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);

    // Track page navigation
    window.addEventListener('popstate', this.updatePath);
    this.interceptHistoryMethods();

    // Collect initial device and browser info
    await this.collectDeviceInfo();
    await this.collectGeolocation();

    this.log('Session tracker initialized', this.sessionData);
    this.analytics.track('sessionStart', this.sessionData);
  }

  private initializeSessionData(): SessionData {
    return {
      session_id: Math.random().toString(36).slice(2),
      user_id: this.getUserId(),
      start_time: new Date().toISOString(),
      path: [
        {
          page_url: window.location.href,
          time_spent: 0,
          scroll_depth: 0,
          interactions: 0,
        },
      ],
      device: {
        type: 'desktop',
        os: '',
        os_version: '',
        browser: '',
        browser_version: '',
        screen_resolution: '',
        viewport_size: '',
        connection_type: '',
      },
      geolocation: {
        country: '',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      performance: {
        page_load_time: 0,
        time_to_interactive: 0,
        first_contentful_paint: 0,
        largest_contentful_paint: 0,
      },
    };
  }

  private getUserId(): string {
    let userId = localStorage.getItem('thorbis_user_id');
    if (!userId) {
      userId = `user_${Math.random().toString(36).slice(2)}`;
      localStorage.setItem('thorbis_user_id', userId);
    }
    return userId;
  }

  private async collectDeviceInfo() {
    const ua = navigator.userAgent;
    const connection = (navigator as any).connection;

    this.sessionData.device = {
      type: /Mobile|Android|iPhone|iPad|iPod/i.test(ua) ? 'mobile' : 'desktop',
      os: this.getOS(),
      os_version: this.getOSVersion(),
      browser: this.getBrowser(),
      browser_version: this.getBrowserVersion(),
      screen_resolution: `${window.screen.width}x${window.screen.height}`,
      viewport_size: `${window.innerWidth}x${window.innerHeight}`,
      connection_type: connection ? connection.effectiveType : 'unknown',
    };
  }

  private async collectGeolocation() {
    try {
      const response = await fetch('https://ipapi.co/json/');
      const data = await response.json();

      this.sessionData.geolocation = {
        country: data.country_name,
        region: data.region,
        city: data.city,
        timezone: data.timezone,
        latitude: data.latitude,
        longitude: data.longitude,
      };
    } catch (error) {
      this.log('Failed to collect geolocation data', error);
    }
  }

  private handleActivity() {
    const now = Date.now();
    this.lastActivity = now;

    // Reset session timeout
    if (this.activityTimeout) {
      clearTimeout(this.activityTimeout);
    }

    this.activityTimeout = setTimeout(() => {
      if (now - this.lastActivity >= this.SESSION_TIMEOUT) {
        this.endSession();
      }
    }, this.SESSION_TIMEOUT);

    // Update current path interactions
    const currentPath = this.sessionData.path[this.sessionData.path.length - 1];
    if (currentPath) {
      currentPath.interactions = (currentPath.interactions || 0) + 1;
    }
  }

  private handleVisibilityChange() {
    if (document.hidden) {
      this.updateTimeSpent();
    }
  }

  private updatePath() {
    this.updateTimeSpent();
    this.sessionData.path.push({
      page_url: window.location.href,
      time_spent: 0,
      scroll_depth: 0,
      interactions: 0,
    });
  }

  private updateTimeSpent() {
    const currentPath = this.sessionData.path[this.sessionData.path.length - 1];
    if (currentPath) {
      currentPath.time_spent = Date.now() - this.lastActivity;
    }
  }

  private interceptHistoryMethods() {
    const originalPushState = history.pushState;
    const self = this;
    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      self.updatePath();
    };
  }

  private endSession() {
    this.updateTimeSpent();
    this.sessionData.end_time = new Date().toISOString();
    this.analytics.track('sessionEnd', this.sessionData);
  }

  trackEvent(event: UserEvent) {
    this.analytics.track('userEvent', {
      ...event,
      session_id: this.sessionData.session_id,
    });
  }

  cleanup() {
    window.removeEventListener('click', this.handleActivity);
    window.removeEventListener('scroll', this.handleActivity);
    window.removeEventListener('keypress', this.handleActivity);
    document.removeEventListener(
      'visibilitychange',
      this.handleVisibilityChange
    );
    window.removeEventListener('popstate', this.updatePath);

    if (this.activityTimeout) {
      clearTimeout(this.activityTimeout);
    }

    this.endSession();
  }

  private getOS(): string {
    const ua = navigator.userAgent;
    if (ua.includes('Windows')) return 'Windows';
    if (ua.includes('Mac')) return 'MacOS';
    if (ua.includes('Linux')) return 'Linux';
    if (ua.includes('Android')) return 'Android';
    if (ua.includes('iOS')) return 'iOS';
    return 'Unknown';
  }

  private getOSVersion(): string {
    const ua = navigator.userAgent;
    const match = ua.match(/(?:Windows NT|Mac OS X|Android|iOS)\s+([0-9._]+)/);
    return match ? match[1] : 'Unknown';
  }

  private getBrowser(): string {
    const ua = navigator.userAgent;
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';
    if (ua.includes('Opera')) return 'Opera';
    return 'Unknown';
  }

  private getBrowserVersion(): string {
    const ua = navigator.userAgent;
    const match = ua.match(/(chrome|firefox|safari|edge|opera)\/?\s*(\d+)/i);
    return match ? match[2] : 'Unknown';
  }
}
