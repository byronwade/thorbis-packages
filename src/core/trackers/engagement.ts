import { BaseTracker } from './base';

interface EnhancedEngagementData {
  session: {
    id: string;
    startTime: string;
    duration: number;
    isActive: boolean;
    interactionCount: number;
    lastInteraction: string;
  };
  clicks: Array<{
    elementId?: string;
    elementType: string;
    elementText?: string;
    elementClasses?: string[];
    elementAttributes?: Record<string, string>;
    position: {
      x: number;
      y: number;
      relativeX: number; // Percentage from left
      relativeY: number; // Percentage from top
    };
    context: {
      section?: string;
      parentId?: string;
      nearestHeading?: string;
      viewport: {
        width: number;
        height: number;
      };
    };
    metadata: {
      timestamp: string;
      timeFromPageLoad: number;
      timeFromLastClick: number;
    };
  }>;
  scroll: {
    metrics: {
      maxDepth: number;
      averageSpeed: number;
      totalDistance: number;
      readingTime: number;
      dwellTime: Record<string, number>; // Time spent at different depths
    };
    patterns: {
      upScrolls: number;
      downScrolls: number;
      fastScrolls: number;
      slowScrolls: number;
      scrollPauses: Array<{
        depth: number;
        duration: number;
        timestamp: string;
      }>;
    };
    milestones: Array<{
      depth: number;
      time: string;
      timeFromStart: number;
      viewport: {
        top: number;
        bottom: number;
      };
    }>;
  };
  hover: Array<{
    elementId?: string;
    elementType: string;
    elementPath: string[];
    duration: number;
    intentScore: number; // Calculated based on movement pattern
    interactions: {
      clicks: number;
      scrolls: number;
      keyPresses: number;
    };
    position: {
      entryPoint: { x: number; y: number };
      exitPoint: { x: number; y: number };
      path: Array<{ x: number; y: number; t: number }>;
    };
    metadata: {
      timestamp: string;
      entryTime: string;
      exitTime: string;
    };
  }>;
  attention: {
    metrics: {
      totalActiveTime: number;
      totalIdleTime: number;
      attentionScore: number;
      focusChanges: number;
    };
    segments: Array<{
      type: 'active' | 'idle' | 'hidden';
      startTime: string;
      duration: number;
      endReason: string;
    }>;
    interactions: {
      keyboard: {
        keyPressCount: number;
        typingSpeed: number;
        commonKeys: Record<string, number>;
      };
      mouse: {
        moveDistance: number;
        moveSpeed: number;
        clickAccuracy: number;
      };
      touch: {
        tapCount: number;
        swipeDistance: number;
        pinchZooms: number;
      };
    };
  };
  content: {
    visibility: Array<{
      elementId: string;
      type: string;
      viewportTime: number;
      inViewPercentage: number;
      engagementScore: number;
      interactions: number;
    }>;
    sections: Record<
      string,
      {
        timeSpent: number;
        interactions: number;
        scrollDepth: number;
        engagementScore: number;
      }
    >;
    elements: Record<
      string,
      {
        views: number;
        clicks: number;
        hovers: number;
        timeVisible: number;
      }
    >;
  };
}

export class EngagementTracker extends BaseTracker {
  private data: EnhancedEngagementData;
  private lastClickTime: number = 0;
  private lastScrollPosition: number = 0;
  private lastScrollTime: number = 0;
  private lastKeyPressTime: number = 0;
  private keyPressIntervals: number[] = [];
  private scrollTimeout: NodeJS.Timeout | null = null;
  private currentElement: HTMLElement | null = null;
  private currentHover: {
    element: HTMLElement;
    startTime: number;
    position: {
      path: Array<{ x: number; y: number; t: number }>;
    };
    metadata: {
      entryTime: string;
    };
  } | null = null;
  private visibilityTimers: Map<string, number> = new Map();
  private readonly SCROLL_PAUSE_THRESHOLD = 1500; // ms
  private readonly FAST_SCROLL_THRESHOLD = 100; // pixels per second
  private touchStartPosition: { x: number; y: number; time: number } | null =
    null;

  constructor(analytics: any, debug: boolean = false) {
    super(analytics, debug);
    this.data = this.initializeEngagementData();

    // Bind methods
    this.handleClick = this.handleClick.bind(this);
    this.handleScroll = this.handleScroll.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.handleKeyboard = this.handleKeyboard.bind(this);
    this.handleTouch = this.handleTouch.bind(this);
  }

