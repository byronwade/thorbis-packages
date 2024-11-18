import { BaseTracker } from './base';

interface EngagementMetrics {
  interactions: {
    rageClicks: Array<{
      timestamp: string;
      elementId: string;
      clickCount: number;
      elementType: string;
    }>;
    rapidScrolling: Array<{
      timestamp: string;
      duration: number;
      direction: 'up' | 'down';
      velocity: number;
    }>;
    multiClicks: Array<{
      timestamp: string;
      elementId: string;
      frequency: number; // clicks per second
      pattern: 'double' | 'triple' | 'multiple';
    }>;
    deadClicks: Array<{
      timestamp: string;
      position: { x: number; y: number };
      nearestInteractive: string;
    }>;
    rapidInteractions: Array<{
      timestamp: string;
      type: 'click' | 'scroll' | 'keypress';
      frequency: number;
      duration: number;
    }>;
    hovers: Array<{
      timestamp: string;
      elementType: string;
      elementId: string;
      content: string;
      duration: number;
      intentScore: number;
    }>;
    textSelections: Array<{
      timestamp: string;
      text: string;
      elementType: string;
      elementPath: string;
      selectionLength: number;
      duration: number;
      context: {
        paragraph?: string;
        nearestHeading?: string;
      };
    }>;
  };
}

interface ScrollPattern {
  type: 'smooth' | 'rapid' | 'erratic' | 'jump';
  startTime: number;
  endTime: number;
  startPosition: number;
  endPosition: number;
  velocity: number;
  directionChanges: number;
}

export class EngagementTracker extends BaseTracker {
  private metrics: EngagementMetrics;
  private lastScrollY: number = 0;
  private scrollStartTime: number = 0;
  private readonly RAGE_CLICK_THRESHOLD = 3;
  private readonly RAGE_CLICK_INTERVAL = 1000; // ms
  private readonly RAPID_SCROLL_THRESHOLD = 1000; // pixels per second
  private recentClicks: Map<string, { count: number; timestamp: number }> =
    new Map();
  private currentHover: {
    element: HTMLElement;
    startTime: number;
    content: string;
  } | null = null;
  private readonly CONTENT_SELECTORS = [
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'button',
    'a',
    'input[type="text"]',
    'input[type="search"]',
    'input[type="email"]',
    'input[type="tel"]',
    'input[type="number"]',
    'input[type="password"]',
    'textarea',
    'select',
    'img[alt]',
    'video[controls]',
    'audio[controls]',
    'span[data-content]',
    'label:not(:empty)',
    'p:not(:empty)',
    '[role="button"]',
    '[role="link"]',
    '[role="menuitem"]',
    '[data-tracking]',
    '[data-interactive]',
  ].join(',');

  private readonly SCROLL_THRESHOLDS = {
    SMOOTH: 100, // pixels per second (slower)
    RAPID: 800, // pixels per second (faster)
    ERRATIC_CHANGES: 2, // direction changes within timeframe
    PATTERN_TIMEFRAME: 500, // ms to analyze pattern (shorter for more responsive)
    JUMP_THRESHOLD: 800, // pixels
    MIN_DISTANCE: 100, // minimum distance to track
    THROTTLE: 50, // ms between scroll events
  };

  private scrollHistory: Array<{
    position: number;
    timestamp: number;
    pageHeight: number;
    viewportHeight: number;
  }> = [];
  private currentScrollPattern: ScrollPattern | null = null;
  private lastScrollEvent = 0;
  private scrollPatternTimeout: NodeJS.Timeout | null = null;

  private readonly BATCH_CONFIG = {
    HOVER_DELAY: 10, // ms to wait before sending hover events
    SCROLL_DELAY: 100, // ms to wait before sending scroll events
    MAX_BATCH_SIZE: 10, // max events to batch together
  };

  private eventBatches = {
    hovers: [] as any[],
    scrolls: [] as any[],
    hoverTimeout: null as NodeJS.Timeout | null,
    scrollTimeout: null as NodeJS.Timeout | null,
  };

  private currentSelection: {
    startTime: number;
    text: string;
    element: HTMLElement;
  } | null = null;

  constructor(analytics: any) {
    super(analytics);
    this.metrics = this.initializeMetrics();
  }

