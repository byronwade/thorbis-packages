import { BaseTracker } from './base';
import type { SessionData, UserEvent } from './types';

interface EnhancedSessionData extends SessionData {
  engagement: {
    activeTime: number;
    idleTime: number;
    focusTime: number;
    lastActive: string;
    interactionFrequency: number;
    interactionsByType: Record<string, number>;
    interactionPatterns: Array<{
      type: string;
      count: number;
      frequency: number;
      lastOccurrence: string;
    }>;
  };
  navigation: {
    entryPage: string;
    exitPage: string;
    pathDepth: number;
    uniquePages: Set<string>;
    pageVisits: Map<
      string,
      {
        visits: number;
        totalTime: number;
        lastVisit: string;
        scrollDepth: number;
        interactions: number;
      }
    >;
    bounced: boolean;
    returnVisits: Array<{
      page: string;
      visits: number;
      timeSpent: number;
      lastVisit: string;
    }>;
  };
  timing: {
    averagePageTime: number;
    longestPage: {
      url: string;
      duration: number;
      visitCount: number;
    };
    shortestPage: {
      url: string;
      duration: number;
      visitCount: number;
    };
    pageLoadTimes: Array<{
      url: string;
      loadTime: number;
      timestamp: string;
    }>;
  };
  activity: {
    segments: Array<{
      type: 'active' | 'idle' | 'hidden';
      startTime: string;
      endTime: string;
      duration: number;
      context?: {
        page: string;
        interactions: number;
        scrollDepth: number;
      };
    }>;
    milestones: Array<{
      type: string;
      timestamp: string;
      value: any;
      context?: Record<string, any>;
    }>;
  };
}

export class SessionTracker extends BaseTracker {
  private sessionData: EnhancedSessionData;
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  private readonly IDLE_THRESHOLD = 60 * 1000; // 1 minute
  private activityTimeout: NodeJS.Timeout | null = null;
  private lastActivity: number = Date.now();
  private currentActivitySegment: {
    type: 'active' | 'idle' | 'hidden';
    startTime: string;
    page: string;
  };
  private isInitialized = false;
  private isCleaningUp = false;
  private hasTrackedInitialPageView = false;

  private readonly TRACKING_OPTIONS = {
    context: {
      app: 'thorbis-analytics',
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
    },
    integrations: {
      All: true,
    },
  };

  constructor(analytics: any, debug: boolean = false) {
    super(analytics, debug);
    this.sessionData = this.initializeEnhancedSessionData();
    this.currentActivitySegment = {
      type: 'active',
      startTime: new Date().toISOString(),
      page: window.location.href,
    };

    this.handleActivity = this.handleActivity.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.updatePath = this.updatePath.bind(this);
  }

  private getUserData(): { userId: string | null; anonymousId: string } {
    // Try to get existing user ID from localStorage
    const userId = localStorage.getItem('thorbis_user_id');
    const anonymousId =
      localStorage.getItem('thorbis_anonymous_id') || crypto.randomUUID();

    // If no user ID exists, create and store anonymous ID
    if (!userId) {
      localStorage.setItem('thorbis_anonymous_id', anonymousId);
    }

    return {
      userId,
      anonymousId,
    };
  }

  private track(eventName: string, properties: any) {
    const { userId, anonymousId } = this.getUserData();

    this.analytics.track(eventName, properties, {
      ...this.TRACKING_OPTIONS,
      userId,
      anonymousId,
      timestamp: new Date().toISOString(),
      context: {
        ...this.TRACKING_OPTIONS.context,
        page: {
          url: window.location.href,
          path: window.location.pathname,
          title: document.title,
          referrer: document.referrer,
        },
        userAgent: navigator.userAgent,
        locale: navigator.language,
        screen: {
          width: window.screen.width,
          height: window.screen.height,
          density: window.devicePixelRatio,
        },
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    });
  }

  async init() {
    if (typeof window === 'undefined' || this.isInitialized) return;
    this.isInitialized = true;

    // Activity tracking
    window.addEventListener('click', this.handleActivity);
    window.addEventListener('scroll', this.handleActivity);
    window.addEventListener('keypress', this.handleActivity);
    window.addEventListener('mousemove', this.handleActivity);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);

    // Navigation tracking
    window.addEventListener('popstate', this.updatePath);
    this.interceptHistoryMethods();

    // Initial data collection
    await Promise.all([this.collectDeviceInfo(), this.collectGeolocation()]);

    // Track single page view only if not already tracked
    if (!this.hasTrackedInitialPageView) {
      this.hasTrackedInitialPageView = true;

      this.track('pageView', {
        url: window.location.href,
        referrer: document.referrer,
        isInitial: true,
        sessionId: this.sessionData.session_id,
        context: {
          pathname: window.location.pathname,
          search: window.location.search,
          hash: window.location.hash,
          title: document.title,
        },
      });

      // Track session start
      this.track('sessionStart', {
        ...this.getInitialState(),
        type: 'initial',
      });
    }

    // Handle page unload
    window.addEventListener('beforeunload', () => {
      if (!this.isCleaningUp) {
        this.cleanup();
      }
    });

    this.log('Session tracking started');
  }