  init() {
    if (typeof window === 'undefined') return;

    // Initialize event listeners
    window.addEventListener('click', this.handleClick);
    window.addEventListener('scroll', this.handleScroll);
    window.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('keydown', this.handleKeyboard);
    window.addEventListener('touchstart', this.handleTouch);
    window.addEventListener('touchmove', this.handleTouch);
    window.addEventListener('touchend', this.handleTouch);

    // Initialize content observers
    this.initializeContentObservers();

    this.log('Engagement tracker initialized');
  }

  private initializeEngagementData(): EnhancedEngagementData {
    return {
      session: {
        id: `session_${Math.random().toString(36).slice(2)}`,
        startTime: new Date().toISOString(),
        duration: 0,
        isActive: true,
        interactionCount: 0,
        lastInteraction: new Date().toISOString(),
      },
      clicks: [],
      scroll: {
        metrics: {
          maxDepth: 0,
          averageSpeed: 0,
          totalDistance: 0,
          readingTime: 0,
          dwellTime: {},
        },
        patterns: {
          upScrolls: 0,
          downScrolls: 0,
          fastScrolls: 0,
          slowScrolls: 0,
          scrollPauses: [],
        },
        milestones: [],
      },
      hover: [],
      attention: {
        metrics: {
          totalActiveTime: 0,
          totalIdleTime: 0,
          attentionScore: 0,
          focusChanges: 0,
        },
        segments: [
          {
            type: 'active',
            startTime: new Date().toISOString(),
            duration: 0,
            endReason: 'init',
          },
        ],
        interactions: {
          keyboard: {
            keyPressCount: 0,
            typingSpeed: 0,
            commonKeys: {},
          },
          mouse: {
            moveDistance: 0,
            moveSpeed: 0,
            clickAccuracy: 0,
          },
          touch: {
            tapCount: 0,
            swipeDistance: 0,
            pinchZooms: 0,
          },
        },
      },
      content: {
        visibility: [],
        sections: {},
        elements: {},
      },
    };
  }

  private handleClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const now = Date.now();
    const timeFromLastClick = this.lastClickTime ? now - this.lastClickTime : 0;

    // Get element path
    const elementPath = this.getElementPath(target);

    // Calculate relative position
    const { width, height } = document.documentElement.getBoundingClientRect();
    const relativeX = (event.pageX / width) * 100;
    const relativeY = (event.pageY / height) * 100;

    const clickData = {
      elementId: target.id,
      elementType: target.tagName,
      elementText: target.textContent?.slice(0, 100),
      elementClasses: Array.from(target.classList),
      elementAttributes: this.getElementAttributes(target),
      position: {
        x: event.pageX,
        y: event.pageY,
        relativeX,
        relativeY,
      },
      context: {
        section: this.getNearestSection(target),
        parentId: target.parentElement?.id,
        nearestHeading: this.getNearestHeading(target),
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
      },
      metadata: {
        timestamp: new Date().toISOString(),
        timeFromPageLoad: now - new Date(this.data.session.startTime).getTime(),
        timeFromLastClick,
      },
    };

