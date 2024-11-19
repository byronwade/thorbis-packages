import { BaseTracker } from './base';

interface LocationData {
  country?: string;
  region?: string;
  city?: string;
  timezone: string;
  ip?: string;
  loc?: string;
  org?: string;
  postal?: string;
}

interface DemographicsData {
  device: {
    type: string;
    os: string;
    browser: string;
    screen: {
      width: number;
      height: number;
      colorDepth: number;
    };
  };
  location: LocationData;
  user: {
    language: string;
    doNotTrack: string | null;
    cookiesEnabled: boolean;
    userAgent: string;
    platform: string;
    vendor: string;
    connection?: {
      type: string;
      downlink: number;
      rtt?: number;
      saveData?: boolean;
    };
  };
  preferences: {
    theme: 'light' | 'dark';
    reducedMotion: boolean;
    timezone: string;
    language: string;
    languages: readonly string[];
    timeFormat: Intl.ResolvedDateTimeFormatOptions;
    numberFormat: Intl.ResolvedNumberFormatOptions;
  };
}

export class DemographicsTracker extends BaseTracker {
  private demographicsData: DemographicsData;
  private locationCache: LocationData | null = null;
  private readonly CACHE_KEY = 'thorbis_location_cache';
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
  private locationPromise: Promise<LocationData> | null = null;

  constructor(analytics: any) {
    super(analytics);
    this.demographicsData = {
      device: this.getDeviceInfo(),
      location: { timezone: this.getTimezone() },
      user: this.getUserInfo(),
      preferences: this.getUserPreferences(),
    };
  }

  async init(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      // Try to get cached location data first
      this.locationCache = this.getLocationCache();

      if (this.locationCache) {
        this.demographicsData.location = this.locationCache;
      } else {
        // Only fetch location if not cached
        this.demographicsData.location = await this.getLocationInfo();
      }
    } catch (error) {
      console.warn('Failed to get location info:', error);
      this.demographicsData.location = this.getFallbackLocation();
    }