  private getInitialState() {
    return {
      session: {
        id: this.sessionData.session_id,
        startTime: this.sessionData.start_time,
        userId: this.sessionData.user_id,
      },
      navigation: {
        entryPage: this.sessionData.navigation.entryPage,
        referrer: document.referrer,
        pathDepth: this.sessionData.navigation.pathDepth,
      },
      device: this.sessionData.device,
      geolocation: this.sessionData.geolocation,
      context: {
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
        url: window.location.href,
        timestamp: new Date().toISOString(),
      },
    };
  }

  cleanup() {
    if (this.isCleaningUp) return;
    this.isCleaningUp = true;

    // Track page exit with proper data
    this.track('pageExit', {
      url: window.location.href,
      duration: Date.now() - new Date(this.sessionData.start_time).getTime(),
      engagement: {
        activeTime: this.sessionData.engagement.activeTime,
        interactions: this.sessionData.engagement.interactionFrequency,
      },
      sessionId: this.sessionData.session_id,
    });

    // Remove event listeners
    window.removeEventListener('click', this.handleActivity);
    window.removeEventListener('scroll', this.handleActivity);
    window.removeEventListener('keypress', this.handleActivity);
    window.removeEventListener('mousemove', this.handleActivity);
    document.removeEventListener(
      'visibilitychange',
      this.handleVisibilityChange
    );
    window.removeEventListener('popstate', this.updatePath);

    // Clear timeouts
    if (this.activityTimeout) {
      clearTimeout(this.activityTimeout);
    }

    // End current activity segment
    this.endCurrentActivitySegment('cleanup');

    // Calculate final metrics
    this.updateEngagementMetrics();

    // Track session end
    this.track('sessionEnd', {
      ...this.sessionData,
      end_time: new Date().toISOString(),
      duration: Date.now() - new Date(this.sessionData.start_time).getTime(),
      summary: this.generateSessionSummary(),
    });

    this.isInitialized = false;
    this.isCleaningUp = false;
  }

  private startPeriodicLogging() {
    // Log session state every minute
    setInterval(() => {
      const sessionState = this.getSessionState();
      this.log('Session state update', sessionState);

      // Track significant changes
      if (this.hasSignificantChanges(sessionState)) {
        this.analytics.track('sessionUpdate', {
          ...sessionState,
          type: 'periodic',
          timestamp: new Date().toISOString(),
        });
      }
    }, 60000);
  }

  private getSessionState() {
    const now = Date.now();
    const sessionDuration =
      now - new Date(this.sessionData.start_time).getTime();

    return {
      duration: sessionDuration,
      engagement: {
        ...this.sessionData.engagement,
        currentState: this.currentActivitySegment.type,
        timeInCurrentState:
          now - new Date(this.currentActivitySegment.startTime).getTime(),
      },
      navigation: {
        ...this.sessionData.navigation,
        currentPage: window.location.href,
        timeOnCurrentPage: this.getCurrentPageDuration(),
      },
      activity: {
        lastActive: this.sessionData.engagement.lastActive,
        timeSinceLastActive:
          now - new Date(this.sessionData.engagement.lastActive).getTime(),
        currentSegment: this.currentActivitySegment,
      },
    };
  }

  private hasSignificantChanges(currentState: any): boolean {
    // Implement logic to determine if state changes are significant enough to log
    const timeSinceLastActive =
      new Date().getTime() -
      new Date(this.sessionData.engagement.lastActive).getTime();
    return (
      timeSinceLastActive > this.IDLE_THRESHOLD ||
      currentState.navigation.currentPage !==
        this.sessionData.navigation.entryPage ||
      currentState.engagement.interactionFrequency > 0.5
    );
  }