  init(): void {
    if (typeof window === 'undefined') return;

    // Bind methods to preserve 'this' context
    this.handleSelectionChange = this.handleSelectionChange.bind(this);
    this.handleSelectionEnd = this.handleSelectionEnd.bind(this);

    // Add selection event listeners
    document.addEventListener('selectionchange', this.handleSelectionChange);
    document.addEventListener('mouseup', this.handleSelectionEnd);
    document.addEventListener('keyup', this.handleSelectionEnd);

    // Existing listeners
    window.addEventListener('mouseover', this.handleMouseOver.bind(this), {
      passive: true,
    });
    window.addEventListener('mouseout', this.handleMouseOut.bind(this), {
      passive: true,
    });
    window.addEventListener('click', this.handleClick.bind(this), {
      passive: true,
    });
    window.addEventListener('scroll', this.handleScroll.bind(this), {
      passive: true,
    });

    setInterval(() => {
      this.log('Current engagement metrics:', this.metrics);
    }, 10000);

    this.log('Engagement tracker initialized with text selection tracking');
  }

  private initializeMetrics(): EngagementMetrics {
    return {
      interactions: {
        rageClicks: [],
        rapidScrolling: [],
        multiClicks: [],
        deadClicks: [],
        rapidInteractions: [],
        hovers: [], // Add hovers array
        textSelections: [],
      },
    };
  }

  private handleClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const elementId = target.id || target.tagName;
    const now = Date.now();

    // Track rage clicks
    const recentClick = this.recentClicks.get(elementId);
    if (recentClick) {
      if (now - recentClick.timestamp < this.RAGE_CLICK_INTERVAL) {
        recentClick.count++;
        if (recentClick.count >= this.RAGE_CLICK_THRESHOLD) {
          const rageClick = {
            timestamp: new Date().toISOString(),
            elementId,
            clickCount: recentClick.count,
            elementType: target.tagName.toLowerCase(),
          };
          this.metrics.interactions.rageClicks.push(rageClick);
          this.log('Rage click detected:', rageClick);
          this.analytics.track('rageClick', rageClick);
          this.recentClicks.delete(elementId);
        }
      } else {
        this.recentClicks.set(elementId, { count: 1, timestamp: now });
      }
    } else {
      this.recentClicks.set(elementId, { count: 1, timestamp: now });
    }

