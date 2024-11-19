import { BaseTracker } from './base';

interface HeatmapPoint {
  x: number;
  y: number;
  value: number; // Intensity/weight
  timestamp: number;
  elementInfo?: {
    tag: string;
    id?: string;
    classes: string[];
    text?: string;
    path: string;
    dimensions: DOMRect;
    zIndex: number;
    visibility: number;
  };
}

interface EngagementMetrics {
  interactions: {
    clicks: Array<{
      timestamp: string;
      elementId: string;
      elementType: string;
      position: { x: number; y: number };
      context: {
        nearestHeading?: string;
        section?: string;
        text?: string;
      };
    }>;
    rageClicks: Array<{
      timestamp: string;
      elementId: string;
      clickCount: number;
      position: { x: number; y: number };
    }>;
    hovers: Array<{
      timestamp: string;
      duration: number;
      elementType: string;
      elementPath: string;
      position: { x: number; y: number };
      content: string;
      context: {
        nearestHeading?: string;
        section?: string;
      };
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
        section?: string;
      };
      metrics: {
        wordsSelected: number;
        selectionSpeed: number;
        readingTime: number;
        copied: boolean;
      };
    }>;
  };
  attention: {
    zones: Array<{
      selector: string;
      timeSpent: number;
      interactions: number;
      visibility: number;
    }>;
  };
  scrolling: {
    depths: Array<{
      percentage: number;
      timestamp: string;
      dwellTime: number;
    }>;
    milestones: Array<{
      depth: number;
      timestamp: string;
    }>;
  };
  timing: {
    totalTime: number;
    activeTime: number;
    idleTime: number;
  };
  heatmap: {
    clicks: Array<{
      x: number;
      y: number;
      timestamp: number;
      elementInfo?: ElementInfo;
    }>;
    moves: Array<{
      x: number;
      y: number;
      timestamp: number;
    }>;
    hovers: Array<{
      x: number;
      y: number;
      duration: number;
      timestamp: number;
      elementInfo?: ElementInfo;
    }>;
    scrollDepth: {
      max: number;
      distribution: Record<string, number>;
      timestamps: number[];
    };
    rageClicks: Array<{
      x: number;
      y: number;
      count: number;
      timestamp: number;
      element: string;
    }>;
    visualization: {
      points: Array<{
        x: number;
        y: number;
        value: number;
      }>;
      config: {
        width: number;
        height: number;
        maxIntensity: number;
        minIntensity: number;
      };
    };
  };
}

interface HeatmapData {
  viewport: {
    width: number;
    height: number;
    scrollHeight: number;
    scrollWidth: number;
  };
  interactions: {
    clicks: Array<{
      x: number;
      y: number;
      value: number; // Intensity
      timestamp: number;
      elementInfo?: {
        tag: string;
        id?: string;
        classes: string[];
        text?: string;
        path: string;
      };
    }>;
    moves: Array<{
      x: number;
      y: number;
      value: number;
      timestamp: number;
    }>;
    hovers: Array<{
      x: number;
      y: number;
      duration: number;
      value: number;
      timestamp: number;
      elementInfo?: {
        tag: string;
        text?: string;
        path: string;
      };
    }>;
    rageClicks: Array<{
      x: number;
      y: number;
      count: number;
      timestamp: number;
      element: string;
    }>;
  };
  visualization: {
    points: Array<{
      x: number; // Normalized 0-100
      y: number; // Normalized 0-100
      value: number; // 0-1
      type: 'click' | 'move' | 'hover';
    }>;
    config: {
      width: number;
      height: number;
      maxIntensity: number;
      minIntensity: number;
      radius: number;
    };
    segments: {
      hotspots: Array<{
        x: number;
        y: number;
        radius: number;
        intensity: number;
        elements: string[];
      }>;
      coldspots: Array<{
        x: number;
        y: number;
        width: number;
        height: number;
      }>;
    };
  };
}

interface InteractionPoint {
	x: number;
	y: number;
	value: number;
	timestamp: number;
	elementInfo: ElementInfo;
}

interface ElementInfo {
	tag: string;
	id?: string;
	classes: string[];
	text?: string;
	path: string;
	dimensions: DOMRect;
	zIndex: number;
	visibility: number;
}

export class EngagementTracker extends BaseTracker {
	private metrics: EngagementMetrics;
	private moveThrottleTimer: NodeJS.Timeout | null = null;
	private observer: IntersectionObserver | null = null;
	private lastPosition = { x: 0, y: 0, timestamp: 0 };
	private readonly INTERACTION_THRESHOLDS = {
		hover: 500, // ms
		rageClick: {
			interval: 500,
			threshold: 3,
			timeout: 1000,
		},
		intensity: {
			decay: 0.95,
			moveThrottle: 50,
			radius: 50, // pixels
		},
	};
	private scrollPositions: number[] = [];

