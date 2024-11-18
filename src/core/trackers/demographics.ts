import { BaseTracker } from './base';

interface DemographicsData {
  user: {
    id: string;
    type: {
      isNew: boolean;
      isRegistered: boolean;
      firstVisit: string;
      visitCount: number;
      lastVisit: string;
    };
    preferences: {
      language: string;
      theme: 'light' | 'dark' | 'system';
      timezone: string;
      currency?: string;
    };
  };
  device: {
    type: 'mobile' | 'tablet' | 'desktop';
    details: {
      brand?: string;
      model?: string;
      os: {
        name: string;
        version: string;
        platform: string;
      };
      screen: {
        width: number;
        height: number;
        density: number;
        orientation: 'portrait' | 'landscape';
        colorDepth: number;
      };
      browser: {
        name: string;
        version: string;
        engine: string;
        languages: string[];
        cookies: boolean;
        localStorage: boolean;
        sessionStorage: boolean;
        webGL: boolean;
      };
    };
    capabilities: {
      touch: boolean;
      keyboard: boolean;
      mouse: boolean;
      maxTouchPoints: number;
      bluetooth: boolean;
      network: {
        type: string;
        speed: string;
        saveData: boolean;
        rtt?: number;
        downlink?: number;
      };
      battery?: {
        level: number;
        charging: boolean;
        chargingTime: number;
        dischargingTime: number;
      };
      memory?: {
        deviceMemory: number;
        hardwareConcurrency: number;
      };
    };
  };
  location: {
    geo: {
      country: string;
      region: string;
      city: string;
      postalCode?: string;
      timezone: string;
      coordinates?: {
        latitude: number;
        longitude: number;
        accuracy: number;
      };
    };
    ip: {
      address: string;
      type: 'IPv4' | 'IPv6';
      proxy: boolean;
      hosting: boolean;
    };
    network: {
      autonomousSystem: string;
      isp: string;
      organization: string;
      domain: string;
    };
  };
  traffic: {
    source: {
      referrer: string;
      type: 'direct' | 'organic' | 'paid' | 'social' | 'email' | 'referral';
      medium: string;
      campaign?: string;
      term?: string;
      content?: string;
    };
    landing: {
      page: string;
      timestamp: string;
      queryParams: Record<string, string>;
    };
    attribution: {
      firstTouch: {
        source: string;
        medium: string;
        campaign: string;
        timestamp: string;
      };
      lastTouch: {
        source: string;
        medium: string;
        campaign: string;
        timestamp: string;
      };
    };
  };
  behavior: {
    sessions: {
      count: number;
      averageDuration: number;
      bounceRate: number;
      lastSessionDuration: number;
    };
    engagement: {
      daysActive: number;
      lastActiveDate: string;
      frequencyScore: number;
      recencyScore: number;
      monetaryScore?: number;
    };
    preferences: {
      visitDays: string[];
      visitHours: number[];
      contentTypes: Record<string, number>;
      categories: Record<string, number>;
      interactions: Record<string, number>;
    };
  };
}

export class DemographicsTracker extends BaseTracker {
  private demographics: DemographicsData;
  private storageKey = 'thorbis_demographics';

  constructor(analytics: any, debug: boolean = false) {
    super(analytics, debug);
    this.demographics = this.loadStoredDemographics();
  }

  async init() {
    if (typeof window === 'undefined') return;

    try {
      // Initialize all data collections
      await this.initializeTracking();

      // Start behavior tracking
      this.trackBehavior();

      this.log('Demographics tracker initialized', this.demographics);
      this.analytics.track('demographics', this.demographics);
    } catch (error) {
      this.log('Failed to initialize demographics tracker', error);
    }
  }

  private async initializeTracking() {
    // Collect basic info immediately
    await Promise.all([
      this.collectDeviceAndBrowserInfo(),
      this.collectUserAndTrafficInfo(),
      this.collectGeolocation(),
      this.collectNetworkInfo(),
      this.collectBatteryInfo(),
      this.collectHardwareInfo(),
    ]);
  }

