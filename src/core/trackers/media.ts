import { BaseTracker } from './base';

interface MediaMetrics {
  mediaId: string;
  type: 'video' | 'audio';
  source: string;
  metadata: {
    title?: string;
    duration?: number;
    currentTime: number;
    volume: number;
    playbackRate: number;
    quality?: string;
    resolution?: {
      width: number;
      height: number;
    };
    format?: string;
    codec?: string;
    bitrate?: number;
    fileSize?: number;
  };
  performance: {
    loadTime?: number;
    bufferingEvents: Array<{
      timestamp: number;
      duration: number;
      position: number;
    }>;
    qualityChanges: Array<{
      timestamp: number;
      from: string;
      to: string;
      reason: string;
    }>;
    errors: Array<{
      timestamp: number;
      type: string;
      message: string;
      position: number;
    }>;
  };
  interactions: {
    plays: number;
    pauses: number;
    seeks: number;
    volumeChanges: number;
    qualityChanges: number;
    fullscreenToggles: number;
    timestamps: {
      firstPlay?: number;
      lastPlay?: number;
      lastPause?: number;
      lastSeek?: number;
    };
  };
  analytics: {
    totalPlayTime: number;
    averageViewDuration: number;
    completionRate: number;
    engagementScore: number;
    bufferingRatio: number;
    dropoffPoints: number[];
    popularSegments: Array<{
      start: number;
      end: number;
      views: number;
    }>;
  };
  status: {
    isPlaying: boolean;
    isMuted: boolean;
    isFullscreen: boolean;
    currentQuality?: string;
    buffered: Array<{ start: number; end: number }>;
    playbackState: 'playing' | 'paused' | 'buffering' | 'ended' | 'error';
  };
}

export class MediaTracker extends BaseTracker {
  private mediaElements: WeakMap<
    HTMLMediaElement,
    {
      mediaId: string;
      type: 'video' | 'audio';
      startTime: number;
      lastPosition: number;
      metadata: MediaMetrics['metadata'];
      performance: MediaMetrics['performance'];
      interactions: MediaMetrics['interactions'];
      analytics: MediaMetrics['analytics'];
      status: MediaMetrics['status'];
    }
  > = new WeakMap();

  private static readonly PROGRESS_THRESHOLD = 5000; // 5 seconds
  private static readonly BUFFER_THRESHOLD = 500; // 500ms
  private static readonly QUALITY_LEVELS = [
    'auto',
    '4k',
    '1080p',
    '720p',
    '480p',
    '360p',
  ];
  private lastProgressUpdate: { [key: string]: number } = {};
  private observer: MutationObserver | null = null;

  async init(): Promise<void> {
    if (typeof window === 'undefined') return;

    // Use requestIdleCallback for non-critical initialization
    window.requestIdleCallback(() => {
      this.trackExistingMedia();
      this.observeNewMediaElements();
      this.trackDownloads();
    });

    this.log('Media tracker initialized');
  }

  getData(): any {
    const mediaData: MediaMetrics[] = [];
    document.querySelectorAll('video, audio').forEach((element) => {
      if (element instanceof HTMLMediaElement) {
        const info = this.mediaElements.get(element);
        if (!info) return;

        mediaData.push({
          mediaId: info.mediaId,
          type: info.type,
          source: element.currentSrc || element.src,
          metadata: {
            ...info.metadata,
            currentTime: element.currentTime,
            volume: element.volume,
            playbackRate: element.playbackRate,
          },
          performance: info.performance,
          interactions: info.interactions,
          analytics: {
            ...info.analytics,
            totalPlayTime: this.calculateTotalPlayTime(info),
            completionRate: this.calculateCompletionRate(element, info),
            engagementScore: this.calculateEngagementScore(info),
          },
          status: {
            ...info.status,
            isPlaying: !element.paused,
            isMuted: element.muted,
            isFullscreen: this.isFullscreen(element),
            buffered: this.getBufferedRanges(element),
            playbackState: this.getPlaybackState(element),
          },
        });
      }
    });

    return {
      media: mediaData,
      summary: {
        totalMedia: mediaData.length,
        activeMedia: mediaData.filter((m) => m.status.isPlaying).length,
        averagePlaybackRate: this.calculateAveragePlaybackRate(mediaData),
        totalPlayTime: this.calculateTotalPlayTime(mediaData),
        engagement: {
          averageEngagement: this.calculateAverageEngagement(mediaData),
          completionRates: this.calculateCompletionRates(mediaData),
          popularSegments: this.findPopularSegments(mediaData),
          dropoffPoints: this.findDropoffPoints(mediaData),
        },
        performance: {
          averageLoadTime: this.calculateAverageLoadTime(mediaData),
          bufferingRatio: this.calculateBufferingRatio(mediaData),
          errorRate: this.calculateErrorRate(mediaData),
        },
      },
    };
  }