	constructor(analytics: any) {
		super(analytics);
		this.metrics = this.initializeMetrics();
		if (typeof window !== "undefined") {
			this.setupEventListeners();
		}
	}

	private initializeMetrics(): EngagementMetrics {
		return {
			interactions: {
				clicks: [],
				rageClicks: [],
				hovers: [],
				textSelections: [],
			},
			attention: {
				zones: [],
			},
			scrolling: {
				depths: [],
				milestones: [],
			},
			timing: {
				totalTime: 0,
				activeTime: 0,
				idleTime: 0,
			},
			heatmap: {
				clicks: [],
				moves: [],
				hovers: [],
				scrollDepth: {
					max: 0,
					distribution: {},
					timestamps: [],
				},
				rageClicks: [],
				visualization: {
					points: [],
					config: {
						width: typeof window !== "undefined" ? window.innerWidth : 0,
						height: typeof window !== "undefined" ? window.innerHeight : 0,
						maxIntensity: 0,
						minIntensity: 0,
					},
				},
			},
		};
	}

	private setupEventListeners(): void {
		try {
			// Use passive event listeners for better performance
			const options = { passive: true };

			window.addEventListener("click", this.handleClick, options);
			window.addEventListener("mousemove", this.handleMouseMove, options);
			window.addEventListener("scroll", this.handleScroll, options);
			window.addEventListener("resize", this.handleResize, options);
			document.addEventListener("selectionchange", this.handleTextSelection);
			document.addEventListener("copy", this.handleCopy);

			// Set up attention tracking with IntersectionObserver
			this.setupAttentionTracking();

			// Set up performance monitoring
			this.setupPerformanceMonitoring();
		} catch (error) {
			console.warn("Error setting up event listeners:", error);
		}
	}

	private setupPerformanceMonitoring(): void {
		if ("PerformanceObserver" in window) {
			try {
				const observer = new PerformanceObserver((list) => {
					const entries = list.getEntries();
					entries.forEach((entry) => {
						if (entry.entryType === "longtask") {
							this.metrics.timing.idleTime += entry.duration;
						}
					});
				});

				observer.observe({ entryTypes: ["longtask"] });
			} catch (error) {
				console.warn("Error setting up performance monitoring:", error);
			}
		}
	}

	private handleClick = (event: MouseEvent): void => {
		try {
			const target = event.target;
			if (!target || !(target instanceof Element)) return;

			const now = Date.now();
			const point = this.createInteractionPoint(event, target, 1.0);

			// Use requestAnimationFrame for visual updates
			requestAnimationFrame(() => {
				this.updateMetrics(point, target as Element);
			});

			// Track analytics asynchronously
			setTimeout(() => {
				this.trackAnalytics("click", point);
			}, 0);
		} catch (error) {
			console.warn("Error handling click:", error);
		}
	};

	private handleMouseMove = (() => {
		let rafId: number;
		let lastProcessedTime = 0;
		const THROTTLE = 50; // ms

		return (event: MouseEvent): void => {
			try {
				const now = Date.now();
				if (now - lastProcessedTime < THROTTLE) return;

				cancelAnimationFrame(rafId);
				rafId = requestAnimationFrame(() => {
					const target = event.target;
					if (!target || !(target instanceof Element)) return;

					const point = this.createInteractionPoint(event, target, 0.3);
					this.updateMetrics(point, target);
					lastProcessedTime = now;
				});
			} catch (error) {
				console.warn("Error handling mouse move:", error);
			}
		};
	})();

	private createInteractionPoint(event: MouseEvent, target: Element, intensity: number): InteractionPoint {
		return {
			x: event.pageX,
			y: event.pageY,
			value: this.calculateIntensity(event.pageX, event.pageY, intensity),
			timestamp: Date.now(),
			elementInfo: this.getElementInfo(target),
		};
	}

	private getElementInfo(element: Element): ElementInfo {
		return {
			tag: element.tagName.toLowerCase(),
			id: element.id || undefined,
			classes: Array.from(element.classList),
			text: element.textContent?.slice(0, 100),
			path: this.getElementPath(element),
			dimensions: element.getBoundingClientRect(),
			zIndex: parseInt(window.getComputedStyle(element).zIndex) || 0,
			visibility: this.calculateElementVisibility(element),
		};
	}

	private updateMetrics(point: InteractionPoint, target: Element): void {
		// Update metrics in a single batch
		const updates = {
			heatmap: this.updateHeatmap(point),
			attention: this.updateAttention(target),
			interactions: this.updateInteractions(point, target),
		};

		Object.assign(this.metrics, updates);
	}