    this.data.clicks.push(clickData);
    this.updateElementEngagement(target.id || target.tagName, 'click');
    this.trackInteraction('click', clickData);
    this.lastClickTime = now;
  }

  private handleScroll() {
    const now = Date.now();
    const currentPosition = window.scrollY;
    const timeDiff = now - this.lastScrollTime;

    if (timeDiff > 0) {
      const scrollSpeed =
        Math.abs(currentPosition - this.lastScrollPosition) / timeDiff;
      const isFastScroll = scrollSpeed > this.FAST_SCROLL_THRESHOLD;

      // Update scroll patterns
      if (currentPosition > this.lastScrollPosition) {
        this.data.scroll.patterns.downScrolls++;
      } else {
        this.data.scroll.patterns.upScrolls++;
      }

      if (isFastScroll) {
        this.data.scroll.patterns.fastScrolls++;
      } else {
        this.data.scroll.patterns.slowScrolls++;
      }

      // Update scroll metrics
      this.data.scroll.metrics.totalDistance += Math.abs(
        currentPosition - this.lastScrollPosition
      );
      this.data.scroll.metrics.averageSpeed =
        (this.data.scroll.metrics.averageSpeed *
          (this.data.scroll.patterns.downScrolls +
            this.data.scroll.patterns.upScrolls -
            1) +
          scrollSpeed) /
        (this.data.scroll.patterns.downScrolls +
          this.data.scroll.patterns.upScrolls);

      // Track scroll milestones
      const scrollPercentage = this.calculateScrollPercentage();
      if (scrollPercentage > this.data.scroll.metrics.maxDepth) {
        this.data.scroll.metrics.maxDepth = scrollPercentage;
        this.data.scroll.milestones.push({
          depth: scrollPercentage,
          time: new Date().toISOString(),
          timeFromStart: now - new Date(this.data.session.startTime).getTime(),
          viewport: {
            top: window.scrollY,
            bottom: window.scrollY + window.innerHeight,
          },
        });
      }

      // Track scroll pauses
      if (this.scrollTimeout) {
        clearTimeout(this.scrollTimeout);
      }

      this.scrollTimeout = setTimeout(() => {
        this.data.scroll.patterns.scrollPauses.push({
          depth: scrollPercentage,
          duration: this.SCROLL_PAUSE_THRESHOLD,
          timestamp: new Date().toISOString(),
        });
        this.trackInteraction('scrollPause', {
          depth: scrollPercentage,
          duration: this.SCROLL_PAUSE_THRESHOLD,
        });
      }, this.SCROLL_PAUSE_THRESHOLD);

      // Update dwell time
      const depthKey = Math.floor(scrollPercentage / 10) * 10;
      this.data.scroll.metrics.dwellTime[depthKey] =
        (this.data.scroll.metrics.dwellTime[depthKey] || 0) + timeDiff;

      this.trackInteraction('scroll', {
        depth: scrollPercentage,
        speed: scrollSpeed,
        direction: currentPosition > this.lastScrollPosition ? 'down' : 'up',
      });
    }

    this.lastScrollPosition = currentPosition;
    this.lastScrollTime = now;
  }

  private handleMouseMove(event: MouseEvent) {
    // Update mouse metrics
    const { movementX, movementY } = event;
    const distance = Math.sqrt(movementX ** 2 + movementY ** 2);
    this.data.attention.interactions.mouse.moveDistance += distance;

    const timeDiff = Date.now() - this.lastScrollTime;
    if (timeDiff > 0) {
      this.data.attention.interactions.mouse.moveSpeed = distance / timeDiff;
    }

    // Track hover behavior
    const target = event.target as HTMLElement;
    if (target !== this.currentElement) {
      if (this.currentElement) {
        this.endHover(event);
      }
      this.startHover(event);
    } else if (this.currentHover) {
      this.currentHover.position.path.push({
        x: event.pageX,
        y: event.pageY,
        t:
          Date.now() - new Date(this.currentHover.metadata.entryTime).getTime(),
      });
    }
  }

  private handleVisibilityChange() {
    const isHidden = document.hidden;
    const now = new Date().toISOString();
    const lastSegment =
      this.data.attention.segments[this.data.attention.segments.length - 1];

    // End current segment
    lastSegment.duration =
      new Date(now).getTime() - new Date(lastSegment.startTime).getTime();
    lastSegment.endReason = isHidden ? 'tab_hidden' : 'tab_visible';

    // Start new segment
    this.data.attention.segments.push({
      type: isHidden ? 'hidden' : 'active',
      startTime: now,
      duration: 0,
      endReason: 'ongoing',
    });

    // Update metrics
    this.data.attention.metrics.focusChanges++;
    this.updateAttentionMetrics();

    this.trackInteraction('visibility', {
      isHidden,
      timestamp: now,
    });
  }

  private handleKeyboard(event: KeyboardEvent) {
    this.data.attention.interactions.keyboard.keyPressCount++;
    this.data.attention.interactions.keyboard.commonKeys[event.key] =
      (this.data.attention.interactions.keyboard.commonKeys[event.key] || 0) +
      1;

    // Calculate typing speed
    const now = Date.now();
    const timeDiff = now - this.lastKeyPressTime;
    if (this.lastKeyPressTime && timeDiff < 2000) {
      // Only count if within 2 seconds of last press
      this.keyPressIntervals.push(timeDiff);
      this.data.attention.interactions.keyboard.typingSpeed =
        60000 /
        (this.keyPressIntervals.reduce((a, b) => a + b, 0) /
          this.keyPressIntervals.length);
    }
    this.lastKeyPressTime = now;

    this.trackInteraction('keyboard', {
      key: event.key,
      timestamp: new Date().toISOString(),
    });
  }

  private handleTouch(event: TouchEvent) {
    switch (event.type) {
      case 'touchstart':
        this.handleTouchStart(event);
        break;
      case 'touchmove':
        this.handleTouchMove(event);
        break;
      case 'touchend':
        this.handleTouchEnd(event);
        break;
    }
  }

  private initializeContentObservers() {
    // Create intersection observer for content visibility
    const visibilityObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const element = entry.target;
          const elementId = element.id || element.tagName;

          if (!this.data.content.elements[elementId]) {
            this.data.content.elements[elementId] = {
              views: 0,
              clicks: 0,
              hovers: 0,
              timeVisible: 0,
            };
          }

          if (entry.isIntersecting) {
            this.data.content.elements[elementId].views++;
            this.startVisibilityTimer(elementId, entry.intersectionRatio);
          } else {
            this.stopVisibilityTimer(elementId);
          }
        });
      },
      {
        threshold: [0, 0.25, 0.5, 0.75, 1],
      }
    );

    // Observe important elements
    document
      .querySelectorAll('h1, h2, h3, p, img, video, button, a')
      .forEach((element) => visibilityObserver.observe(element));
  }

  // Helper methods
  private getElementPath(element: HTMLElement): string[] {
    const path: string[] = [];
    let current = element;

    while (current && current !== document.body) {
      let identifier = current.id
        ? `#${current.id}`
        : current.tagName.toLowerCase();
      if (!current.id && current.className) {
        identifier += `.${current.className.split(' ').join('.')}`;
      }
      path.unshift(identifier);
      current = current.parentElement as HTMLElement;
    }

    return path;
  }

  private calculateScrollPercentage(): number {
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    const scrollTop = window.scrollY;
    return Math.round(((scrollTop + windowHeight) / documentHeight) * 100);
  }

  private updateAttentionMetrics() {
    const now = new Date().getTime();
    let activeTime = 0;
    let idleTime = 0;

    this.data.attention.segments.forEach((segment) => {
      const duration =
        segment.type === 'active'
          ? segment.duration || now - new Date(segment.startTime).getTime()
          : segment.duration;

      if (segment.type === 'active') {
        activeTime += duration;
      } else if (segment.type === 'idle') {
        idleTime += duration;
      }
    });

    this.data.attention.metrics.totalActiveTime = activeTime;
    this.data.attention.metrics.totalIdleTime = idleTime;
    this.data.attention.metrics.attentionScore =
      (activeTime / (activeTime + idleTime)) * 100;
  }

  private trackInteraction(type: string, data: any) {
    this.data.session.interactionCount++;
    this.data.session.lastInteraction = new Date().toISOString();
    this.data.session.duration =
      new Date().getTime() - new Date(this.data.session.startTime).getTime();

    this.analytics.track('engagement', {
      type,
      data,
      session: this.data.session,
      timestamp: new Date().toISOString(),
    });
  }

  private getElementAttributes(element: HTMLElement): Record<string, string> {
    const attributes: Record<string, string> = {};
    Array.from(element.attributes).forEach((attr) => {
      attributes[attr.name] = attr.value;
    });
    return attributes;
  }

  private getNearestSection(element: HTMLElement): string | undefined {
    let current = element;
    while (current && current !== document.body) {
      if (
        current.tagName === 'SECTION' ||
        current.hasAttribute('data-section')
      ) {
        return current.id || current.getAttribute('data-section') || undefined;
      }
      current = current.parentElement as HTMLElement;
    }
    return undefined;
  }

  private getNearestHeading(element: HTMLElement): string | undefined {
    let current = element;
    const headings = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'];
    while (current && current !== document.body) {
      if (headings.includes(current.tagName)) {
        return current.textContent?.trim() || undefined;
      }
      current = current.parentElement as HTMLElement;
    }
    return undefined;
  }

  private updateElementEngagement(elementId: string, type: string) {
    if (!this.data.content.elements[elementId]) {
      this.data.content.elements[elementId] = {
        views: 0,
        clicks: 0,
        hovers: 0,
        timeVisible: 0,
      };
    }
    (this.data.content.elements[elementId] as any)[type]++;
  }

  private startHover(event: MouseEvent) {
    const target = event.target as HTMLElement;
    this.currentElement = target;
    this.currentHover = {
      element: target,
      startTime: Date.now(),
      position: {
        path: [
          {
            x: event.pageX,
            y: event.pageY,
            t: 0,
          },
        ],
      },
      metadata: {
        entryTime: new Date().toISOString(),
      },
    };
  }

  private endHover(event: MouseEvent) {
    if (this.currentHover && this.currentElement) {
      const duration = Date.now() - this.currentHover.startTime;
      const hoverData = {
        elementId: this.currentElement.id,
        elementType: this.currentElement.tagName,
        elementPath: this.getElementPath(this.currentElement),
        duration,
        intentScore: this.calculateIntentScore(this.currentHover.position.path),
        interactions: {
          clicks: 0,
          scrolls: 0,
          keyPresses: 0,
        },
        position: {
          entryPoint: this.currentHover.position.path[0],
          exitPoint: {
            x: event.pageX,
            y: event.pageY,
            t: duration,
          },
          path: this.currentHover.position.path,
        },
        metadata: {
          timestamp: new Date().toISOString(),
          entryTime: this.currentHover.metadata.entryTime,
          exitTime: new Date().toISOString(),
        },
      };

      this.data.hover.push(hoverData);
      this.trackInteraction('hover', hoverData);
    }
    this.currentElement = null;
    this.currentHover = null;
  }

  private calculateIntentScore(
    path: Array<{ x: number; y: number; t: number }>
  ): number {
    if (path.length < 2) return 0;

    // Calculate based on movement pattern, speed, and directness
    const totalDistance = path.reduce((acc, point, i) => {
      if (i === 0) return 0;
      const prev = path[i - 1];
      return (
        acc +
        Math.sqrt(Math.pow(point.x - prev.x, 2) + Math.pow(point.y - prev.y, 2))
      );
    }, 0);

    const directDistance = Math.sqrt(
      Math.pow(path[path.length - 1].x - path[0].x, 2) +
        Math.pow(path[path.length - 1].y - path[0].y, 2)
    );

    const timeSpent = path[path.length - 1].t - path[0].t;
    const speed = totalDistance / timeSpent;
    const directness = directDistance / totalDistance;

    return Math.min(100, directness * 50 + speed * 50);
  }

  private startVisibilityTimer(elementId: string, ratio: number) {
    this.visibilityTimers.set(elementId, Date.now());
  }

  private stopVisibilityTimer(elementId: string) {
    const startTime = this.visibilityTimers.get(elementId);
    if (startTime) {
      const timeVisible = Date.now() - startTime;
      if (this.data.content.elements[elementId]) {
        this.data.content.elements[elementId].timeVisible += timeVisible;
      }
      this.visibilityTimers.delete(elementId);
    }
  }

  private handleTouchStart(event: TouchEvent) {
    const touch = event.touches[0];
    this.data.attention.interactions.touch.tapCount++;

    // Track initial touch position for swipe calculation
    this.touchStartPosition = {
      x: touch.pageX,
      y: touch.pageY,
      time: Date.now(),
    };
  }

  private handleTouchMove(event: TouchEvent) {
    if (!this.touchStartPosition) return;

    const touch = event.touches[0];
    const deltaX = touch.pageX - this.touchStartPosition.x;
    const deltaY = touch.pageY - this.touchStartPosition.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    this.data.attention.interactions.touch.swipeDistance += distance;
    this.touchStartPosition.x = touch.pageX;
    this.touchStartPosition.y = touch.pageY;
  }

  private handleTouchEnd(event: TouchEvent) {
    if (event.touches.length === 2) {
      // Detect pinch gesture end
      this.data.attention.interactions.touch.pinchZooms++;
    }
    this.touchStartPosition = null;
  }

  cleanup() {
    // Remove event listeners
    window.removeEventListener('click', this.handleClick);
    window.removeEventListener('scroll', this.handleScroll);
    window.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener(
      'visibilitychange',
      this.handleVisibilityChange
    );
    window.removeEventListener('keydown', this.handleKeyboard);
    window.removeEventListener('touchstart', this.handleTouch);
    window.removeEventListener('touchmove', this.handleTouch);
    window.removeEventListener('touchend', this.handleTouch);

    // Final tracking
    this.updateAttentionMetrics();
    this.analytics.track('engagementSummary', this.data);
  }
}