  private handleActivity = () => {
    const now = new Date();
    const timeSinceLastActivity = now.getTime() - this.lastActivity;

    if (timeSinceLastActivity > this.IDLE_THRESHOLD) {
      this.endCurrentActivitySegment('idle');
      this.startNewActivitySegment('active');
    }

    this.sessionData.engagement.lastActive = now.toISOString();
    this.sessionData.engagement.interactionFrequency =
      this.calculateInteractionFrequency();

    this.track('pageEngagement', {
      engagement: {
        lastActive: this.sessionData.engagement.lastActive,
        interactionFrequency: this.sessionData.engagement.interactionFrequency,
        activeTime: this.sessionData.engagement.activeTime,
        idleTime: this.sessionData.engagement.idleTime,
      },
      timing: {
        sessionDuration:
          Date.now() - new Date(this.sessionData.start_time).getTime(),
        timeOnPage: this.getCurrentPageDuration(),
      },
      url: window.location.href,
      timestamp: now.toISOString(),
    });

    this.lastActivity = now.getTime();
    this.resetActivityTimeout();
  };

  private handleVisibilityChange = () => {
    const isHidden = document.hidden;
    const now = new Date();

    this.endCurrentActivitySegment(isHidden ? 'hidden' : 'active');
    this.startNewActivitySegment(isHidden ? 'hidden' : 'active');

    // Track visibility change
    this.sessionData.activity.milestones.push({
      type: 'visibility_change',
      timestamp: now.toISOString(),
      value: isHidden ? 'hidden' : 'visible',
    });

    // Update engagement metrics
    if (isHidden) {
      this.updateEngagementMetrics();
    }
  };

  private endCurrentActivitySegment(reason: string) {
    const now = new Date();
    const duration =
      now.getTime() - new Date(this.currentActivitySegment.startTime).getTime();

    this.sessionData.activity.segments.push({
      type: this.currentActivitySegment.type,
      startTime: this.currentActivitySegment.startTime,
      endTime: now.toISOString(),
      duration,
    });

    // Update engagement times
    if (this.currentActivitySegment.type === 'active') {
      this.sessionData.engagement.activeTime += duration;
    } else if (this.currentActivitySegment.type === 'idle') {
      this.sessionData.engagement.idleTime += duration;
    }

    this.log('Activity segment ended', {
      type: this.currentActivitySegment.type,
      duration,
      reason,
    });
  }

  private startNewActivitySegment(type: 'active' | 'idle' | 'hidden') {
    this.currentActivitySegment = {
      type,
      startTime: new Date().toISOString(),
      page: window.location.href,
    };
  }

  private calculateInteractionFrequency(): number {
    const totalInteractions = Object.values(
      this.sessionData.engagement.interactionsByType
    ).reduce((sum, count) => sum + count, 0);
    const sessionDuration =
      Date.now() - new Date(this.sessionData.start_time).getTime();
    return totalInteractions / (sessionDuration / 1000); // interactions per second
  }