	private trackAnalytics(type: string, data: any): void {
		if (this.analytics?.track) {
			try {
				this.analytics.track(`engagement_${type}`, {
					...data,
					timestamp: new Date().toISOString(),
				});
			} catch (error) {
				console.warn("Error tracking analytics:", error);
			}
		}
	}

	cleanup(): void {
		try {
			if (this.moveThrottleTimer) {
				clearTimeout(this.moveThrottleTimer);
			}
			if (this.observer) {
				this.observer.disconnect();
			}

			const options = { passive: true };
			window.removeEventListener("click", this.handleClick, options);
			window.removeEventListener("mousemove", this.handleMouseMove, options);
			window.removeEventListener("scroll", this.handleScroll, options);
			window.removeEventListener("resize", this.handleResize, options);
			document.removeEventListener("selectionchange", this.handleTextSelection);
			document.removeEventListener("copy", this.handleCopy);
		} catch (error) {
			console.warn("Error during cleanup:", error);
		}
	}

	private setupAttentionTracking(): void {
		if (!("IntersectionObserver" in window)) {
			console.warn("IntersectionObserver not supported");
			return;
		}

		try {
			this.observer = new IntersectionObserver(
				(entries) => {
					entries.forEach((entry) => {
						const element = entry.target;
						const zone = this.metrics.attention.zones.find((z) => z.selector === this.getElementPath(element));

						if (zone) {
							zone.visibility = entry.intersectionRatio;
							if (entry.isIntersecting) {
								zone.timeSpent += entry.time;
								zone.interactions++;
							}
						}
					});
				},
				{
					threshold: [0, 0.25, 0.5, 0.75, 1],
					rootMargin: "0px",
				}
			);

			// Track main content areas
			const contentElements = document.querySelectorAll("main, article, section, [data-track-attention]");

			contentElements.forEach((element) => {
				if (this.observer) {
					this.observer.observe(element);
					this.metrics.attention.zones.push({
						selector: this.getElementPath(element),
						timeSpent: 0,
						interactions: 0,
						visibility: 0,
					});
				}
			});
		} catch (error) {
			console.warn("Error setting up attention tracking:", error);
		}
	}

	private calculateIntensity(x: number, y: number, baseIntensity: number): number {
		const decay = this.INTERACTION_THRESHOLDS.intensity.decay;
		const timeSinceLastPosition = Date.now() - this.lastPosition.timestamp;
		const distance = Math.sqrt(Math.pow(x - this.lastPosition.x, 2) + Math.pow(y - this.lastPosition.y, 2));

		return Math.min(baseIntensity * Math.pow(decay, distance / 100), 1);
	}

	private getElementPath(element: Element): string {
		const path: string[] = [];
		let current = element;

		while (current && current !== document.body) {
			let selector = current.tagName.toLowerCase();
			if (current.id) {
				selector += `#${current.id}`;
			} else if (current.className) {
				selector += `.${current.className.split(" ")[0]}`;
			}
			path.unshift(selector);
			current = current.parentElement as Element;
		}

		return path.join(" > ");
	}

	private calculateElementVisibility(element: Element): number {
		const rect = element.getBoundingClientRect();
		const windowHeight = window.innerHeight;
		const windowWidth = window.innerWidth;

		// Element is not visible at all
		if (rect.bottom < 0 || rect.top > windowHeight || rect.right < 0 || rect.left > windowWidth) {
			return 0;
		}

		// Calculate visible area
		const visibleHeight = Math.min(rect.bottom, windowHeight) - Math.max(rect.top, 0);
		const visibleWidth = Math.min(rect.right, windowWidth) - Math.max(rect.left, 0);
		const visibleArea = visibleHeight * visibleWidth;
		const totalArea = rect.height * rect.width;

		return totalArea > 0 ? visibleArea / totalArea : 0;
	}

	private updateHeatmap(point: InteractionPoint) {
		return {
			...this.metrics.heatmap,
			points: [
				...this.metrics.heatmap.visualization.points,
				{
					x: (point.x / window.innerWidth) * 100,
					y: (point.y / window.innerHeight) * 100,
					value: point.value,
				},
			],
		};
	}

	private updateAttention(target: Element) {
		const path = this.getElementPath(target);
		const zone = this.metrics.attention.zones.find((z) => z.selector === path);

		if (zone) {
			zone.interactions++;
		}

		return this.metrics.attention;
	}

	private updateInteractions(point: InteractionPoint, target: Element) {
		return {
			...this.metrics.interactions,
			lastInteraction: {
				point,
				target: this.getElementPath(target),
				timestamp: Date.now(),
			},
		};
	}

	private handleScroll = (() => {
		let ticking = false;
		return () => {
			if (!ticking) {
				requestAnimationFrame(() => {
					const scrollDepth = this.calculateScrollDepth();
					this.scrollPositions.push(scrollDepth);
					ticking = false;
				});
				ticking = true;
			}
		};
	})();