    this.log('Demographics tracker initialized');
  }

  getData(): DemographicsData {
    return {
      ...this.demographicsData,
      timestamp: Date.now(),
      pageUrl: window.location.href,
      referrer: document.referrer,
    };
  }

  cleanup(): void {
    // No cleanup needed for demographics tracker
  }

  private getDeviceInfo(): DemographicsData['device'] {
    return {
      type: this.getDeviceType(),
      os: this.getOS(),
      browser: this.getBrowser(),
      screen: {
        width: window.screen.width,
        height: window.screen.height,
        colorDepth: window.screen.colorDepth,
      },
    };
  }

  private getDeviceType(): string {
    if (typeof window === 'undefined') return 'unknown';

    const ua = navigator.userAgent;
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
      return 'tablet';
    }
    if (
      /Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(
        ua
      )
    ) {
      return 'mobile';
    }
    return 'desktop';
  }

  private getOS(): string {
    if (typeof window === 'undefined') return 'unknown';

    const ua = navigator.userAgent;
    const platform = navigator.platform;

    const osMap: Record<string, RegExp> = {
      Windows: /Windows/i,
      MacOS: /Mac OS|MacPPC|MacIntel|Mac_PowerPC/i,
      Linux: /Linux/i,
      Android: /Android/i,
      iOS: /iPhone|iPad|iPod/i,
    };

    return (
      Object.entries(osMap).find(
        ([_, regex]) => regex.test(ua) || regex.test(platform)
      )?.[0] || 'Unknown'
    );
  }

  private getBrowser(): string {
    if (typeof window === 'undefined') return 'unknown';

    const ua = navigator.userAgent;
    const browserMap: Record<string, RegExp> = {
      Chrome: /Chrome|CriOS/i,
      Firefox: /Firefox|FxiOS/i,
      Safari: /Safari/i,
      Edge: /Edge|Edg/i,
      Opera: /Opera|OPR/i,
    };

    // Check in specific order due to UA string patterns
    if (browserMap.Edge.test(ua)) return 'Edge';
    if (browserMap.Opera.test(ua)) return 'Opera';
    if (browserMap.Chrome.test(ua)) return 'Chrome';
    if (browserMap.Firefox.test(ua)) return 'Firefox';
    if (browserMap.Safari.test(ua) && !browserMap.Chrome.test(ua))
      return 'Safari';

    return 'Unknown';
  }

  private getUserInfo(): DemographicsData['user'] {
    if (typeof window === 'undefined') {
      return {
        language: 'unknown',
        doNotTrack: null,
        cookiesEnabled: false,
        userAgent: 'unknown',
        platform: 'unknown',
        vendor: 'unknown',
      };
    }

    return {
      language: navigator.language,
      doNotTrack: navigator.doNotTrack,
      cookiesEnabled: navigator.cookieEnabled,
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      vendor: navigator.vendor,
      connection:
        'connection' in navigator
          ? {
              type: (navigator.connection as any)?.effectiveType || 'unknown',
              downlink: (navigator.connection as any)?.downlink || 0,
              rtt: (navigator.connection as any)?.rtt,
              saveData: (navigator.connection as any)?.saveData,
            }
          : undefined,
    };
  }

  private getUserPreferences(): DemographicsData['preferences'] {
    if (typeof window === 'undefined') {
      return {
        theme: 'light',
        reducedMotion: false,
        timezone: 'UTC',
        language: 'en',
        languages: ['en'],
        timeFormat: new Intl.DateTimeFormat().resolvedOptions(),
        numberFormat: new Intl.NumberFormat().resolvedOptions(),
      };
    }

    return {
      theme: window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light',
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)')
        .matches,
      timezone: this.getTimezone(),
      language: navigator.language,
      languages: navigator.languages,
      timeFormat: new Intl.DateTimeFormat().resolvedOptions(),
      numberFormat: new Intl.NumberFormat().resolvedOptions(),
    };
  }

  private getTimezone(): string {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return 'UTC';
    }
  }

  private async getLocationInfo(): Promise<LocationData> {
    if (this.locationPromise) {
      return this.locationPromise;
    }

    this.locationPromise = new Promise(async (resolve) => {
      try {
        const services = [
          'https://ipapi.co/json/',
          'https://ip-api.com/json/',
          'https://ipinfo.io/json',
        ];

        for (const service of services) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);

            const response = await fetch(service, {
              signal: controller.signal,
              headers: { Accept: 'application/json' },
            });

            clearTimeout(timeoutId);

            if (response.ok) {
              const data = await response.json();
              const locationData = this.normalizeLocationData(data);
              this.cacheLocationData(locationData);
              resolve(locationData);
              return;
            }
          } catch (error) {
            continue;
          }
        }

        // If all services fail, try geolocation API
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            async (position) => {
              try {
                const { latitude, longitude } = position.coords;
                const response = await fetch(
                  `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
                );
                if (response.ok) {
                  const data = await response.json();
                  const locationData = this.normalizeLocationData(data);
                  this.cacheLocationData(locationData);
                  resolve(locationData);
                  return;
                }
              } catch {
                resolve(this.getFallbackLocation());
              }
            },
            () => resolve(this.getFallbackLocation())
          );
        } else {
          resolve(this.getFallbackLocation());
        }
      } catch {
        resolve(this.getFallbackLocation());
      }
    });

    return this.locationPromise;
  }

  private normalizeLocationData(data: any): LocationData {
    return {
      country: data.country_name || data.country || data.address?.country,
      region: data.region || data.address?.state,
      city: data.city || data.address?.city,
      timezone: data.timezone || this.getTimezone(),
      ip: data.ip,
      loc: data.loc || `${data.lat},${data.lon}`,
      org: data.org || data.isp,
      postal: data.postal || data.zip || data.address?.postcode,
    };
  }

  private getFallbackLocation(): LocationData {
    return {
      country: this.getCountryFromLanguage(),
      timezone: this.getTimezone(),
      language: navigator.language,
    };
  }

  private getCountryFromLanguage(): string {
    try {
      const lang = navigator.language;
      const country = new Intl.Locale(lang).maximize().region;
      return country || 'Unknown';
    } catch {
      return 'Unknown';
    }
  }

  private cacheLocationData(data: LocationData): void {
    try {
      localStorage.setItem(
        this.CACHE_KEY,
        JSON.stringify({
          data,
          timestamp: Date.now(),
        })
      );
    } catch {
      // Ignore storage errors
    }
  }

  private getLocationCache(): LocationData | null {
    try {
      const cached = localStorage.getItem(this.CACHE_KEY);
      if (!cached) return null;

      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp > this.CACHE_DURATION) {
        localStorage.removeItem(this.CACHE_KEY);
        return null;
      }

      return data;
    } catch {
      return null;
    }
  }
}