  private async collectDeviceAndBrowserInfo() {
    const ua = navigator.userAgent;
    const mobile = /Mobile|Android|iPhone|iPad|iPod/i.test(ua);
    const tablet = /Tablet|iPad/i.test(ua);

    // Device info
    this.demographics.device.type = mobile
      ? 'mobile'
      : tablet
      ? 'tablet'
      : 'desktop';
    this.demographics.device.details.os = {
      name: this.getOS(),
      version: this.getOSVersion(),
      platform: navigator.platform,
    };

    // Screen info
    this.demographics.device.details.screen = {
      width: window.screen.width,
      height: window.screen.height,
      density: window.devicePixelRatio,
      orientation: screen.orientation.type.includes('landscape')
        ? 'landscape'
        : 'portrait',
      colorDepth: screen.colorDepth,
    };

    // Browser info
    this.demographics.device.details.browser = {
      name: this.getBrowser(),
      version: this.getBrowserVersion(),
      engine: this.getBrowserEngine(),
      languages: Array.from(navigator.languages), // Convert readonly array to mutable
      cookies: navigator.cookieEnabled,
      localStorage: this.checkLocalStorage(),
      sessionStorage: this.checkSessionStorage(),
      webGL: this.checkWebGL(),
    };

    // Device capabilities
    this.demographics.device.capabilities = {
      touch: 'ontouchstart' in window,
      keyboard: 'onkeydown' in window,
      mouse: 'onmousemove' in window,
      maxTouchPoints: navigator.maxTouchPoints,
      bluetooth: 'bluetooth' in navigator,
      network: {
        type: '',
        speed: '',
        saveData: false,
      },
    };
  }