	private handleResize = (() => {
		let ticking = false;
		return () => {
			if (!ticking) {
				requestAnimationFrame(() => {
					if (this.metrics.heatmap.visualization) {
						this.metrics.heatmap.visualization.config = {
							...this.metrics.heatmap.visualization.config,
							width: window.innerWidth,
							height: window.innerHeight,
						};
					}
					ticking = false;
				});
				ticking = true;
			}
		};
	})();

	private handleTextSelection = () => {
		const selection = window.getSelection();
		if (!selection || !selection.toString()) return;

		const range = selection.getRangeAt(0);
		const container = range.commonAncestorContainer.parentElement;
		if (!container) return;

		this.metrics.interactions.textSelections.push({
			timestamp: new Date().toISOString(),
			text: selection.toString(),
			elementType: container.tagName.toLowerCase(),
			elementPath: this.getElementPath(container),
			selectionLength: selection.toString().length,
			duration: 0,
			context: {
				paragraph: container.textContent?.slice(0, 100),
				nearestHeading: this.findNearestHeading(container)?.textContent || undefined,
				section: this.findNearestSection(container)?.id || undefined,
			},
			metrics: {
				wordsSelected: selection.toString().split(/\s+/).length,
				selectionSpeed: 0,
				readingTime: this.calculateReadingTime(selection.toString()),
				copied: false,
			},
		});
	};

	private handleCopy = () => {
		const lastSelection = this.metrics.interactions.textSelections[this.metrics.interactions.textSelections.length - 1];
		if (lastSelection) {
			lastSelection.metrics.copied = true;
		}
	};

	private findNearestHeading(element: Element): Element | null {
		let current = element;
		while (current && current !== document.body) {
			const heading = current.querySelector("h1, h2, h3, h4, h5, h6");
			if (heading) return heading;
			current = current.parentElement as Element;
		}
		return null;
	}

	private findNearestSection(element: Element): Element | null {
		let current = element;
		while (current && current !== document.body) {
			if (current.tagName.toLowerCase() === "section") return current;
			current = current.parentElement as Element;
		}
		return null;
	}

	private calculateReadingTime(text: string): number {
		const wordsPerMinute = 200;
		const words = text.split(/\s+/).length;
		return Math.ceil(words / wordsPerMinute);
	}

	private calculateScrollDepth(): number {
		const windowHeight = window.innerHeight;
		const documentHeight = document.documentElement.scrollHeight;
		const scrollTop = window.scrollY;
		return Math.round(((scrollTop + windowHeight) / documentHeight) * 100);
	}

	async init(): Promise<void> {
		if (typeof window === "undefined") return;

		try {
			// Initialize engagement tracking
			this.setupEventListeners();
			this.setupAttentionTracking();
			this.setupPerformanceMonitoring();

			this.log("Engagement tracker initialized");
		} catch (error) {
			console.warn("Error initializing engagement tracker:", error);
		}
	}

	getData(): any {
		return {
			interactions: this.metrics.interactions,
			attention: this.metrics.attention,
			scrolling: this.metrics.scrolling,
			timing: this.metrics.timing,
			heatmap: {
				...this.metrics.heatmap,
				visualization: {
					points: this.metrics.heatmap.visualization.points,
					config: {
						width: window.innerWidth,
						height: window.innerHeight,
						maxIntensity: Math.max(...this.metrics.heatmap.visualization.points.map((p) => p.value)),
						minIntensity: Math.min(...this.metrics.heatmap.visualization.points.map((p) => p.value)),
					},
				},
			},
			summary: {
				totalInteractions: this.getTotalInteractions(),
				averageEngagement: this.calculateAverageEngagement(),
				hotspots: this.findHotspots(),
				scrollDepth: Math.max(...this.scrollPositions, 0),
			},
		};
	}

	private getTotalInteractions(): number {
		return this.metrics.interactions.clicks.length + this.metrics.interactions.rageClicks.length + this.metrics.interactions.hovers.length + this.metrics.interactions.textSelections.length;
	}

	private calculateAverageEngagement(): number {
		const totalTime = Date.now() - this.metrics.timing.totalTime;
		const activeTime = this.metrics.timing.activeTime;
		return totalTime > 0 ? (activeTime / totalTime) * 100 : 0;
	}

	private findHotspots(): Array<{ x: number; y: number; intensity: number }> {
		return this.metrics.heatmap.visualization.points
			.filter((p) => p.value > 0.7)
			.map((p) => ({
				x: p.x,
				y: p.y,
				intensity: p.value,
			}))
			.slice(0, 5); // Return top 5 hotspots
	}
}
