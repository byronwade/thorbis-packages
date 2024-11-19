import { BaseTracker } from './base';

interface SessionLocation {
  country?: string;
  region?: string;
  city?: string;
  timezone: string;
  latitude?: number;
  longitude?: number;
}

interface SessionData {
  id: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  events: Array<{
    type: string;
    timestamp: number;
    data: any;
  }>;
  user: {
    id?: string;
    anonymousId: string;
    traits?: Record<string, any>;
  };
  device: {
    type: string;
    os: string;
    browser: string;
    screenSize: {
      width: number;
      height: number;
    };
  };
  location: SessionLocation;
  performance: {
    pageLoads: number[];
    averageLoadTime: number;
    slowestPage: {
      url: string;
      loadTime: number;
    };
  };
  engagement: {
    totalTimeSpent: number;
    activeTime: number;
    idleTime: number;
    pagesViewed: string[];
    interactions: number;
    lastActiveTime: number;
  };
}

export class SessionTracker extends BaseTracker {
  private sessionData: SessionData;
  private readonly IDLE_THRESHOLD = 1800000; // 30 minutes in milliseconds
  private readonly STORAGE_KEY = 'thorbis_session';
  private readonly SESSION_TIMEOUT = 1800000; // 30 minutes
  private activityTimeout: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_INTERVAL = 60000; // 1 minute
  private readonly ACTIVITY_EVENTS = ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'];

  constructor(analytics: any) {
    super(analytics);
    this.sessionData = this.initializeSessionData();
    this.handleActivity = this.handleActivity.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
  }

