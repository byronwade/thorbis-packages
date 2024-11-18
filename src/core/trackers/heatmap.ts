import { BaseTracker } from './base';

interface EnhancedHeatmapData {
  clicks: Array<{
    position: {
      x: number;
      y: number;
      relativeX: number; // Percentage from left
      relativeY: number; // Percentage from top
      viewportX: number;
      viewportY: number;
    };
    element: {
      id?: string;
      tag: string;
      classes: string[];
      text?: string;
      path: string[];
      size: {
        width: number;
        height: number;
      };
      zIndex: number;
    };
    context: {
      section?: string;
      nearestHeading?: string;
      viewport: {
        width: number;
        height: number;
        scrollTop: number;
      };
      deviceType: 'desktop' | 'tablet' | 'mobile';
    };
    interaction: {
      type: 'click' | 'tap' | 'rightClick';
      pressure?: number; // For touch events
      duration?: number; // Time between mousedown and mouseup
      doubleClick: boolean;
      multiTouch: boolean;
    };
    metadata: {
      timestamp: string;
      timeFromPageLoad: number;
      sessionId: string;
    };
  }>;
  movement: {
    paths: Array<{
      points: Array<{
        x: number;
        y: number;
        timestamp: number;
        speed: number;
        type: 'move' | 'pause' | 'hover';
      }>;
      duration: number;
      distance: number;
      averageSpeed: number;
      pausePoints: Array<{
        x: number;
        y: number;
        duration: number;
        element?: string;
      }>;
    }>;
    metrics: {
      totalDistance: number;
      averageSpeed: number;
      pauseAreas: Array<{
        x: number;
        y: number;
        radius: number;
        duration: number;
        frequency: number;
      }>;
      coverage: {
        total: number;
        aboveTheFold: number;
        belowTheFold: number;
      };
    };
  };
  scroll: {
    patterns: Array<{
      startTime: number;
      endTime: number;
      startDepth: number;
      endDepth: number;
      speed: number;
      direction: 'up' | 'down';
      distance: number;
      dwellTime: number;
    }>;
    depths: {
      distribution: Record<number, number>; // Percentage -> time spent
      maxReached: number;
      averageDwell: number;
      readingPattern: 'smooth' | 'skimming' | 'jumping';
    };
    segments: Array<{
      depth: number;
      timeSpent: number;
      interactions: number;
      visibility: number;
      content: {
        type: string;
        id?: string;
        engagement: number;
      };
    }>;
  };
  attention: {
    zones: Array<{
      area: {
        top: number;
        left: number;
        width: number;
        height: number;
      };
      score: number;
      interactions: number;
      timeVisible: number;
      elements: string[];
    }>;
    hotspots: Array<{
      center: { x: number; y: number };
      radius: number;
      intensity: number;
      elements: string[];
      interactions: Record<string, number>;
    }>;
    coldspots: Array<{
      area: {
        top: number;
        left: number;
        width: number;
        height: number;
      };
      timeVisible: number;
      potentialIssues: string[];
    }>;
  };
  rage: {
    events: Array<{
      timestamp: string;
      type: 'multiclick' | 'rapidScroll' | 'erraticMovement';
      intensity: number;
      context: {
        element?: string;
        action: string;
        frequency: number;
      };
    }>;
    metrics: {
      clickRage: number;
      scrollRage: number;
      overallFrustration: number;
    };
  };
}

export class HeatmapTracker extends BaseTracker {
  private data: EnhancedHeatmapData;
  private currentPath: Array<{
    x: number;
    y: number;
    timestamp: number;
    speed: number;
    type: 'move' | 'pause' | 'hover';
  }> = [];
  private lastMousePosition: {
    x: number;
    y: number;
    timestamp: number;
  } | null = null;
  private lastClick: { x: number; y: number; timestamp: number } | null = null;
  private scrollTimeout: NodeJS.Timeout | null = null;
  private readonly MOVEMENT_SAMPLE_RATE = 50; // ms
  private readonly PAUSE_THRESHOLD = 500; // ms
  private readonly RAGE_CLICK_THRESHOLD = 3; // clicks
  private readonly RAGE_CLICK_INTERVAL = 1000; // ms

