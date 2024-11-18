import { BaseTracker } from './base';
import type { MediaData } from './types';

export class MediaTracker extends BaseTracker {
  private mediaElements: Map<
    string,
    {
      type: MediaData['type'];
      startTime: number;
      lastPosition: number;
    }
  > = new Map();

  init() {
    if (typeof window === 'undefined') return;

    // Track video elements
    this.trackVideoElements();
    // Track audio elements
    this.trackAudioElements();
    // Track downloads
    this.trackDownloads();

    // Watch for dynamically added media elements
    this.observeNewMediaElements();

    this.log('Media tracker initialized');
  }

  private trackVideoElements() {
    document.querySelectorAll('video').forEach((video) => {
      this.initializeMediaTracking(video, 'video');
    });
  }

  private trackAudioElements() {
    document.querySelectorAll('audio').forEach((audio) => {
      this.initializeMediaTracking(audio, 'audio');
    });
  }

  private initializeMediaTracking(
    element: HTMLMediaElement,
    type: 'video' | 'audio'
  ) {
    const mediaId =
      element.id || `media-${Math.random().toString(36).slice(2)}`;

    if (!element.id) {
      element.id = mediaId;
    }

    this.mediaElements.set(mediaId, {
      type,
      startTime: Date.now(),
      lastPosition: 0,
    });

    // Track play events
    element.addEventListener('play', () => {
      this.trackMediaEvent(mediaId, 'play', element.currentTime);
    });

    // Track pause events
    element.addEventListener('pause', () => {
      this.trackMediaEvent(mediaId, 'pause', element.currentTime);
    });

    // Track seeking events
    element.addEventListener('seeking', () => {
      this.trackMediaEvent(mediaId, 'seek', element.currentTime);
    });

    // Track completion
    element.addEventListener('ended', () => {
      this.trackMediaEvent(mediaId, 'complete', element.duration);
    });

    // Track progress periodically
    element.addEventListener('timeupdate', () => {
      const mediaInfo = this.mediaElements.get(mediaId);
      if (
        mediaInfo &&
        Math.abs(element.currentTime - mediaInfo.lastPosition) >= 5
      ) {
        mediaInfo.lastPosition = element.currentTime;
        this.trackMediaProgress(mediaId, element);
      }
    });
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

  private trackMediaEvent(
    mediaId: string,
    action: MediaData['action'],
    position: number
  ) {
    const mediaInfo = this.mediaElements.get(mediaId);
    if (!mediaInfo) return;

    const eventData: MediaData = {
      mediaId,
      type: mediaInfo.type,
      action,
      position,
      timestamp: new Date().toISOString(),
      duration: (document.getElementById(mediaId) as HTMLMediaElement)
        ?.duration,
    };

    this.analytics.track('mediaInteraction', eventData);
  }

  private trackMediaProgress(mediaId: string, element: HTMLMediaElement) {
    this.analytics.track('mediaProgress', {
      mediaId,
      type: this.mediaElements.get(mediaId)?.type,
      position: element.currentTime,
      duration: element.duration,
      timestamp: new Date().toISOString(),
      progress: (element.currentTime / element.duration) * 100,
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
    // Track final state for all media elements
    this.mediaElements.forEach((info, mediaId) => {
      const element = document.getElementById(mediaId) as HTMLMediaElement;
      if (element) {
        this.trackMediaEvent(mediaId, 'pause', element.currentTime);
      }
    });

    // Clear tracking data
    this.mediaElements.clear();
  }
}
