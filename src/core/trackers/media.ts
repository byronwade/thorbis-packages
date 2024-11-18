import { BaseTracker } from './base';
import type { MediaData, MediaProgressData, MediaDownloadData } from './types';

export class MediaTracker extends BaseTracker {
  private mediaElements: WeakMap<
    HTMLMediaElement,
    {
      mediaId: string;
      type: MediaData['type'];
      startTime: number;
      lastPosition: number;
      metadata: {
        title?: string;
        source?: string;
        quality?: string;
        playbackRate: number;
      };
    }
  > = new WeakMap();

  private static PROGRESS_THRESHOLD = 5000;

  private lastProgressUpdate: { [key: string]: number } = {};

  init() {
    if (typeof window === 'undefined') return;

    window.requestIdleCallback(() => {
      this.trackVideoElements();
      this.trackAudioElements();
      this.trackDownloads();
      this.observeNewMediaElements();
    });

    this.log('Media tracker initialized');
  }

  private trackVideoElements() {
    const videos = document.getElementsByTagName('video');
    Array.from(videos).forEach((video) => {
      this.initializeMediaTracking(video, 'video');
    });
  }

  private trackAudioElements() {
    const audios = document.getElementsByTagName('audio');
    Array.from(audios).forEach((audio) => {
      this.initializeMediaTracking(audio, 'audio');
    });
  }

  private initializeMediaTracking(
    element: HTMLMediaElement,
    type: 'video' | 'audio'
  ) {
    const mediaId = element.id || `media-${crypto.randomUUID()}`;

    if (!element.id) {
      element.id = mediaId;
    }

    const metadata = {
      title: element.getAttribute('title') || undefined,
      source: element.currentSrc || undefined,
      quality: element.getAttribute('data-quality') || undefined,
      playbackRate: element.playbackRate,
    };

    this.mediaElements.set(element, {
      mediaId,
      type,
      startTime: performance.now(),
      lastPosition: 0,
      metadata,
    });

    const eventOptions = { passive: true };

    const events: { [key: string]: MediaData['action'] } = {
      play: 'play',
      pause: 'pause',
      seeking: 'seek',
      ended: 'complete',
    };

    Object.entries(events).forEach(([event, action]) => {
      element.addEventListener(
        event,
        () => this.trackMediaEvent(element, action),
        eventOptions
      );
    });

    element.addEventListener(
      'timeupdate',
      () => this.handleTimeUpdate(element),
      eventOptions
    );
  }

  private handleTimeUpdate(element: HTMLMediaElement) {
    const mediaInfo = this.mediaElements.get(element);
    if (!mediaInfo) return;

    const now = performance.now();
    const lastUpdate = this.lastProgressUpdate[mediaInfo.mediaId] || 0;

    if (now - lastUpdate >= MediaTracker.PROGRESS_THRESHOLD) {
      this.trackMediaProgress(element);
      this.lastProgressUpdate[mediaInfo.mediaId] = now;
    }
  }

  private trackMediaEvent(
    element: HTMLMediaElement,
    action: MediaData['action']
  ) {
    const mediaInfo = this.mediaElements.get(element);
    if (!mediaInfo) return;

    const eventData: MediaData = {
      mediaId: mediaInfo.mediaId,
      type: mediaInfo.type,
      action,
      position: element.currentTime,
      timestamp: new Date().toISOString(),
      duration: element.duration,
      metadata: mediaInfo.metadata,
      buffered: this.getBufferedRanges(element),
      volume: element.volume,
      muted: element.muted,
      playbackRate: element.playbackRate,
    };

    this.analytics.track('mediaInteraction', eventData);
  }

  private getBufferedRanges(element: HTMLMediaElement) {
    const ranges = [];
    for (let i = 0; i < element.buffered.length; i++) {
      ranges.push({
        start: element.buffered.start(i),
        end: element.buffered.end(i),
      });
    }
    return ranges;
  }

  private trackMediaProgress(element: HTMLMediaElement) {
    const mediaInfo = this.mediaElements.get(element);
    if (!mediaInfo) return;

    const progressData: MediaProgressData = {
      mediaId: mediaInfo.mediaId,
      type: mediaInfo.type,
      position: element.currentTime,
      duration: element.duration,
      timestamp: new Date().toISOString(),
      progress: (element.currentTime / element.duration) * 100,
      metadata: mediaInfo.metadata,
      buffered: this.getBufferedRanges(element),
      playbackQuality: {
        droppedFrames: (element as HTMLVideoElement).getVideoPlaybackQuality?.()
          ?.droppedVideoFrames,
        totalFrames: (element as HTMLVideoElement).getVideoPlaybackQuality?.()
          ?.totalVideoFrames,
      },
    };

    this.analytics.track('mediaProgress', progressData);
  }

  private trackDownloads() {
    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const downloadLink = target.closest(
        'a[download]'
      ) as HTMLAnchorElement | null;

      if (downloadLink) {
        const mediaId =
          downloadLink.id ||
          downloadLink.getAttribute('download') ||
          downloadLink.href;

        this.analytics.track('mediaDownload', {
          mediaId,
          type: 'document',
          action: 'download',
          timestamp: new Date().toISOString(),
          url: downloadLink.href,
        });
      }
    });
  }

  private observeNewMediaElements() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLVideoElement) {
            this.initializeMediaTracking(node, 'video');
          } else if (node instanceof HTMLAudioElement) {
            this.initializeMediaTracking(node, 'audio');
          }
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  cleanup() {
    // Store references to all media elements before cleanup
    const mediaElements = document.querySelectorAll('video, audio');

    mediaElements.forEach((element) => {
      if (element instanceof HTMLMediaElement) {
        const info = this.mediaElements.get(element);
        if (!info) return;

        const eventData: MediaData = {
          mediaId: info.mediaId,
          type: info.type,
          action: 'pause',
          position: element.currentTime,
          timestamp: new Date().toISOString(),
          duration: element.duration,
          metadata: info.metadata,
          buffered: this.getBufferedRanges(element),
          volume: element.volume,
          muted: element.muted,
          playbackRate: element.playbackRate,
        };

        this.analytics.track('mediaInteraction', eventData);

        // Delete the reference from WeakMap
        this.mediaElements.delete(element);
      }
    });

    // Clear the progress update tracking
    this.lastProgressUpdate = {};
  }
}
