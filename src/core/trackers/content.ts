import { BaseTracker } from './base';
import type { ContentPerformance } from './types';

export class ContentTracker extends BaseTracker {
  private contentStats: Map<string, ContentPerformance> = new Map();
  private viewStartTime: number = Date.now();
  private scrollPositions: number[] = [];
  private interactionEvents: Set<string> = new Set();
  private readonly SCROLL_CHECKPOINTS = [25, 50, 75, 100];

  init() {
    if (typeof window === 'undefined') return;

    // Initialize content tracking
    this.initializeContentTracking();

    // Track scroll depth
    this.trackScrollDepth();

    // Track content interactions
    this.trackInteractions();

    // Track content sharing
    this.trackSocialSharing();

    // Track content engagement
    this.trackEngagement();

    // Track content visibility
    this.observeContentVisibility();

    this.log('Content tracker initialized');
  }

  private initializeContentTracking() {
    const contentId = this.generateContentId();
    const contentType = this.determineContentType();
    const metadata = this.collectMetadata();

    const contentData: ContentPerformance = {
      content_id: contentId,
      url: window.location.href,
      type: contentType,
      metadata: {
        title: metadata.title,
        author: metadata.author,
        publishDate: metadata.publishDate,
        category: metadata.category,
        tags: metadata.tags,
        wordCount: metadata.wordCount,
        readingTime: metadata.readingTime,
        hasVideo: metadata.hasVideo,
        hasImages: metadata.hasImages,
      },
      metrics: {
        views: 1,
        unique_views: 0,
        time_spent_avg: 0,
        engagement_rate: 0,
        click_through_rate: 0,
        bounce_rate: 0,
        conversion_rate: 0,
        read_completion_rate: 0,
      },
      interactions: {
        likes: 0,
        shares: 0,
        comments: 0,
        saves: 0,
        clicks: 0,
        highlights: 0,
        copies: 0,
      },
      scroll_depth_distribution: {
        '25%': 0,
        '50%': 0,
        '75%': 0,
        '100%': 0,
      },
      engagement_signals: {
        scroll_speed: [],
        time_to_first_interaction: null,
        interaction_frequency: 0,
        return_visits: 0,
        exit_points: [],
      },
      traffic_sources: {
        referrer: document.referrer || 'direct',
        utm_source:
          new URLSearchParams(window.location.search).get('utm_source') ||
          'direct',
        utm_medium:
          new URLSearchParams(window.location.search).get('utm_medium') ||
          'none',
        utm_campaign:
          new URLSearchParams(window.location.search).get('utm_campaign') ||
          'none',
      },
      performance_metrics: {
        load_time: 0,
        time_to_interactive: 0,
        largest_contentful_paint: 0,
      },
      user_segments: new Set(),
      ab_test_variants: new Map(),
    };

    this.contentStats.set(contentId, contentData);
    this.trackInitialView(contentData);
  }

  private generateContentId(): string {
    const urlPath = window.location.pathname;
    const timestamp = Date.now();
    return `content_${urlPath.replace(/\W+/g, '_')}_${timestamp}`;
  }

  private determineContentType(): 'article' | 'video' | 'product' | 'landing' {
    const metaType = document
      .querySelector('meta[property="og:type"]')
      ?.getAttribute('content');
    const hasVideo = document.querySelector('video') !== null;
    const hasProductSchema = document
      .querySelector('script[type="application/ld+json"]')
      ?.textContent?.includes('"@type":"Product"');

    if (hasVideo) return 'video';
    if (hasProductSchema) return 'product';
    if (
      window.location.pathname === '/' ||
      window.location.pathname.includes('/landing')
    )
      return 'landing';
    return 'article';
  }

  private collectMetadata() {
    const wordCount = this.calculateWordCount();
    const readingTime = Math.ceil(wordCount / 200); // Average reading speed of 200 words per minute

    return {
      title: document.title,
      author:
        document
          .querySelector('meta[name="author"]')
          ?.getAttribute('content') || 'unknown',
      publishDate:
        document
          .querySelector('meta[property="article:published_time"]')
          ?.getAttribute('content') || new Date().toISOString(),
      category:
        document
          .querySelector('meta[property="article:section"]')
          ?.getAttribute('content') || 'uncategorized',
      tags: Array.from(
        document.querySelectorAll('meta[property="article:tag"]')
      ).map((tag) => tag.getAttribute('content')),
      wordCount,
      readingTime,
      hasVideo: document.querySelector('video') !== null,
      hasImages: document.querySelectorAll('img').length > 0,
    };
  }

  private calculateWordCount(): number {
    const content = document.querySelector('article') || document.body;
    const text = content.textContent || '';
    return text.trim().split(/\s+/).length;
  }

  private trackScrollDepth() {
    let lastScrollTime = Date.now();
    let lastScrollTop = window.scrollY;

    window.addEventListener('scroll', () => {
      const currentTime = Date.now();
      const currentScrollTop = window.scrollY;
      const contentData = this.getCurrentContent();
      if (!contentData) return;

      // Calculate scroll speed
      const timeDiff = currentTime - lastScrollTime;
      const scrollDiff = Math.abs(currentScrollTop - lastScrollTop);
      const scrollSpeed = scrollDiff / timeDiff;

      contentData.engagement_signals.scroll_speed.push(scrollSpeed);

      // Track scroll depth checkpoints
      const scrollPercentage = this.calculateScrollPercentage();
      this.SCROLL_CHECKPOINTS.forEach((checkpoint) => {
        if (
          scrollPercentage >= checkpoint &&
          !this.scrollPositions.includes(checkpoint)
        ) {
          this.scrollPositions.push(checkpoint);
          const key =
            `${checkpoint}%` as keyof typeof contentData.scroll_depth_distribution;
          contentData.scroll_depth_distribution[key]++;

          this.analytics.track('contentScrollDepth', {
            content_id: contentData.content_id,
            depth: checkpoint,
            timestamp: new Date().toISOString(),
          });
        }
      });

      lastScrollTime = currentTime;
      lastScrollTop = currentScrollTop;
    });
  }