  constructor(analytics: any, debug: boolean = false) {
    super(analytics, debug);
    this.data = this.initializeHeatmapData();

    // Bind methods
    this.handleClick = this.handleClick.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleScroll = this.handleScroll.bind(this);
    this.handleTouch = this.handleTouch.bind(this);
  }

  init() {
    if (typeof window === 'undefined') return;

    // Mouse/Touch events
    window.addEventListener('click', this.handleClick);
    window.addEventListener('contextmenu', this.handleClick);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('touchstart', this.handleTouch);
    window.addEventListener('touchmove', this.handleTouch);
    window.addEventListener('touchend', this.handleTouch);

    // Scroll events
    window.addEventListener('scroll', this.handleScroll);

    // Initialize attention tracking
    this.initializeAttentionTracking();

    this.log('Heatmap tracker initialized');
  }

  private initializeHeatmapData(): EnhancedHeatmapData {
    return {
      clicks: [],
      movement: {
        paths: [],
        metrics: {
          totalDistance: 0,
          averageSpeed: 0,
          pauseAreas: [],
          coverage: {
            total: 0,
            aboveTheFold: 0,
            belowTheFold: 0,
          },
        },
      },
      scroll: {
        patterns: [],
        depths: {
          distribution: {},
          maxReached: 0,
          averageDwell: 0,
          readingPattern: 'smooth',
        },
        segments: [],
      },
      attention: {
        zones: [],
        hotspots: [],
        coldspots: [],
      },
      rage: {
        events: [],
        metrics: {
          clickRage: 0,
          scrollRage: 0,
          overallFrustration: 0,
        },
      },
    };
  }

  private handleClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const now = Date.now();
    const position = {
      x: event.pageX,
      y: event.pageY,
      relativeX: (event.clientX / window.innerWidth) * 100,
      relativeY: (event.clientY / window.innerHeight) * 100,
      viewportX: event.clientX,
      viewportY: event.clientY,
    };

    // Check for rage clicks
    if (
      this.lastClick &&
      now - this.lastClick.timestamp < this.RAGE_CLICK_INTERVAL &&
      Math.abs(this.lastClick.x - position.x) < 10 &&
      Math.abs(this.lastClick.y - position.y) < 10
    ) {
      this.trackRageClick(position);
    }