    // Track dead clicks
    if (!this.isInteractiveElement(target)) {
      const deadClick = {
        timestamp: new Date().toISOString(),
        position: { x: event.pageX, y: event.pageY },
        nearestInteractive: this.findNearestInteractiveElement(target),
      };
      this.metrics.interactions.deadClicks.push(deadClick);
      this.log('Dead click detected:', deadClick);
      this.analytics.track('deadClick', deadClick);
    }
  }

  private handleScroll = () => {
    const now = Date.now();
    const currentScrollY = window.scrollY;

    // Throttle scroll events
    if (now - this.lastScrollEvent < this.SCROLL_THRESHOLDS.THROTTLE) {
      return;
    }
    this.lastScrollEvent = now;

    // Add to scroll history
    this.scrollHistory.push({
      position: currentScrollY,
      timestamp: now,
      pageHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
    });

    // Keep only recent history
    this.scrollHistory = this.scrollHistory.filter(
      (entry) =>
        now - entry.timestamp <= this.SCROLL_THRESHOLDS.PATTERN_TIMEFRAME
    );

    // Only analyze if we have enough data points
    if (this.scrollHistory.length >= 2) {
      this.detectScrollPattern();
    }
  };

  private detectScrollPattern() {
    const latest = this.scrollHistory[this.scrollHistory.length - 1];
    const first = this.scrollHistory[0];

    const duration = latest.timestamp - first.timestamp;
    const distance = Math.abs(latest.position - first.position);
    const velocity = (distance / duration) * 1000; // pixels per second
    const directionChanges = this.countDirectionChanges();
    const percentScrolled =
      (distance / document.documentElement.scrollHeight) * 100;

    // Determine pattern type
    let type: ScrollPattern['type'];
    let shouldLog = false;

    if (distance < this.SCROLL_THRESHOLDS.MIN_DISTANCE) {
      return; // Ignore tiny scrolls
    }

    if (directionChanges >= this.SCROLL_THRESHOLDS.ERRATIC_CHANGES) {
      type = 'erratic';
      shouldLog = true;
    } else if (
      distance >= this.SCROLL_THRESHOLDS.JUMP_THRESHOLD &&
      duration < 300
    ) {
      type = 'jump';
      shouldLog = true;
    } else if (velocity >= this.SCROLL_THRESHOLDS.RAPID) {
      type = 'rapid';
      shouldLog = true;
    } else if (velocity <= this.SCROLL_THRESHOLDS.SMOOTH) {
      type = 'smooth';
      shouldLog = distance >= this.SCROLL_THRESHOLDS.MIN_DISTANCE;
    } else {
      return; // Ignore intermediate scrolls
    }

    if (shouldLog) {
      const pattern = {
        timestamp: new Date().toISOString(),
        type,
        metrics: {
          duration,
          distance,
          velocity,
          directionChanges,
          percentScrolled,
        },
        positions: {
          start: first.position,
          end: latest.position,
          pageHeight: latest.pageHeight,
          viewportHeight: latest.viewportHeight,
        },
        context: {
          readingTime: duration >= 1000 && type === 'smooth',
          isJumpy: type === 'jump' || type === 'erratic',
          isSkimming: type === 'rapid' && percentScrolled > 30,
        },
      };

      // Add to batch instead of sending immediately
      this.eventBatches.scrolls.push(pattern);

      if (this.eventBatches.scrollTimeout) {
        clearTimeout(this.eventBatches.scrollTimeout);
      }

      this.eventBatches.scrollTimeout = setTimeout(() => {
        if (this.eventBatches.scrolls.length > 0) {
          // Send consolidated scroll patterns
          this.analytics.track('scrollPatterns', {
            patterns: this.eventBatches.scrolls,
            count: this.eventBatches.scrolls.length,
            summary: this.summarizeScrollPatterns(this.eventBatches.scrolls),
          });
          this.eventBatches.scrolls = [];
        }
      }, this.BATCH_CONFIG.SCROLL_DELAY);

      // Reset history after logging
      this.scrollHistory = [latest];
    }
  }

  private countDirectionChanges(): number {
    let changes = 0;
    let lastDirection = 0;

    for (let i = 1; i < this.scrollHistory.length; i++) {
      const currentDirection = Math.sign(
        this.scrollHistory[i].position - this.scrollHistory[i - 1].position
      );

      if (currentDirection !== 0 && currentDirection !== lastDirection) {
        changes++;
        lastDirection = currentDirection;
      }
    }

    return changes;
  }

  private isInteractiveElement(element: HTMLElement): boolean {
    const interactiveTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'];
    return (
      interactiveTags.includes(element.tagName) ||
      element.hasAttribute('onclick') ||
      element.hasAttribute('role') ||
      window.getComputedStyle(element).cursor === 'pointer'
    );
  }

  private findNearestInteractiveElement(element: HTMLElement): string {
    const interactiveElement = element.closest(
      'a, button, input, select, textarea, [role="button"]'
    );
    if (interactiveElement) {
      return `${interactiveElement.tagName.toLowerCase()}${
        interactiveElement.id ? `#${interactiveElement.id}` : ''
      }`;
    }
    return 'none';
  }

  private isContentElement(element: HTMLElement): boolean {
    // Skip body, html, article, section, div, and other structural elements
    const skipTags = [
      'BODY',
      'HTML',
      'ARTICLE',
      'SECTION',
      'DIV',
      'MAIN',
      'ASIDE',
      'NAV',
      'HEADER',
      'FOOTER',
    ];
    if (skipTags.includes(element.tagName)) {
      return false;
    }

    // Check if it's one of our specific content elements
    if (element.matches(this.CONTENT_SELECTORS)) {
      // For images, ensure they have alt text
      if (element.tagName === 'IMG') {
        return !!element.getAttribute('alt');
      }
      // For text elements, ensure they have content
      if (['SPAN', 'P', 'LABEL'].includes(element.tagName)) {
        const text = element.textContent?.trim();
        return !!text && text.length > 0;
      }
      return true;
    }

    return false;
  }

  private handleMouseOver(event: MouseEvent) {
    const target = event.target as HTMLElement;

    // Try to find the nearest content element
    const contentElement = target.closest(
      this.CONTENT_SELECTORS
    ) as HTMLElement;

    if (contentElement && this.isContentElement(contentElement)) {
      let content: string;

      // Get appropriate content based on element type
      if (contentElement.tagName === 'IMG') {
        content = contentElement.getAttribute('alt') || 'image';
      } else if (contentElement instanceof HTMLInputElement) {
        content = contentElement.value || contentElement.placeholder || 'input';
      } else if (contentElement instanceof HTMLSelectElement) {
        content =
          contentElement.options[contentElement.selectedIndex]?.text ||
          'select';
      } else {
        content =
          contentElement.textContent?.trim() ||
          contentElement.getAttribute('aria-label') ||
          'no-content';
      }

      this.currentHover = {
        element: contentElement,
        startTime: Date.now(),
        content: content.slice(0, 100),
      };

      this.log('Content hover started:', {
        elementType: contentElement.tagName.toLowerCase(),
        content: content.slice(0, 50) + (content.length > 50 ? '...' : ''),
      });
    }
  }

  private handleMouseOut(event: MouseEvent) {
    if (!this.currentHover) return;

    const duration = Date.now() - this.currentHover.startTime;

    if (duration >= 100) {
      const hoverData = {
        timestamp: new Date().toISOString(),
        elementType: this.currentHover.element.tagName.toLowerCase(),
        elementId: this.currentHover.element.id || 'no-id',
        content: this.currentHover.content,
        duration,
        intentScore: this.calculateIntentScore(duration),
      };

      // Add to batch instead of sending immediately
      this.eventBatches.hovers.push(hoverData);

      // Clear existing timeout
      if (this.eventBatches.hoverTimeout) {
        clearTimeout(this.eventBatches.hoverTimeout);
      }

      // Set new timeout to send batch
      this.eventBatches.hoverTimeout = setTimeout(() => {
        if (this.eventBatches.hovers.length > 0) {
          this.analytics.track('contentHovers', {
            hovers: this.eventBatches.hovers,
            count: this.eventBatches.hovers.length,
          });
          this.eventBatches.hovers = [];
        }
      }, this.BATCH_CONFIG.HOVER_DELAY);
    }

    this.currentHover = null;
  }

  private calculateIntentScore(duration: number): number {
    // Basic intent scoring based on hover duration
    // 0-500ms: 0-25
    // 500-2000ms: 25-75
    // 2000ms+: 75-100
    if (duration < 500) {
      return (duration / 500) * 25;
    } else if (duration < 2000) {
      return 25 + ((duration - 500) / 1500) * 50;
    }
    return 75 + Math.min(((duration - 2000) / 3000) * 25, 25);
  }

  public getMetrics(): EngagementMetrics {
    return this.metrics;
  }

  cleanup() {
    // Remove selection listeners
    document.removeEventListener('selectionchange', this.handleSelectionChange);
    document.removeEventListener('mouseup', this.handleSelectionEnd);
    document.removeEventListener('keyup', this.handleSelectionEnd);

    // Flush any remaining batched events
    if (this.eventBatches.hovers.length > 0) {
      this.analytics.track('contentHovers', {
        hovers: this.eventBatches.hovers,
        count: this.eventBatches.hovers.length,
      });
    }

    if (this.eventBatches.scrolls.length > 0) {
      this.analytics.track('scrollPatterns', {
        patterns: this.eventBatches.scrolls,
        count: this.eventBatches.scrolls.length,
        summary: this.summarizeScrollPatterns(this.eventBatches.scrolls),
      });
    }

    // Clear timeouts
    if (this.eventBatches.hoverTimeout)
      clearTimeout(this.eventBatches.hoverTimeout);
    if (this.eventBatches.scrollTimeout)
      clearTimeout(this.eventBatches.scrollTimeout);

    // Existing cleanup code...
    window.removeEventListener('mouseover', this.handleMouseOver);
    window.removeEventListener('mouseout', this.handleMouseOut);
    window.removeEventListener('click', this.handleClick);
    window.removeEventListener('scroll', this.handleScroll);

    this.analytics.track('userEngagement', this.getMetrics());
  }

  private summarizeScrollPatterns(patterns: any[]) {
    return {
      dominantPattern: this.findDominantPattern(patterns),
      averageVelocity: this.calculateAverageVelocity(patterns),
      totalDistance: patterns.reduce((sum, p) => sum + p.metrics.distance, 0),
      readingTimePercentage:
        (patterns.filter((p) => p.context.readingTime).length /
          patterns.length) *
        100,
      skimmingPercentage:
        (patterns.filter((p) => p.context.isSkimming).length /
          patterns.length) *
        100,
    };
  }

  private findDominantPattern(patterns: any[]): {
    type: ScrollPattern['type'];
    frequency: number;
    duration: number;
  } {
    const patternCounts = patterns.reduce((acc, pattern) => {
      acc[pattern.type] = (acc[pattern.type] || 0) + 1;
      return acc;
    }, {} as Record<ScrollPattern['type'], number>);

    const dominantType = Object.entries(patternCounts).reduce((a, b) =>
      patternCounts[a[0]] > patternCounts[b[0]] ? a : b
    )[0] as ScrollPattern['type'];

    const dominantPatterns = patterns.filter((p) => p.type === dominantType);
    const totalDuration = dominantPatterns.reduce(
      (sum, p) => sum + p.metrics.duration,
      0
    );

    return {
      type: dominantType,
      frequency: (patternCounts[dominantType] / patterns.length) * 100,
      duration: totalDuration,
    };
  }

  private calculateAverageVelocity(
    patterns: Array<{
      type: ScrollPattern['type'];
      metrics: { velocity: number };
    }>
  ): {
    average: number;
    peak: number;
    breakdown: Record<ScrollPattern['type'], number>;
  } {
    if (patterns.length === 0) {
      return {
        average: 0,
        peak: 0,
        breakdown: {
          smooth: 0,
          rapid: 0,
          erratic: 0,
          jump: 0,
        },
      };
    }

    let peak = 0;
    const velocities: number[] = [];
    const typeVelocities: Record<ScrollPattern['type'], number[]> = {
      smooth: [],
      rapid: [],
      erratic: [],
      jump: [],
    };

    patterns.forEach((pattern) => {
      const velocity = pattern.metrics.velocity;
      velocities.push(velocity);
      peak = Math.max(peak, velocity);

      if (pattern.type in typeVelocities) {
        typeVelocities[pattern.type].push(velocity);
      }
    });

    const breakdown = Object.keys(typeVelocities).reduce((acc, type) => {
      const vals = typeVelocities[type as ScrollPattern['type']];
      acc[type as ScrollPattern['type']] =
        vals.length > 0 ? vals.reduce((sum, v) => sum + v, 0) / vals.length : 0;
      return acc;
    }, {} as Record<ScrollPattern['type'], number>);

    return {
      average: velocities.reduce((sum, v) => sum + v, 0) / velocities.length,
      peak,
      breakdown,
    };
  }

  private getScrollDepthMilestones(patterns: any[]): {
    milestones: number[];
    timeToReach: Record<number, number>;
  } {
    const depths = new Set<number>();
    const timeToReach: Record<number, number> = {};
    const startTime = new Date(patterns[0].timestamp).getTime();

    patterns.forEach((pattern) => {
      const depth = Math.floor(pattern.metrics.percentScrolled / 25) * 25;
      if (depth > 0 && !depths.has(depth)) {
        depths.add(depth);
        timeToReach[depth] = new Date(pattern.timestamp).getTime() - startTime;
      }
    });

    return {
      milestones: Array.from(depths).sort((a, b) => a - b),
      timeToReach,
    };
  }

  private getReadingPatternInsights(patterns: any[]): {
    readingStyle: 'thorough' | 'skimming' | 'scanning' | 'mixed';
    confidence: number;
    metrics: {
      averageReadingTime: number;
      contentCoverage: number;
      consistencyScore: number;
    };
  } {
    const readingPatterns = patterns.filter((p) => p.context.readingTime);
    const skimmingPatterns = patterns.filter((p) => p.context.isSkimming);
    const jumpPatterns = patterns.filter((p) => p.context.isJumpy);

    const totalPatterns = patterns.length;
    const readingRatio = readingPatterns.length / totalPatterns;
    const skimmingRatio = skimmingPatterns.length / totalPatterns;
    const jumpRatio = jumpPatterns.length / totalPatterns;

    let readingStyle: 'thorough' | 'skimming' | 'scanning' | 'mixed';
    let confidence: number;

    if (readingRatio > 0.6) {
      readingStyle = 'thorough';
      confidence = readingRatio * 100;
    } else if (skimmingRatio > 0.6) {
      readingStyle = 'skimming';
      confidence = skimmingRatio * 100;
    } else if (jumpRatio > 0.6) {
      readingStyle = 'scanning';
      confidence = jumpRatio * 100;
    } else {
      readingStyle = 'mixed';
      confidence = Math.max(readingRatio, skimmingRatio, jumpRatio) * 100;
    }

    const averageReadingTime =
      readingPatterns.reduce((sum, p) => sum + p.metrics.duration, 0) /
      (readingPatterns.length || 1);

    const contentCoverage = Math.max(
      ...patterns.map((p) => p.metrics.percentScrolled)
    );

    const velocityStdDev = this.calculateVelocityStandardDeviation(patterns);
    const consistencyScore = Math.max(0, 100 - velocityStdDev / 10);

    return {
      readingStyle,
      confidence,
      metrics: {
        averageReadingTime,
        contentCoverage,
        consistencyScore,
      },
    };
  }

  private calculateVelocityStandardDeviation(patterns: any[]): number {
    const velocities = patterns.map((p) => p.metrics.velocity);
    const mean = velocities.reduce((sum, v) => sum + v, 0) / velocities.length;
    const squaredDiffs = velocities.map((v) => Math.pow(v - mean, 2));
    const variance =
      squaredDiffs.reduce((sum, sq) => sum + sq, 0) / velocities.length;
    return Math.sqrt(variance);
  }

  private handleSelectionChange() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      this.currentSelection = null;
      return;
    }

    const text = selection.toString().trim();
    if (!text) return;

    const range = selection.getRangeAt(0);
    const element = range.commonAncestorContainer.parentElement;

    if (!element) return;

    // Log for debugging
    this.log('Selection started:', { text: text.slice(0, 50) + '...' });

    // Only track new selections
    if (!this.currentSelection || this.currentSelection.text !== text) {
      this.currentSelection = {
        startTime: Date.now(),
        text,
        element,
      };
    }
  }

  private handleSelectionEnd() {
    if (!this.currentSelection) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const text = selection.toString().trim();
    if (!text) return;

    const duration = Date.now() - this.currentSelection.startTime;
    // Only track selections that last more than 200ms to filter out accidental selections
    if (duration < 200) return;

    const element = this.currentSelection.element;
    const selectionData = {
      timestamp: new Date().toISOString(),
      text: text.length > 200 ? `${text.slice(0, 200)}...` : text,
      elementType: element.tagName.toLowerCase(),
      elementPath: this.getElementPath(element),
      selectionLength: text.length,
      duration,
      context: this.getSelectionContext(element),
    };

    // Add to metrics
    this.metrics.interactions.textSelections.push(selectionData);

    // Track the event
    this.analytics.track('textSelection', {
      ...selectionData,
      metadata: {
        pageUrl: window.location.href,
        pageTitle: document.title,
      },
    });

    this.log('Text selection tracked:', selectionData);
    this.currentSelection = null;
  }

  private getElementPath(element: HTMLElement): string {
    const path: string[] = [];
    let current = element;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        selector += `#${current.id}`;
      } else if (current.className) {
        selector += `.${current.className.split(' ').join('.')}`;
      }
      path.unshift(selector);
      current = current.parentElement as HTMLElement;
    }

    return path.join(' > ');
  }

  private getSelectionContext(element: HTMLElement): {
    paragraph?: string;
    nearestHeading?: string;
  } {
    const context: { paragraph?: string; nearestHeading?: string } = {};

    // Get surrounding paragraph context
    const paragraph = element.closest('p');
    if (paragraph) {
      const text = paragraph.textContent?.trim();
      if (text) {
        context.paragraph =
          text.length > 100 ? `${text.slice(0, 100)}...` : text;
      }
    }

    // Find nearest heading
    let current = element;
    while (current && current !== document.body) {
      if (/^H[1-6]$/.test(current.tagName)) {
        context.nearestHeading = current.textContent?.trim();
        break;
      }
      current = current.parentElement as HTMLElement;
    }

    return context;
  }
}