  private getCurrentPageDuration(): number {
    const currentPath = this.sessionData.path[this.sessionData.path.length - 1];
    return currentPath ? Date.now() - this.lastActivity : 0;
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

  private updatePath() {
    // Only track new page views for actual navigation
    if (this.hasTrackedInitialPageView) {
      this.analytics.track('pageView', {
        url: window.location.href,
        referrer: document.referrer,
        timestamp: new Date().toISOString(),
        sessionId: this.sessionData.session_id,
        isInitial: false,
        context: {
          pathname: window.location.pathname,
          search: window.location.search,
          hash: window.location.hash,
          title: document.title,
        },
      });
    }

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

  trackEvent(event: UserEvent) {
    this.analytics.track('userEvent', {
      ...event,
      session_id: this.sessionData.session_id,
    });
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

  private initializeEnhancedSessionData(): EnhancedSessionData {
    const baseData = this.initializeSessionData();
    return {
      ...baseData,
      engagement: {
        activeTime: 0,
        idleTime: 0,
        focusTime: 0,
        lastActive: new Date().toISOString(),
        interactionFrequency: 0,
        interactionsByType: {},
        interactionPatterns: [],
      },
      navigation: {
        entryPage: window.location.href,
        exitPage: '',
        pathDepth: 1,
        uniquePages: new Set([window.location.href]),
        pageVisits: new Map([
          [
            window.location.href,
            {
              visits: 1,
              totalTime: 0,
              lastVisit: new Date().toISOString(),
              scrollDepth: 0,
              interactions: 0,
            },
          ],
        ]),
        bounced: true,
        returnVisits: [],
      },
      timing: {
        averagePageTime: 0,
        longestPage: {
          url: window.location.href,
          duration: 0,
          visitCount: 1,
        },
        shortestPage: {
          url: window.location.href,
          duration: 0,
          visitCount: 1,
        },
        pageLoadTimes: [],
      },
      activity: {
        segments: [],
        milestones: [],
      },
    };
  }

  private resetActivityTimeout() {
    if (this.activityTimeout) {
      clearTimeout(this.activityTimeout);
    }

    this.activityTimeout = setTimeout(() => {
      this.handleIdle();
    }, this.IDLE_THRESHOLD);
  }

  private handleIdle() {
    this.endCurrentActivitySegment('idle_timeout');
    this.startNewActivitySegment('idle');
    this.updateEngagementMetrics();
  }

  private updateEngagementMetrics() {
    const now = Date.now();
    const currentPage = window.location.href;
    const pageVisit = this.sessionData.navigation.pageVisits.get(currentPage);

    if (pageVisit) {
      const timeOnPage = now - new Date(pageVisit.lastVisit).getTime();
      pageVisit.totalTime += timeOnPage;
      pageVisit.lastVisit = new Date().toISOString();

      // Update timing metrics
      this.updateTimingMetrics(currentPage, timeOnPage);
    }

    // Update interaction frequency
    const sessionDuration =
      now - new Date(this.sessionData.start_time).getTime();
    const totalInteractions = Object.values(
      this.sessionData.engagement.interactionsByType
    ).reduce((sum, count) => sum + count, 0);

    this.sessionData.engagement.interactionFrequency =
      totalInteractions / (sessionDuration / 1000);

    this.log('Engagement metrics updated', {
      timeOnPage: pageVisit?.totalTime,
      interactionFrequency: this.sessionData.engagement.interactionFrequency,
      currentSegment: this.currentActivitySegment,
    });
  }

  private updateTimingMetrics(page: string, duration: number) {
    const visits = this.sessionData.navigation.pageVisits.get(page);
    if (!visits) return;

    // Update average page time
    const totalPages = this.sessionData.navigation.uniquePages.size;
    const totalTime = Array.from(
      this.sessionData.navigation.pageVisits.values()
    ).reduce((sum, visit) => sum + visit.totalTime, 0);

    this.sessionData.timing.averagePageTime = totalTime / totalPages;

    // Update longest/shortest page
    if (duration > this.sessionData.timing.longestPage.duration) {
      this.sessionData.timing.longestPage = {
        url: page,
        duration,
        visitCount: visits.visits,
      };
    }

    if (
      duration < this.sessionData.timing.shortestPage.duration ||
      this.sessionData.timing.shortestPage.duration === 0
    ) {
      this.sessionData.timing.shortestPage = {
        url: page,
        duration,
        visitCount: visits.visits,
      };
    }
  }

  private getMostVisitedPages(): Array<{
    page: string;
    visits: number;
    timeSpent: number;
  }> {
    return Array.from(this.sessionData.navigation.pageVisits.entries())
      .map(([page, data]) => ({
        page,
        visits: data.visits,
        timeSpent: data.totalTime,
      }))
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 5);
  }

  private getTopInteractions(): Array<{
    type: string;
    count: number;
    frequency: number;
  }> {
    return Object.entries(this.sessionData.engagement.interactionsByType)
      .map(([type, count]) => ({
        type,
        count,
        frequency: count / (this.sessionData.engagement.activeTime / 1000),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  private summarizeActivitySegments(): {
    activePercentage: number;
    idlePercentage: number;
    hiddenPercentage: number;
    patterns: Array<{
      type: string;
      duration: number;
      frequency: number;
    }>;
  } {
    const totalDuration = this.sessionData.activity.segments.reduce(
      (sum, segment) => sum + segment.duration,
      0
    );

    const byType = this.sessionData.activity.segments.reduce((acc, segment) => {
      acc[segment.type] = (acc[segment.type] || 0) + segment.duration;
      return acc;
    }, {} as Record<string, number>);

    return {
      activePercentage: ((byType['active'] || 0) / totalDuration) * 100,
      idlePercentage: ((byType['idle'] || 0) / totalDuration) * 100,
      hiddenPercentage: ((byType['hidden'] || 0) / totalDuration) * 100,
      patterns: Object.entries(byType).map(([type, duration]) => ({
        type,
        duration,
        frequency: this.sessionData.activity.segments.filter(
          (s) => s.type === type
        ).length,
      })),
    };
  }

  private generateSessionSummary() {
    return {
      duration: {
        total: Date.now() - new Date(this.sessionData.start_time).getTime(),
        active: this.sessionData.engagement.activeTime,
        idle: this.sessionData.engagement.idleTime,
        focus: this.sessionData.engagement.focusTime,
      },
      navigation: {
        pagesVisited: this.sessionData.navigation.uniquePages.size,
        pathDepth: this.sessionData.navigation.pathDepth,
        bounced: this.sessionData.navigation.bounced,
        mostVisited: this.getMostVisitedPages(),
      },
      engagement: {
        interactionRate: this.sessionData.engagement.interactionFrequency,
        topInteractions: this.getTopInteractions(),
        activitySegments: this.summarizeActivitySegments(),
      },
      performance: this.sessionData.performance,
    };
  }
}