  private trackInteractions() {
    document.addEventListener('click', (event) => {
      const contentData = this.getCurrentContent();
      if (!contentData) return;

      const target = event.target as HTMLElement;
      const interactionType = this.getInteractionType(target);

      if (interactionType) {
        contentData.interactions[interactionType]++;

        if (!contentData.engagement_signals.time_to_first_interaction) {
          contentData.engagement_signals.time_to_first_interaction =
            Date.now() - this.viewStartTime;
        }

        contentData.engagement_signals.interaction_frequency =
          this.interactionEvents.size /
          ((Date.now() - this.viewStartTime) / 1000);

        this.analytics.track('contentInteraction', {
          content_id: contentData.content_id,
          type: interactionType,
          element: target.tagName,
          timestamp: new Date().toISOString(),
        });
      }
    });
  }

  private trackSocialSharing() {
    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const shareButton = target.closest('[data-share]');

      if (shareButton) {
        const contentData = this.getCurrentContent();
        if (!contentData) return;

        const platform = shareButton.getAttribute('data-share');
        contentData.interactions.shares++;

        this.analytics.track('contentShare', {
          content_id: contentData.content_id,
          platform,
          timestamp: new Date().toISOString(),
        });
      }
    });
  }

  private trackEngagement() {
    // Track copy events
    document.addEventListener('copy', () => {
      const contentData = this.getCurrentContent();
      if (!contentData) return;

      contentData.interactions.copies++;
      this.interactionEvents.add(`copy_${Date.now()}`);
    });

    // Track text selection (highlights)
    document.addEventListener('selectionchange', () => {
      const selection = window.getSelection();
      if (selection && selection.toString().length > 10) {
        const contentData = this.getCurrentContent();
        if (!contentData) return;

        contentData.interactions.highlights++;
        this.interactionEvents.add(`highlight_${Date.now()}`);
      }
    });
  }

  private observeContentVisibility() {
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const contentData = this.getCurrentContent();
            if (!contentData) return;

            if (entry.isIntersecting) {
              const visibleTime = entry.time;
              this.analytics.track('contentVisibility', {
                content_id: contentData.content_id,
                visible_time: visibleTime,
                intersection_ratio: entry.intersectionRatio,
                timestamp: new Date().toISOString(),
              });
            }
          });
        },
        {
          threshold: [0, 0.25, 0.5, 0.75, 1],
        }
      );

      const contentElement = document.querySelector('article') || document.body;
      observer.observe(contentElement);
    }
  }

  private getCurrentContent(): ContentPerformance | undefined {
    return Array.from(this.contentStats.values())[0];
  }

  private calculateScrollPercentage(): number {
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    const scrollTop = window.scrollY;
    return Math.round(((scrollTop + windowHeight) / documentHeight) * 100);
  }

  private getInteractionType(
    element: HTMLElement
  ): keyof ContentPerformance['interactions'] | null {
    if (element.closest('[data-like]')) return 'likes';
    if (element.closest('[data-save]')) return 'saves';
    if (element.closest('[data-comment]')) return 'comments';
    if (element.closest('a')) return 'clicks';
    if (element.closest('[data-highlight]')) return 'highlights';
    if (element.closest('[data-copy]')) return 'copies';
    return null;
  }

  private trackInitialView(contentData: ContentPerformance) {
    // Track performance metrics
    if ('performance' in window) {
      const navigation = performance.getEntriesByType(
        'navigation'
      )[0] as PerformanceNavigationTiming;
      contentData.performance_metrics = {
        load_time: navigation.loadEventEnd - navigation.requestStart,
        time_to_interactive:
          navigation.domInteractive - navigation.requestStart,
        largest_contentful_paint: 0, // Will be updated via PerformanceObserver
      };
    }

    // Track traffic source
    const referrer = document.referrer;
    const utm = new URLSearchParams(window.location.search);
    contentData.traffic_sources = {
      referrer: referrer,
      utm_source: utm.get('utm_source') || 'direct',
      utm_medium: utm.get('utm_medium') || 'none',
      utm_campaign: utm.get('utm_campaign') || 'none',
    };

    this.analytics.track('contentView', {
      content_id: contentData.content_id,
      type: contentData.type,
      metadata: contentData.metadata,
      traffic_source: contentData.traffic_sources,
      timestamp: new Date().toISOString(),
    });
  }

  cleanup() {
    const contentData = this.getCurrentContent();
    if (!contentData) return;

    const timeSpent = Date.now() - this.viewStartTime;
    contentData.metrics.time_spent_avg = timeSpent;
    contentData.metrics.engagement_rate =
      this.interactionEvents.size / (timeSpent / 1000);
    contentData.metrics.read_completion_rate =
      Math.max(...this.scrollPositions) / 100;

    this.analytics.track('contentExit', {
      content_id: contentData.content_id,
      metrics: contentData.metrics,
      interactions: contentData.interactions,
      scroll_depth: contentData.scroll_depth_distribution,
      engagement_signals: contentData.engagement_signals,
      timestamp: new Date().toISOString(),
    });
  }
}