    const clickData = {
      position,
      element: {
        id: target.id,
        tag: target.tagName.toLowerCase(),
        classes: Array.from(target.classList),
        text: target.textContent?.trim().slice(0, 100),
        path: this.getElementPath(target),
        size: {
          width: target.offsetWidth,
          height: target.offsetHeight,
        },
        zIndex: parseInt(window.getComputedStyle(target).zIndex) || 0,
      },
      context: {
        section: this.getNearestSection(target),
        nearestHeading: this.getNearestHeading(target),
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          scrollTop: window.scrollY,
        },
        deviceType: this.getDeviceType(),
      },
      interaction: {
        type:
          event.type === 'contextmenu'
            ? ('rightClick' as const)
            : ('click' as const),
        duration: this.lastClick ? now - this.lastClick.timestamp : 0,
        doubleClick: this.lastClick
          ? now - this.lastClick.timestamp < 300
          : false,
        multiTouch: false,
      },
      metadata: {
        timestamp: new Date().toISOString(),
        timeFromPageLoad: performance.now(),
        sessionId: this.getSessionId(),
      },
    };

    this.data.clicks.push(clickData);
    this.updateHotspots(position);
    this.trackInteraction('click', clickData);

    this.lastClick = { x: position.x, y: position.y, timestamp: now };
  }

  private handleMouseMove(event: MouseEvent) {
    const now = Date.now();
    if (
      this.lastMousePosition &&
      now - this.lastMousePosition.timestamp < this.MOVEMENT_SAMPLE_RATE
    ) {
      return;
    }

    const position = {
      x: event.pageX,
      y: event.pageY,
      timestamp: now,
    };

    this.currentPath.push({
      x: event.pageX,
      y: event.pageY,
      timestamp: now,
      speed: this.lastMousePosition
        ? this.calculateSpeed(this.lastMousePosition, {
            x: event.pageX,
            y: event.pageY,
            timestamp: now,
          })
        : 0,
      type: 'move',
    });

    if (this.lastMousePosition) {
      const speed = this.calculateSpeed(this.lastMousePosition, position);
      const type = speed < 0.1 ? 'pause' : 'move';

      if (type === 'pause') {
        this.handlePause(position);
      }

      this.updateMovementMetrics(position, speed);
    }

    this.lastMousePosition = position;
  }

  private handleScroll() {
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
    }

    const scrollData = {
      startTime: Date.now(),
      startDepth:
        (window.scrollY /
          (document.documentElement.scrollHeight - window.innerHeight)) *
        100,
    };

    this.scrollTimeout = setTimeout(() => {
      const endTime = Date.now();
      const endDepth =
        (window.scrollY /
          (document.documentElement.scrollHeight - window.innerHeight)) *
        100;

      const pattern = {
        startTime: scrollData.startTime,
        endTime,
        startDepth: scrollData.startDepth,
        endDepth,
        speed:
          Math.abs(endDepth - scrollData.startDepth) /
          (endTime - scrollData.startTime),
        direction:
          endDepth > scrollData.startDepth
            ? ('down' as const)
            : ('up' as const),
        distance: Math.abs(endDepth - scrollData.startDepth),
        dwellTime: endTime - scrollData.startTime,
      };

      this.data.scroll.patterns.push(pattern);
      this.updateScrollMetrics(pattern);
      this.detectReadingPattern();
      this.trackInteraction('scroll', pattern);
    }, 150);
  }

  private handleTouch(event: TouchEvent) {
    const touch = event.touches[0];
    if (!touch) return;

    const position = {
      x: touch.pageX,
      y: touch.pageY,
      relativeX: (touch.clientX / window.innerWidth) * 100,
      relativeY: (touch.clientY / window.innerHeight) * 100,
      viewportX: touch.clientX,
      viewportY: touch.clientY,
    };

    const touchData = {
      position,
      interaction: {
        type: 'tap',
        pressure: touch.force,
        multiTouch: event.touches.length > 1,
      },
      metadata: {
        timestamp: new Date().toISOString(),
        timeFromPageLoad: performance.now(),
        sessionId: this.getSessionId(),
      },
    };

    this.trackInteraction('touch', touchData);
  }

  private initializeAttentionTracking() {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const element = entry.target;
          const zone = this.findOrCreateAttentionZone(element);

          if (entry.isIntersecting) {
            zone.timeVisible += entry.time;
            zone.score = this.calculateAttentionScore(zone);
          }

          this.updateAttentionMetrics(zone);
        });
      },
      {
        threshold: [0, 0.25, 0.5, 0.75, 1],
      }
    );

    // Observe important elements
    document
      .querySelectorAll('h1, h2, h3, p, img, video, button, a')
      .forEach((element) => observer.observe(element));
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

  private getDeviceType(): 'desktop' | 'tablet' | 'mobile' {
    const width = window.innerWidth;
    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  }

  private calculateSpeed(
    start: { x: number; y: number; timestamp: number },
    end: { x: number; y: number; timestamp: number }
  ): number {
    const distance = Math.sqrt(
      Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)
    );
    const time = end.timestamp - start.timestamp;
    return distance / time;
  }

  private handlePause(position: { x: number; y: number; timestamp: number }) {
    const pauseArea = {
      x: Math.round(position.x / 50) * 50,
      y: Math.round(position.y / 50) * 50,
      radius: 25,
      duration: 0,
      frequency: 1,
    };

    const existingArea = this.data.movement.metrics.pauseAreas.find(
      (area) =>
        Math.abs(area.x - pauseArea.x) < area.radius &&
        Math.abs(area.y - pauseArea.y) < area.radius
    );

    if (existingArea) {
      existingArea.duration += this.PAUSE_THRESHOLD;
      existingArea.frequency++;
    } else {
      this.data.movement.metrics.pauseAreas.push(pauseArea);
    }
  }

  private updateMovementMetrics(
    position: { x: number; y: number; timestamp: number },
    speed: number
  ) {
    if (this.currentPath.length > 1) {
      const lastPosition = this.currentPath[this.currentPath.length - 2];
      this.data.movement.metrics.totalDistance += Math.sqrt(
        Math.pow(position.x - lastPosition.x, 2) +
          Math.pow(position.y - lastPosition.y, 2)
      );
    }

    this.data.movement.metrics.averageSpeed =
      (this.data.movement.metrics.averageSpeed * (this.currentPath.length - 1) +
        speed) /
      this.currentPath.length;

    // Update coverage
    const viewportHeight = window.innerHeight;
    const isAboveTheFold = position.y <= viewportHeight;

    if (isAboveTheFold) {
      this.data.movement.metrics.coverage.aboveTheFold++;
    } else {
      this.data.movement.metrics.coverage.belowTheFold++;
    }

    this.data.movement.metrics.coverage.total =
      ((this.data.movement.metrics.coverage.aboveTheFold +
        this.data.movement.metrics.coverage.belowTheFold) /
        (document.documentElement.scrollHeight * window.innerWidth)) *
      100;
  }

  private updateScrollMetrics(pattern: {
    startDepth: number;
    endDepth: number;
    speed: number;
    dwellTime: number;
  }) {
    // Update depth distribution
    const depth = Math.round(pattern.endDepth / 10) * 10;
    this.data.scroll.depths.distribution[depth] =
      (this.data.scroll.depths.distribution[depth] || 0) + pattern.dwellTime;

    // Update max depth
    this.data.scroll.depths.maxReached = Math.max(
      this.data.scroll.depths.maxReached,
      pattern.endDepth
    );

    // Update average dwell time
    const totalDwell = Object.values(
      this.data.scroll.depths.distribution
    ).reduce((a, b) => a + b, 0);
    const depthCount = Object.keys(this.data.scroll.depths.distribution).length;
    this.data.scroll.depths.averageDwell = totalDwell / depthCount;
  }

  private detectReadingPattern() {
    const patterns = this.data.scroll.patterns;
    if (patterns.length < 3) return;

    const recentPatterns = patterns.slice(-3);
    const speeds = recentPatterns.map((p) => p.speed);
    const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    const speedVariance = Math.sqrt(
      speeds.reduce((acc, speed) => acc + Math.pow(speed - avgSpeed, 2), 0) /
        speeds.length
    );

    if (speedVariance < 0.1) {
      this.data.scroll.depths.readingPattern = 'smooth';
    } else if (speedVariance < 0.3) {
      this.data.scroll.depths.readingPattern = 'skimming';
    } else {
      this.data.scroll.depths.readingPattern = 'jumping';
    }
  }

  private trackRageClick(position: { x: number; y: number }) {
    const rageEvent = {
      timestamp: new Date().toISOString(),
      type: 'multiclick' as const,
      intensity: this.calculateRageIntensity(),
      context: {
        element: document.elementFromPoint(position.x, position.y)?.tagName,
        action: 'rapid_clicks',
        frequency: this.RAGE_CLICK_THRESHOLD,
      },
    };

    this.data.rage.events.push(rageEvent);
    this.data.rage.metrics.clickRage++;
    this.data.rage.metrics.overallFrustration =
      this.calculateFrustrationScore();

    this.trackInteraction('rage', rageEvent);
  }

  private calculateRageIntensity(): number {
    const recentClicks = this.data.clicks
      .slice(-5)
      .filter(
        (click) =>
          Date.now() - new Date(click.metadata.timestamp).getTime() <
          this.RAGE_CLICK_INTERVAL
      );

    return Math.min(
      100,
      (recentClicks.length / this.RAGE_CLICK_THRESHOLD) * 100
    );
  }

  private calculateFrustrationScore(): number {
    return (
      (this.data.rage.metrics.clickRage * 0.6 +
        this.data.rage.metrics.scrollRage * 0.4) /
      (this.data.rage.events.length || 1)
    );
  }

  private updateHotspots(position: {
    x: number;
    y: number;
    viewportX: number;
    viewportY: number;
  }) {
    const hotspot = {
      center: { x: position.x, y: position.y },
      radius: 50,
      intensity: 1,
      elements: this.getElementsAtPoint(position.viewportX, position.viewportY),
      interactions: { clicks: 1 },
    };

    const existingHotspot = this.data.attention.hotspots.find(
      (spot) =>
        Math.abs(spot.center.x - hotspot.center.x) < spot.radius &&
        Math.abs(spot.center.y - hotspot.center.y) < spot.radius
    );

    if (existingHotspot) {
      existingHotspot.intensity++;
      existingHotspot.interactions.clicks++;
      existingHotspot.elements = [
        ...new Set([...existingHotspot.elements, ...hotspot.elements]),
      ];
    } else {
      this.data.attention.hotspots.push(hotspot);
    }
  }

  private getElementsAtPoint(x: number, y: number): string[] {
    return Array.from(document.elementsFromPoint(x, y))
      .map((el) => (el as HTMLElement).tagName.toLowerCase())
      .filter(Boolean);
  }

  private findOrCreateAttentionZone(element: Element) {
    const rect = element.getBoundingClientRect();
    const zone = this.data.attention.zones.find(
      (z) =>
        z.area.top === rect.top &&
        z.area.left === rect.left &&
        z.area.width === rect.width &&
        z.area.height === rect.height
    );

    if (zone) return zone;

    const newZone = {
      area: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      },
      score: 0,
      interactions: 0,
      timeVisible: 0,
      elements: [element.tagName.toLowerCase()],
    };

    this.data.attention.zones.push(newZone);
    return newZone;
  }

  private calculateAttentionScore(zone: {
    timeVisible: number;
    interactions: number;
  }): number {
    const timeWeight = Math.min(zone.timeVisible / 10000, 1); // Cap at 10 seconds
    const interactionWeight = Math.min(zone.interactions / 5, 1); // Cap at 5 interactions
    return (timeWeight * 0.7 + interactionWeight * 0.3) * 100;
  }

  private updateAttentionMetrics(zone: {
    area: { top: number; left: number; width: number; height: number };
    score: number;
  }) {
    // Update coldspots
    if (zone.score < 20) {
      const coldspot = {
        area: zone.area,
        timeVisible: 0,
        potentialIssues: this.detectPotentialIssues(zone),
      };

      const existingColdspot = this.data.attention.coldspots.find(
        (spot) =>
          spot.area.top === zone.area.top && spot.area.left === zone.area.left
      );

      if (!existingColdspot) {
        this.data.attention.coldspots.push(coldspot);
      }
    }
  }

  private detectPotentialIssues(zone: {
    area: { top: number; left: number; width: number; height: number };
    score: number;
  }): string[] {
    const issues: string[] = [];

    if (zone.area.top > window.innerHeight) {
      issues.push('below_fold');
    }
    if (zone.area.width < 50 || zone.area.height < 50) {
      issues.push('too_small');
    }
    if (zone.score < 10) {
      issues.push('low_engagement');
    }

    return issues;
  }

  private getSessionId(): string {
    let sessionId = sessionStorage.getItem('heatmap_session_id');
    if (!sessionId) {
      sessionId = `session_${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem('heatmap_session_id', sessionId);
    }
    return sessionId;
  }

  private trackInteraction(type: string, data: any) {
    this.analytics.track(`heatmap_${type}`, {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  cleanup() {
    // Remove event listeners
    window.removeEventListener('click', this.handleClick);
    window.removeEventListener('contextmenu', this.handleClick);
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('touchstart', this.handleTouch);
    window.removeEventListener('touchmove', this.handleTouch);
    window.removeEventListener('touchend', this.handleTouch);
    window.removeEventListener('scroll', this.handleScroll);

    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
    }

    // Finalize movement path
    if (this.currentPath.length > 1) {
      const enhancedPath = this.currentPath.map((point, index) => ({
        ...point,
        speed:
          index === 0
            ? 0
            : this.calculateSpeed(this.currentPath[index - 1], point),
        type: this.determineMovementType(
          point,
          index > 0 ? this.currentPath[index - 1] : null
        ),
      }));

      this.data.movement.paths.push({
        points: enhancedPath,
        duration:
          this.currentPath[this.currentPath.length - 1].timestamp -
          this.currentPath[0].timestamp,
        distance: this.data.movement.metrics.totalDistance,
        averageSpeed: this.data.movement.metrics.averageSpeed,
        pausePoints: this.data.movement.metrics.pauseAreas,
      });
    }

    // Send final heatmap data
    this.analytics.track('heatmap_summary', {
      ...this.data,
      timestamp: new Date().toISOString(),
    });
  }

  private determineMovementType(
    current: { x: number; y: number; timestamp: number },
    previous: { x: number; y: number; timestamp: number } | null
  ): 'move' | 'pause' | 'hover' {
    if (!previous) return 'move';

    const speed = this.calculateSpeed(previous, current);
    if (speed < 0.1) return 'pause';
    if (
      Math.abs(current.x - previous.x) < 5 &&
      Math.abs(current.y - previous.y) < 5
    )
      return 'hover';
    return 'move';
  }
}