  async init(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      // Check for existing session
      const existingSession = this.getStoredSession();
      if (existingSession && !this.isSessionExpired(existingSession)) {
        this.sessionData = existingSession;
        this.sessionData.startTime = Date.now(); // Refresh start time
      }

      // Set up session tracking
      this.setupEventListeners();
      this.startHeartbeat();
      this.trackDeviceInfo();
      await this.trackLocationInfo();

      // Track session start
      this.trackSessionStart();

      this.log('Session tracker initialized');
    } catch (error) {
      console.warn('Error initializing session tracker:', error);
    }
  }

  getData(): any {
    const currentTime = Date.now();
    return {
      ...this.sessionData,
      endTime: currentTime,
      duration: currentTime - this.sessionData.startTime,
      summary: {
        totalDuration: this.calculateTotalDuration(),
        activePages: this.sessionData.engagement.pagesViewed.length,
        interactionRate: this.calculateInteractionRate(),
        bounced: this.sessionData.engagement.pagesViewed.length === 1,
        deviceType: this.sessionData.device.type,
        location: this.sessionData.location,
      },
    };
  }

  cleanup(): void {
    // Clear intervals and timeouts
    if (this.activityTimeout) {
      clearTimeout(this.activityTimeout);
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Remove event listeners
    this.ACTIVITY_EVENTS.forEach(event => {
      window.removeEventListener(event, this.handleActivity, { passive: true });
    });
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);

    // Save final session state
    this.storeSession();

    // Track session end
    this.trackSessionEnd();
  }

  private initializeSessionData(): SessionData {
    return {
      id: crypto.randomUUID(),
      startTime: Date.now(),
      events: [],
      user: {
        anonymousId: this.getAnonymousId(),
      },
      device: {
        type: this.getDeviceType(),
        os: this.getOS(),
        browser: this.getBrowser(),
        screenSize: {
          width: typeof window !== 'undefined' ? window.screen.width : 0,
          height: typeof window !== 'undefined' ? window.screen.height : 0,
        },
      },
      location: {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      performance: {
        pageLoads: [],
        averageLoadTime: 0,
        slowestPage: {
          url: '',
          loadTime: 0,
        },
      },
      engagement: {
        totalTimeSpent: 0,
        activeTime: 0,
        idleTime: 0,
        pagesViewed: [typeof window !== 'undefined' ? window.location.pathname : ''],
        interactions: 0,
        lastActiveTime: Date.now(),
      },
    };
  }

  private setupEventListeners(): void {
    // Use passive listeners for better performance
    const options = { passive: true };

    // Activity tracking
    this.ACTIVITY_EVENTS.forEach(event => {
      window.addEventListener(event, this.handleActivity, options);
    });

    // Visibility tracking
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  private handleActivity = (): void => {
    const now = Date.now();
    const timeSinceLastActive = now - this.sessionData.engagement.lastActiveTime;

    if (timeSinceLastActive < this.IDLE_THRESHOLD) {
      this.sessionData.engagement.activeTime += timeSinceLastActive;
    } else {
      this.sessionData.engagement.idleTime += timeSinceLastActive;
    }

    this.sessionData.engagement.lastActiveTime = now;
    this.sessionData.engagement.interactions++;

    // Reset activity timeout
    if (this.activityTimeout) {
      clearTimeout(this.activityTimeout);
    }
    this.activityTimeout = setTimeout(() => this.handleInactivity(), this.SESSION_TIMEOUT);

    // Store session state
    this.storeSession();
  };

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.storeSession();
    } else {
      this.checkSessionValidity();
    }
  };

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.updateSessionMetrics();
      this.storeSession();
    }, this.HEARTBEAT_INTERVAL);
  }

  private updateSessionMetrics(): void {
    const now = Date.now();
    const timeSinceLastActive = now - this.sessionData.engagement.lastActiveTime;

    if (timeSinceLastActive < this.IDLE_THRESHOLD) {
      this.sessionData.engagement.activeTime += this.HEARTBEAT_INTERVAL;
    } else {
      this.sessionData.engagement.idleTime += this.HEARTBEAT_INTERVAL;
    }

    this.sessionData.engagement.totalTimeSpent = 
      this.sessionData.engagement.activeTime + this.sessionData.engagement.idleTime;
  }

  private handleInactivity(): void {
    this.trackSessionEnd();
    this.sessionData = this.initializeSessionData();
    this.trackSessionStart();
  }

  private checkSessionValidity(): void {
    const storedSession = this.getStoredSession();
    if (!storedSession || this.isSessionExpired(storedSession)) {
      this.sessionData = this.initializeSessionData();
      this.trackSessionStart();
    }
  }

  private isSessionExpired(session: SessionData): boolean {
    return Date.now() - session.engagement.lastActiveTime > this.SESSION_TIMEOUT;
  }

  private storeSession(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.sessionData));
    } catch (error) {
      console.warn('Failed to store session:', error);
    }
  }

  private getStoredSession(): SessionData | null {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  private trackSessionStart(): void {
    this.analytics.track('sessionStart', {
      sessionId: this.sessionData.id,
      startTime: this.sessionData.startTime,
      device: this.sessionData.device,
      location: this.sessionData.location,
    });
  }

  private trackSessionEnd(): void {
    const endTime = Date.now();
    const duration = endTime - this.sessionData.startTime;

    this.analytics.track('sessionEnd', {
      sessionId: this.sessionData.id,
      duration,
      pagesViewed: this.sessionData.engagement.pagesViewed,
      interactions: this.sessionData.engagement.interactions,
    });
  }

  private getAnonymousId(): string {
    let id = localStorage.getItem('anonymous_id');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('anonymous_id', id);
    }
    return id;
  }

  private getDeviceType(): string {
    const ua = navigator.userAgent;
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
      return 'tablet';
    }
    if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
      return 'mobile';
    }
    return 'desktop';
  }

  private getOS(): string {
    const ua = navigator.userAgent;
    if (ua.includes('Windows')) return 'Windows';
    if (ua.includes('Mac OS')) return 'MacOS';
    if (ua.includes('Linux')) return 'Linux';
    if (ua.includes('Android')) return 'Android';
    if (ua.includes('iOS')) return 'iOS';
    return 'Unknown';
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

  private async trackLocationInfo(): Promise<void> {
    try {
      // Try multiple location services with fallbacks
      const services = [
        'https://ipapi.co/json/',
        'https://ip-api.com/json/',
        'https://ipinfo.io/json',
      ];

      for (const service of services) {
        try {
          const response = await fetch(service, {
            mode: 'cors',
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(3000), // 3s timeout
          });

          if (response.ok) {
            const data = await response.json();
            this.sessionData.location = {
              ...this.sessionData.location,
              country: data.country_name || data.country,
              region: data.region,
              city: data.city,
            };
            return;
          }
        } catch {
          continue;
        }
      }

      // Fallback to browser geolocation
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            this.sessionData.location = {
              ...this.sessionData.location,
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            };
          },
          () => {
            // Geolocation failed, keep default timezone only
          }
        );
      }
    } catch (error) {
      console.warn('Failed to get location info:', error);
    }
  }

  private calculateTotalDuration(): number {
    return Date.now() - this.sessionData.startTime;
  }

  private calculateInteractionRate(): number {
    const duration = this.calculateTotalDuration() / 1000; // Convert to seconds
    return this.sessionData.engagement.interactions / duration;
  }

  private trackDeviceInfo(): void {
    // Track additional device/browser capabilities
    this.sessionData.device = {
      ...this.sessionData.device,
      screenSize: {
        width: window.screen.width,
        height: window.screen.height,
      },
    };
  }
}