  private async collectUserAndTrafficInfo() {
    // User info
    const storedVisitCount = parseInt(
      localStorage.getItem('visitCount') || '0',
      10
    );
    const isRegistered = Boolean(localStorage.getItem('userToken'));

    this.demographics.user = {
      id: this.generateUserId(),
      type: {
        isNew: storedVisitCount === 0,
        isRegistered,
        firstVisit:
          localStorage.getItem('firstVisit') || new Date().toISOString(),
        visitCount: storedVisitCount + 1,
        lastVisit: new Date().toISOString(),
      },
      preferences: {
        language: navigator.language,
        theme: this.detectTheme(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    };

    // Traffic info
    const params = new URLSearchParams(window.location.search);
    this.demographics.traffic = {
      source: {
        referrer: document.referrer,
        type: this.determineTrafficType(document.referrer),
        medium: params.get('utm_medium') || 'none',
        campaign: params.get('utm_campaign') || undefined,
        term: params.get('utm_term') || undefined,
        content: params.get('utm_content') || undefined,
      },
      landing: {
        page: window.location.pathname,
        timestamp: new Date().toISOString(),
        queryParams: this.getQueryParams(),
      },
      attribution: {
        firstTouch: this.getFirstTouchAttribution(),
        lastTouch: {
          source: params.get('utm_source') || document.referrer || 'direct',
          medium: params.get('utm_medium') || 'none',
          campaign: params.get('utm_campaign') || 'none',
          timestamp: new Date().toISOString(),
        },
      },
    };

    // Update storage
    localStorage.setItem('visitCount', (storedVisitCount + 1).toString());
    if (storedVisitCount === 0) {
      localStorage.setItem('firstVisit', new Date().toISOString());
    }
  }

  private determineTrafficType(
    referrer: string
  ): 'direct' | 'organic' | 'paid' | 'social' | 'email' | 'referral' {
    if (!referrer) return 'direct';
    if (referrer.includes('google') || referrer.includes('bing'))
      return 'organic';
    if (new URLSearchParams(window.location.search).has('utm_medium'))
      return 'paid';
    if (referrer.includes('facebook') || referrer.includes('twitter'))
      return 'social';
    if (referrer.includes('mail') || referrer.includes('outlook'))
      return 'email';
    return 'referral';
  }

  private getFirstTouchAttribution() {
    const stored = localStorage.getItem('firstTouch');
    if (stored) {
      return JSON.parse(stored);
    }

    const firstTouch = {
      source: document.referrer || 'direct',
      medium:
        new URLSearchParams(window.location.search).get('utm_medium') || 'none',
      campaign:
        new URLSearchParams(window.location.search).get('utm_campaign') ||
        'none',
      timestamp: new Date().toISOString(),
    };

    localStorage.setItem('firstTouch', JSON.stringify(firstTouch));
    return firstTouch;
  }

  private getBrowserEngine(): string {
    const ua = navigator.userAgent;
    if (ua.includes('Gecko/')) return 'Gecko';
    if (ua.includes('WebKit/')) return 'WebKit';
    if (ua.includes('Trident/')) return 'Trident';
    if (ua.includes('Presto/')) return 'Presto';
    return 'Unknown';
  }

  private loadStoredDemographics(): DemographicsData {
    const stored = localStorage.getItem(this.storageKey);
    return stored ? JSON.parse(stored) : this.initializeDemographics();
  }

  private initializeDemographics(): DemographicsData {
    return {
      user: {
        id: this.generateUserId(),
        type: {
          isNew: true,
          isRegistered: false,
          firstVisit: new Date().toISOString(),
          visitCount: 1,
          lastVisit: new Date().toISOString(),
        },
        preferences: {
          language: navigator.language,
          theme: this.detectTheme(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      },
      device: {
        type: 'desktop',
        details: {
          os: {
            name: '',
            version: '',
            platform: navigator.platform,
          },
          screen: {
            width: window.screen.width,
            height: window.screen.height,
            density: window.devicePixelRatio,
            orientation: screen.orientation.type.includes('landscape')
              ? 'landscape'
              : 'portrait',
            colorDepth: screen.colorDepth,
          },
          browser: {
            name: '',
            version: '',
            engine: '',
            languages: Array.from(navigator.languages), // Convert readonly array to mutable
            cookies: navigator.cookieEnabled,
            localStorage: this.checkLocalStorage(),
            sessionStorage: this.checkSessionStorage(),
            webGL: this.checkWebGL(),
          },
        },
        capabilities: {
          touch: 'ontouchstart' in window,
          keyboard: 'onkeydown' in window,
          mouse: 'onmousemove' in window,
          maxTouchPoints: navigator.maxTouchPoints,
          bluetooth: 'bluetooth' in navigator,
          network: {
            type: '',
            speed: '',
            saveData: false,
          },
        },
      },
      location: {
        geo: {
          country: '',
          region: '',
          city: '',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        ip: {
          address: '',
          type: 'IPv4',
          proxy: false,
          hosting: false,
        },
        network: {
          autonomousSystem: '',
          isp: '',
          organization: '',
          domain: '',
        },
      },
      traffic: {
        source: {
          referrer: document.referrer,
          type: 'direct',
          medium: 'none',
        },
        landing: {
          page: window.location.pathname,
          timestamp: new Date().toISOString(),
          queryParams: this.getQueryParams(),
        },
        attribution: {
          firstTouch: {
            source: '',
            medium: '',
            campaign: '',
            timestamp: new Date().toISOString(),
          },
          lastTouch: {
            source: '',
            medium: '',
            campaign: '',
            timestamp: new Date().toISOString(),
          },
        },
      },
      behavior: {
        sessions: {
          count: 1,
          averageDuration: 0,
          bounceRate: 0,
          lastSessionDuration: 0,
        },
        engagement: {
          daysActive: 1,
          lastActiveDate: new Date().toISOString(),
          frequencyScore: 0,
          recencyScore: 0,
        },
        preferences: {
          visitDays: [
            new Date().toLocaleDateString('en-US', { weekday: 'long' }),
          ],
          visitHours: [new Date().getHours()],
          contentTypes: {},
          categories: {},
          interactions: {},
        },
      },
    };
  }

  private async collectGeolocation() {
    try {
      // Use IP geolocation service
      const response = await fetch('https://ipapi.co/json/');
      const data = await response.json();

      this.demographics.location.geo = {
        country: data.country_name,
        region: data.region,
        city: data.city,
        postalCode: data.postal,
        timezone: data.timezone,
      };

      this.demographics.location.ip = {
        address: data.ip,
        type: data.version === 4 ? 'IPv4' : 'IPv6',
        proxy: Boolean(data.proxy),
        hosting: Boolean(data.hosting),
      };

      this.demographics.location.network = {
        autonomousSystem: data.asn,
        isp: data.org,
        organization: data.org,
        domain: data.network,
      };

      // Try to get precise location if available
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            this.demographics.location.geo.coordinates = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
            };
            this.saveDemographics();
          },
          null,
          { enableHighAccuracy: true }
        );
      }
    } catch (error) {
      this.log('Failed to collect geolocation data', error);
    }
  }

  private async collectNetworkInfo() {
    const connection = (navigator as any).connection;
    if (connection) {
      this.demographics.device.capabilities.network = {
        type: connection.effectiveType,
        speed: this.getNetworkSpeed(connection.downlink),
        saveData: connection.saveData,
        rtt: connection.rtt,
        downlink: connection.downlink,
      };

      connection.addEventListener('change', () => {
        this.demographics.device.capabilities.network = {
          type: connection.effectiveType,
          speed: this.getNetworkSpeed(connection.downlink),
          saveData: connection.saveData,
          rtt: connection.rtt,
          downlink: connection.downlink,
        };
        this.saveDemographics();
      });
    }
  }

  private async collectBatteryInfo() {
    if ('getBattery' in navigator) {
      try {
        const battery = await (navigator as any).getBattery();
        const updateBatteryInfo = () => {
          this.demographics.device.capabilities.battery = {
            level: battery.level,
            charging: battery.charging,
            chargingTime: battery.chargingTime,
            dischargingTime: battery.dischargingTime,
          };
          this.saveDemographics();
        };

        battery.addEventListener('levelchange', updateBatteryInfo);
        battery.addEventListener('chargingchange', updateBatteryInfo);
        battery.addEventListener('chargingtimechange', updateBatteryInfo);
        battery.addEventListener('dischargingtimechange', updateBatteryInfo);

        updateBatteryInfo();
      } catch (error) {
        this.log('Failed to collect battery info', error);
      }
    }
  }

  private collectHardwareInfo() {
    if ('deviceMemory' in navigator) {
      this.demographics.device.capabilities.memory = {
        deviceMemory: (navigator as any).deviceMemory,
        hardwareConcurrency: navigator.hardwareConcurrency,
      };
    }
  }

  private trackBehavior() {
    // Update session info
    const now = new Date();
    this.demographics.behavior.sessions.count++;
    this.demographics.behavior.engagement.lastActiveDate = now.toISOString();

    // Update visit patterns
    const day = now.toLocaleDateString('en-US', { weekday: 'long' });
    const hour = now.getHours();

    if (!this.demographics.behavior.preferences.visitDays.includes(day)) {
      this.demographics.behavior.preferences.visitDays.push(day);
    }
    if (!this.demographics.behavior.preferences.visitHours.includes(hour)) {
      this.demographics.behavior.preferences.visitHours.push(hour);
    }

    // Calculate engagement scores
    this.updateEngagementScores();

    // Save changes
    this.saveDemographics();
  }

  private updateEngagementScores() {
    const now = new Date();
    const lastVisit = new Date(this.demographics.user.type.lastVisit);
    const daysSinceLastVisit =
      (now.getTime() - lastVisit.getTime()) / (1000 * 60 * 60 * 24);

    // Recency score (0-100)
    this.demographics.behavior.engagement.recencyScore = Math.max(
      0,
      100 - daysSinceLastVisit * 10
    );

    // Frequency score (0-100)
    this.demographics.behavior.engagement.frequencyScore = Math.min(
      100,
      (this.demographics.behavior.sessions.count / 10) * 100
    );

    this.demographics.user.type.lastVisit = now.toISOString();
  }

  private saveDemographics() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.demographics));
    this.analytics.track('demographicsUpdate', this.demographics);
  }

  // Utility methods
  private generateUserId(): string {
    return `user_${Math.random().toString(36).slice(2)}`;
  }

  private detectTheme(): 'light' | 'dark' | 'system' {
    if (
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
      return 'dark';
    }
    return 'light';
  }

  private checkLocalStorage(): boolean {
    try {
      localStorage.setItem('test', 'test');
      localStorage.removeItem('test');
      return true;
    } catch {
      return false;
    }
  }

  private checkSessionStorage(): boolean {
    try {
      sessionStorage.setItem('test', 'test');
      sessionStorage.removeItem('test');
      return true;
    } catch {
      return false;
    }
  }

  private checkWebGL(): boolean {
    try {
      const canvas = document.createElement('canvas');
      return !!(
        canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
      );
    } catch {
      return false;
    }
  }

  private getNetworkSpeed(downlink: number): string {
    if (downlink >= 10) return 'high';
    if (downlink >= 2) return 'medium';
    return 'low';
  }

  private getQueryParams(): Record<string, string> {
    const params: Record<string, string> = {};
    new URLSearchParams(window.location.search).forEach((value, key) => {
      params[key] = value;
    });
    return params;
  }

  cleanup() {
    this.saveDemographics();
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