  cleanup(): void {
    if (this.observer) {
      this.observer.disconnect();
    }
    document.querySelectorAll('video, audio').forEach((element) => {
      if (element instanceof HTMLMediaElement) {
        this.removeMediaListeners(element);
      }
    });
  }

  private trackExistingMedia(): void {
    document.querySelectorAll('video, audio').forEach((element) => {
      if (element instanceof HTMLMediaElement) {
        this.initializeMediaTracking(
          element,
          element.tagName.toLowerCase() as 'video' | 'audio'
        );
      }
    });
  }

  private observeNewMediaElements(): void {
    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            const mediaElements = node.getElementsByTagName('video');
            Array.from(mediaElements).forEach((video) => {
              this.initializeMediaTracking(video, 'video');
            });

            const audioElements = node.getElementsByTagName('audio');
            Array.from(audioElements).forEach((audio) => {
              this.initializeMediaTracking(audio, 'audio');
            });
          }
        });
      });
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  private initializeMediaTracking(
    element: HTMLMediaElement,
    type: 'video' | 'audio'
  ): void {
    if (this.mediaElements.has(element)) return;

    const mediaId = this.generateMediaId(element);
    const info = {
      mediaId,
      type,
      startTime: Date.now(),
      lastPosition: 0,
      metadata: this.getMediaMetadata(element),
      performance: {
        loadTime: 0,
        bufferingEvents: [],
        qualityChanges: [],
        errors: [],
      },
      interactions: {
        plays: 0,
        pauses: 0,
        seeks: 0,
        volumeChanges: 0,
        qualityChanges: 0,
        fullscreenToggles: 0,
        timestamps: {},
      },
      analytics: {
        totalPlayTime: 0,
        averageViewDuration: 0,
        completionRate: 0,
        engagementScore: 0,
        bufferingRatio: 0,
        dropoffPoints: [],
        popularSegments: [],
      },
      status: {
        isPlaying: false,
        isMuted: element.muted,
        isFullscreen: false,
        buffered: [],
        playbackState: 'paused',
      },
    };

    this.mediaElements.set(element, info);
    this.setupMediaListeners(element);
  }

  private setupMediaListeners(element: HTMLMediaElement): void {
    const handlers = {
      play: () => this.handlePlay(element),
      pause: () => this.handlePause(element),
      seeking: () => this.handleSeeking(element),
      seeked: () => this.handleSeeked(element),
      timeupdate: () => this.handleTimeUpdate(element),
      volumechange: () => this.handleVolumeChange(element),
      waiting: () => this.handleBuffering(element),
      error: (event: Event) => this.handleError(element, event),
      progress: () => this.handleProgress(element),
      loadedmetadata: () => this.handleMetadataLoaded(element),
      ratechange: () => this.handleRateChange(element),
      ended: () => this.handleEnded(element),
    };

    Object.entries(handlers).forEach(([event, handler]) => {
      element.addEventListener(event, handler, { passive: true });
    });

    // Track fullscreen changes
    document.addEventListener('fullscreenchange', () => {
      this.handleFullscreenChange(element);
    });
  }

  private removeMediaListeners(element: HTMLMediaElement): void {
    const events = [
      'play',
      'pause',
      'seeking',
      'seeked',
      'timeupdate',
      'volumechange',
      'waiting',
      'error',
      'progress',
      'loadedmetadata',
      'ratechange',
      'ended',
    ];

    events.forEach((event) => {
      element.removeEventListener(event, () => {});
    });
  }

  // Event handlers with performance optimizations
  private handlePlay(element: HTMLMediaElement): void {
    const info = this.mediaElements.get(element);
    if (!info) return;

    info.interactions.plays++;
    info.status.isPlaying = true;
    info.status.playbackState = 'playing';

    if (!info.interactions.timestamps.firstPlay) {
      info.interactions.timestamps.firstPlay = Date.now();
    }
    info.interactions.timestamps.lastPlay = Date.now();

    this.trackAnalytics('mediaPlay', {
      mediaId: info.mediaId,
      position: element.currentTime,
      timestamp: Date.now(),
    });
  }

  // ... implement other handlers similarly ...

  private calculateEngagementScore(info: any): number {
    const weights = {
      playTime: 0.4,
      interactions: 0.3,
      completionRate: 0.3,
    };

    const playTimeScore = Math.min(info.analytics.totalPlayTime / 300, 1); // Cap at 5 minutes
    const interactionScore =
      (info.interactions.plays +
        info.interactions.seeks +
        info.interactions.volumeChanges) /
      10; // Normalize to 0-1
    const completionScore = info.analytics.completionRate;

    return Math.round(
      (playTimeScore * weights.playTime +
        interactionScore * weights.interactions +
        completionScore * weights.completionRate) *
        100
    );
  }

  // Helper methods
  private generateMediaId(element: HTMLMediaElement): string {
    return `media_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  }

  private getMediaMetadata(
    element: HTMLMediaElement
  ): MediaMetrics['metadata'] {
    return {
      title: element.title || undefined,
      duration: element.duration || undefined,
      currentTime: element.currentTime,
      volume: element.volume,
      playbackRate: element.playbackRate,
      resolution:
        element instanceof HTMLVideoElement
          ? {
              width: element.videoWidth,
              height: element.videoHeight,
            }
          : undefined,
    };
  }

  private isFullscreen(element: HTMLElement): boolean {
    return (
      document.fullscreenElement === element ||
      (document as any).webkitFullscreenElement === element ||
      (document as any).mozFullScreenElement === element ||
      (document as any).msFullscreenElement === element
    );
  }

  private getBufferedRanges(
    element: HTMLMediaElement
  ): Array<{ start: number; end: number }> {
    const ranges = [];
    for (let i = 0; i < element.buffered.length; i++) {
      ranges.push({
        start: element.buffered.start(i),
        end: element.buffered.end(i),
      });
    }
    return ranges;
  }

  private getPlaybackState(
    element: HTMLMediaElement
  ): MediaMetrics['status']['playbackState'] {
    if (element.error) return 'error';
    if (element.ended) return 'ended';
    if (element.seeking || element.readyState < 3) return 'buffering';
    return element.paused ? 'paused' : 'playing';
  }

  // Analytics calculations
  private calculateAveragePlaybackRate(mediaData: MediaMetrics[]): number {
    if (mediaData.length === 0) return 1;
    return (
      mediaData.reduce((sum, m) => sum + m.metadata.playbackRate, 0) /
      mediaData.length
    );
  }

  private calculateTotalPlayTime(mediaData: any): number {
    return Array.isArray(mediaData)
      ? mediaData.reduce((total, m) => total + m.analytics.totalPlayTime, 0)
      : mediaData.analytics.totalPlayTime;
  }

  private calculateCompletionRate(
    element: HTMLMediaElement,
    info: any
  ): number {
    return element.duration
      ? Math.min((element.currentTime / element.duration) * 100, 100)
      : 0;
  }

  private calculateAverageEngagement(mediaData: MediaMetrics[]): number {
    if (mediaData.length === 0) return 0;
    return (
      mediaData.reduce((sum, m) => sum + m.analytics.engagementScore, 0) /
      mediaData.length
    );
  }

  private calculateCompletionRates(
    mediaData: MediaMetrics[]
  ): Record<string, number> {
    const rates = {
      '25%': 0,
      '50%': 0,
      '75%': 0,
      '100%': 0,
    };

    mediaData.forEach((m) => {
      const completion = m.analytics.completionRate;
      if (completion >= 100) rates['100%']++;
      else if (completion >= 75) rates['75%']++;
      else if (completion >= 50) rates['50%']++;
      else if (completion >= 25) rates['25%']++;
    });

    return rates;
  }

  private findPopularSegments(
    mediaData: MediaMetrics[]
  ): Array<{ start: number; end: number; views: number }> {
    // Implementation for finding most watched segments
    return [];
  }

  private findDropoffPoints(mediaData: MediaMetrics[]): number[] {
    // Implementation for finding common drop-off points
    return [];
  }

  private calculateAverageLoadTime(mediaData: MediaMetrics[]): number {
    const loadTimes = mediaData
      .map((m) => m.performance.loadTime)
      .filter((t): t is number => t !== undefined);
    return loadTimes.length
      ? loadTimes.reduce((sum, time) => sum + time, 0) / loadTimes.length
      : 0;
  }

  private calculateBufferingRatio(mediaData: MediaMetrics[]): number {
    if (mediaData.length === 0) return 0;
    return (
      mediaData.reduce((sum, m) => sum + m.analytics.bufferingRatio, 0) /
      mediaData.length
    );
  }

  private calculateErrorRate(mediaData: MediaMetrics[]): number {
    if (mediaData.length === 0) return 0;
    const totalErrors = mediaData.reduce(
      (sum, m) => sum + m.performance.errors.length,
      0
    );
    return totalErrors / mediaData.length;
  }

  private trackDownloads(): void {
    // Implementation for tracking media downloads
  }
}
