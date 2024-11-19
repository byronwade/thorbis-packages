import { BaseTracker } from './base';

interface ContentMetrics {
  content_id: string;
  metrics: {
    viewTime: number;
    readingProgress: number;
    interactionCount: number;
    scrollDepth: number;
  };
  interactions: {
    likes: number;
    shares: number;
    comments: number;
    saves: number;
    clicks: number;
    highlights: number;
    copies: number;
  };
  scroll_depth_distribution: {
    '25%': number;
    '50%': number;
    '75%': number;
    '100%': number;
  };
  engagement_signals: {
    scroll_speed: number[];
    time_to_first_interaction: number | null;
    interaction_frequency: number;
    return_visits: number;
    exit_points: string[];
  };
}

interface SEOMetrics {
  meta: {
    title: string;
    description: string;
    keywords: string;
    robots: string;
    viewport: string;
    canonical: string;
    ogTags: Record<string, string>;
    twitterTags: Record<string, string>;
  };
  headings: {
    counts: Record<string, number>;
    structure: Array<{
      level: number;
      text: string;
      order: number;
      issues?: string[];
    }>;
    issues: string[];
  };
  links: {
    internal: Array<{
      href: string;
      text: string;
      rel: string;
      target: string;
    }>;
    external: Array<{
      href: string;
      text: string;
      rel: string;
      target: string;
    }>;
    broken: Array<{
      href: string;
      error: string;
    }>;
    nofollow: Array<{
      href: string;
      text: string;
    }>;
    stats: {
      total: number;
      internal: number;
      external: number;
      broken: number;
      nofollow: number;
    };
  };
  images: {
    images: Array<{
      src: string;
      alt: string;
      width: number;
      height: number;
      loading: string;
      naturalWidth: number;
      naturalHeight: number;
    }>;
    issues: {
      withoutAlt: string[];
      withoutDimensions: string[];
      largeImages: string[];
    };
    stats: {
      total: number;
      withAlt: number;
      withDimensions: number;
      oversized: number;
    };
  };
  content: {
    readability: {
      score: number;
      level: string;
      issues: string[];
    };
    keywords: {
      primary: string;
      secondary: string[];
      density: Record<string, number>;
    };
    structure: {
      paragraphs: number;
      sentences: number;
      words: number;
      readingTime: number;
    };
    quality: {
      score: number;
      issues: string[];
      suggestions: string[];
    };
  };
  schema: {
    schemas: any[];
    count: number;
    types: string[];
  };
  accessibility: {
    ariaLabels: number;
    ariaDescriptions: number;
    altTexts: number;
    formLabels: number;
    landmarks: Record<string, number>;
  };
  performance: {
    loadTime: number;
    size: number;
    resources: number;
    caching: boolean;
  };
}

export class SEOTracker extends BaseTracker {
	private metrics: SEOMetrics & { contents: ContentMetrics[] };
	private contentViewStartTime: number;
	private scrollPositions: number[] = [];
	private readonly SCROLL_THROTTLE = 100; // ms
	private scrollThrottleTimer: NodeJS.Timeout | null = null;
	private readonly CONTENT_UPDATE_INTERVAL = 1000; // 1 second
	private contentUpdateTimer: NodeJS.Timeout | null = null;
	private observer: MutationObserver | null = null;

	constructor(analytics: any) {
		super(analytics);
		this.metrics = this.initializeMetrics();
		this.contentViewStartTime = Date.now();
	}

	private initializeMetrics(): SEOMetrics & { contents: ContentMetrics[] } {
		return {
			meta: {
				title: "",
				description: "",
				keywords: "",
				robots: "",
				viewport: "",
				canonical: "",
				ogTags: {},
				twitterTags: {},
			},
			headings: {
				counts: {},
				structure: [],
				issues: [],
			},
			links: {
				internal: [],
				external: [],
				broken: [],
				nofollow: [],
				stats: {
					total: 0,
					internal: 0,
					external: 0,
					broken: 0,
					nofollow: 0,
				},
			},
			images: {
				images: [],
				issues: {
					withoutAlt: [],
					withoutDimensions: [],
					largeImages: [],
				},
				stats: {
					total: 0,
					withAlt: 0,
					withDimensions: 0,
					oversized: 0,
				},
			},
			content: {
				readability: {
					score: 0,
					level: "",
					issues: [],
				},
				keywords: {
					primary: "",
					secondary: [],
					density: {},
				},
				structure: {
					paragraphs: 0,
					sentences: 0,
					words: 0,
					readingTime: 0,
				},
				quality: {
					score: 0,
					issues: [],
					suggestions: [],
				},
			},
			schema: {
				schemas: [],
				count: 0,
				types: [],
			},
			accessibility: {
				ariaLabels: 0,
				ariaDescriptions: 0,
				altTexts: 0,
				formLabels: 0,
				landmarks: {},
			},
			performance: {
				loadTime: 0,
				size: 0,
				resources: 0,
				caching: false,
			},
			contents: [],
		};
	}

	async init(): Promise<void> {
		if (typeof window === "undefined") return;

		try {
			// Initialize SEO tracking
			this.collectSEOData();

			// Initialize content tracking
			this.trackInitialContent();
			this.setupContentTracking();

			// Set up mutation observer for dynamic content
			this.setupMutationObserver();

			this.log("SEO and Content tracker initialized");
		} catch (error) {
			console.warn("Error initializing SEO tracker:", error);
		}
	}

	getData(): any {
		return {
			meta: this.metrics.meta,
			headings: this.metrics.headings,
			links: this.metrics.links,
			images: this.metrics.images,
			content: {
				...this.metrics.content,
				contents: this.metrics.contents.map((content) => ({
					content_id: content.content_id,
					metrics: {
						viewTime: Date.now() - this.contentViewStartTime,
						readingProgress: this.calculateReadingProgress(content),
						interactionCount: this.getTotalInteractions(content.interactions),
						scrollDepth: Math.max(...this.scrollPositions, 0),
					},
					interactions: content.interactions,
					scroll_depth_distribution: this.getScrollDepthDistribution(),
					engagement_signals: this.getEngagementSignals(content),
				})),
			},
			schema: this.metrics.schema,
			accessibility: this.metrics.accessibility,
			performance: this.metrics.performance,
			timestamp: Date.now(),
			url: window.location.href,
			summary: {
				seoScore: this.calculateSEOScore(),
				contentScore: this.calculateContentScore(),
				issues: this.findIssues(),
				recommendations: this.generateRecommendations(),
			},
		};
	}

	cleanup(): void {
		if (this.scrollThrottleTimer) {
			clearTimeout(this.scrollThrottleTimer);
		}
		if (this.contentUpdateTimer) {
			clearTimeout(this.contentUpdateTimer);
		}
		if (this.observer) {
			this.observer.disconnect();
		}
	}

	private setupMutationObserver(): void {
		this.observer = new MutationObserver((mutations: MutationRecord[]) => {
			let shouldUpdate = false;
			for (const mutation of mutations) {
				if (mutation.type === "childList" || (mutation.type === "attributes" && ["title", "meta", "link"].includes((mutation.target as Element).tagName.toLowerCase()))) {
					shouldUpdate = true;
					break;
				}
			}
			if (shouldUpdate) {
				this.collectSEOData();
			}
		});

		this.observer.observe(document.documentElement, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ["content", "href", "src", "alt"],
		});
	}

	private setupContentTracking(): void {
		// Track scroll with throttling
		window.addEventListener(
			"scroll",
			() => {
				if (this.scrollThrottleTimer) return;
				this.scrollThrottleTimer = setTimeout(() => {
					this.scrollPositions.push(this.calculateScrollDepth());
					this.scrollThrottleTimer = null;
				}, this.SCROLL_THROTTLE);
			},
			{ passive: true }
		);

		// Update content metrics periodically
		this.contentUpdateTimer = setInterval(() => {
			this.updateContentMetrics();
		}, this.CONTENT_UPDATE_INTERVAL);
	}

	private collectSEOData(): void {
		this.metrics.meta = this.getMetaTags();
		this.metrics.headings = this.getHeadingStructure();
		this.metrics.links = this.getLinkAnalysis();
		this.metrics.images = this.getImageAnalysis();
		this.metrics.schema = this.getStructuredData();
		this.metrics.accessibility = this.getAccessibilityMetrics();
	}

	private getMetaTags(): any {
		const metaTags = Array.from(document.getElementsByTagName("meta"));
		const metaData: Record<string, any> = {
			title: document.title,
			description: "",
			keywords: "",
			robots: "",
			viewport: "",
			canonical: "",
			ogTags: {},
			twitterTags: {},
		};

		metaTags.forEach((meta) => {
			const name = meta.getAttribute("name") || meta.getAttribute("property");
			const content = meta.getAttribute("content");

			if (!name || !content) return;

			if (name.startsWith("og:")) {
				metaData.ogTags[name] = content;
			} else if (name.startsWith("twitter:")) {
				metaData.twitterTags[name] = content;
			} else {
				metaData[name] = content;
			}
		});

		return metaData;
	}

	private getHeadingStructure(): any {
		const headings = {
			h1: Array.from(document.getElementsByTagName("h1")),
			h2: Array.from(document.getElementsByTagName("h2")),
			h3: Array.from(document.getElementsByTagName("h3")),
			h4: Array.from(document.getElementsByTagName("h4")),
			h5: Array.from(document.getElementsByTagName("h5")),
			h6: Array.from(document.getElementsByTagName("h6")),
		};

		return {
			counts: {
				h1: headings.h1.length,
				h2: headings.h2.length,
				h3: headings.h3.length,
				h4: headings.h4.length,
				h5: headings.h5.length,
				h6: headings.h6.length,
			},
			structure: this.analyzeHeadingHierarchy(headings),
			issues: this.findHeadingIssues(headings),
		};
	}

	private getLinkAnalysis(): any {
		const links = Array.from(document.getElementsByTagName("a"));
		const internal: any[] = [];
		const external: any[] = [];
		const broken: any[] = [];
		const nofollow: any[] = [];

		links.forEach((link) => {
			const href = link.getAttribute("href");
			if (!href) return;

			const linkData = {
				href,
				text: link.textContent?.trim() || "",
				rel: link.getAttribute("rel") || "",
				target: link.getAttribute("target") || "",
			};

			if (href.startsWith("http") && !href.includes(window.location.hostname)) {
				external.push(linkData);
				if (link.getAttribute("rel")?.includes("nofollow")) {
					nofollow.push(linkData);
				}
			} else {
				internal.push(linkData);
			}
		});

		return {
			internal,
			external,
			broken,
			nofollow,
			stats: {
				total: links.length,
				internal: internal.length,
				external: external.length,
				broken: broken.length,
				nofollow: nofollow.length,
			},
		};
	}

	private getImageAnalysis(): any {
		const images = Array.from(document.getElementsByTagName("img"));
		const withoutAlt: any[] = [];
		const withoutDimensions: any[] = [];
		const largeImages: any[] = [];

		const imageData = images.map((img) => {
			const data = {
				src: img.src,
				alt: img.alt,
				width: img.width,
				height: img.height,
				loading: img.loading,
				naturalWidth: img.naturalWidth,
				naturalHeight: img.naturalHeight,
			};

			if (!img.alt) withoutAlt.push(data);
			if (!img.width || !img.height) withoutDimensions.push(data);
			if (img.naturalWidth > 1000 || img.naturalHeight > 1000) {
				largeImages.push(data);
			}

			return data;
		});

		return {
			images: imageData,
			issues: {
				withoutAlt,
				withoutDimensions,
				largeImages,
			},
			stats: {
				total: images.length,
				withAlt: images.length - withoutAlt.length,
				withDimensions: images.length - withoutDimensions.length,
				oversized: largeImages.length,
			},
		};
	}

	private getStructuredData(): any {
		const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
		const data: any[] = [];

		scripts.forEach((script) => {
			try {
				const jsonData = JSON.parse(script.textContent || "");
				data.push(jsonData);
			} catch (error) {
				console.error("Error parsing structured data:", error);
			}
		});

		return {
			schemas: data,
			count: data.length,
			types: data.map((item) => item["@type"]),
		};
	}

	private getAccessibilityMetrics(): any {
		return {
			ariaAttributes: {
				labels: document.querySelectorAll("[aria-label]").length,
				descriptions: document.querySelectorAll("[aria-describedby]").length,
				roles: document.querySelectorAll("[role]").length,
			},
			landmarks: {
				main: document.querySelectorAll("main").length,
				navigation: document.querySelectorAll("nav").length,
				complementary: document.querySelectorAll("aside").length,
				contentinfo: document.querySelectorAll("footer").length,
				banner: document.querySelectorAll("header").length,
			},
			forms: {
				withLabels: document.querySelectorAll("label").length,
				inputs: document.querySelectorAll("input").length,
				buttons: document.querySelectorAll("button").length,
			},
			media: {
				imagesWithAlt: document.querySelectorAll("img[alt]").length,
				videosWithCaptions: document.querySelectorAll("video[data-captions]").length,
			},
		};
	}

	private analyzeHeadingHierarchy(headings: any): any {
		// Implementation
		return [];
	}

	private findHeadingIssues(headings: any): any {
		// Implementation
		return [];
	}

	private calculateSEOScore(): number {
		const scores = {
			meta: this.calculateMetaScore(),
			headings: this.calculateHeadingsScore(),
			links: this.calculateLinksScore(),
			images: this.calculateImagesScore(),
			accessibility: this.calculateAccessibilityScore(),
		};

		return Math.round((scores.meta * 0.3 + scores.headings * 0.2 + scores.links * 0.2 + scores.images * 0.15 + scores.accessibility * 0.15) * 100);
	}

	private calculateContentScore(): number {
		const scores = {
			readability: this.calculateReadabilityScore(),
			structure: this.calculateStructureScore(),
			media: this.calculateMediaScore(),
			links: this.calculateLinksScore(),
			metadata: this.calculateMetadataScore(),
		};

		return Math.round((scores.readability * 0.3 + scores.structure * 0.2 + scores.media * 0.2 + scores.links * 0.15 + scores.metadata * 0.15) * 100);
	}

	private findIssues(): string[] {
		const issues: string[] = [];

		// Check meta tags
		if (!this.metrics.meta.title) issues.push("Missing page title");
		if (!this.metrics.meta.description) issues.push("Missing meta description");
		if (!this.metrics.meta.canonical) issues.push("Missing canonical URL");

		// Check headings
		if (this.metrics.headings.counts.h1 !== 1) {
			issues.push("Page should have exactly one H1 heading");
		}

		// Check images
		if (this.metrics.images.issues.withoutAlt.length > 0) {
			issues.push("Images missing alt text");
		}

		// Check links
		if (this.metrics.links.broken.length > 0) {
			issues.push("Page contains broken links");
		}

		// Check content
		if (this.metrics.content.readability.score < 60) {
			issues.push("Content readability needs improvement");
		}

		return issues;
	}

	private generateRecommendations(): string[] {
		const recommendations: string[] = [];

		// Meta recommendations
		if (!this.metrics.meta.description) {
			recommendations.push("Add a meta description to improve search visibility");
		}
		if (this.metrics.meta.title.length < 30 || this.metrics.meta.title.length > 60) {
			recommendations.push("Optimize title length (30-60 characters)");
		}

		// Content recommendations
		if (this.metrics.content.readability.score < 60) {
			recommendations.push("Improve content readability with shorter sentences and simpler words");
		}
		if (this.metrics.content.structure.paragraphs < 3) {
			recommendations.push("Add more paragraphs to improve content structure");
		}

		// Image recommendations
		if (this.metrics.images.issues.withoutAlt.length > 0) {
			recommendations.push("Add alt text to all images for better accessibility");
		}
		if (this.metrics.images.issues.largeImages.length > 0) {
			recommendations.push("Optimize large images to improve page load speed");
		}

		// Link recommendations
		if (this.metrics.links.stats.internal === 0) {
			recommendations.push("Add internal links to improve site structure");
		}
		if (this.metrics.links.broken.length > 0) {
			recommendations.push("Fix broken links to improve user experience");
		}

		return recommendations;
	}

	private trackInitialContent(): void {
		try {
			// Track meta tags
			this.metrics.meta = this.getMetaTags();

			// Track headings structure
			this.metrics.headings = this.getHeadingStructure();

			// Track links
			this.metrics.links = this.getLinkAnalysis();

			// Track images
			this.metrics.images = this.getImageAnalysis();

			// Track schema data
			this.metrics.schema = this.getStructuredData();

			// Track accessibility metrics
			this.metrics.accessibility = this.getAccessibilityMetrics();
		} catch (error) {
			console.warn("Error tracking initial content:", error);
		}
	}

	private updateContentMetrics(): void {
		try {
			// Update content metrics
			const mainContent = document.querySelector("main, article, .content");
			if (!mainContent) return;

			// Update readability metrics
			this.metrics.content.readability = this.calculateReadabilityMetrics(mainContent);

			// Update keyword density
			this.metrics.content.keywords = this.analyzeKeywords(mainContent);

			// Update content structure
			this.metrics.content.structure = this.analyzeContentStructure(mainContent);

			// Update quality metrics
			this.metrics.content.quality = this.analyzeContentQuality(mainContent);
		} catch (error) {
			console.warn("Error updating content metrics:", error);
		}
	}

	private calculateReadabilityMetrics(element: Element): any {
		const text = element.textContent || "";
		const words = text.split(/\s+/).length;
		const sentences = text.split(/[.!?]+/).length;
		const syllables = this.countSyllables(text);

		const fleschScore = 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words);

		return {
			score: Math.max(0, Math.min(100, fleschScore)),
			level: this.getReadabilityLevel(fleschScore),
			issues: this.findReadabilityIssues(text),
		};
	}

	private countSyllables(text: string): number {
		return text
			.toLowerCase()
			.replace(/[^a-z]/g, "")
			.replace(/[^aeiou]+/g, " ")
			.trim().length;
	}

	private getReadabilityLevel(score: number): string {
		if (score >= 90) return "Very Easy";
		if (score >= 80) return "Easy";
		if (score >= 70) return "Fairly Easy";
		if (score >= 60) return "Standard";
		if (score >= 50) return "Fairly Difficult";
		if (score >= 30) return "Difficult";
		return "Very Difficult";
	}

	private findReadabilityIssues(text: string): string[] {
		const issues: string[] = [];
		const sentences = text.split(/[.!?]+/);

		sentences.forEach((sentence) => {
			if (sentence.split(/\s+/).length > 25) {
				issues.push("Sentence is too long (over 25 words)");
			}
			if (/\b\w{13,}\b/.test(sentence)) {
				issues.push("Contains very long words (over 12 characters)");
			}
		});

		return issues;
	}

	private analyzeKeywords(element: Element): any {
		const text = element.textContent || "";
		const words = text.toLowerCase().split(/\s+/);
		const wordCount = words.length;
		const density: Record<string, number> = {};

		words.forEach((word) => {
			if (word.length > 3) {
				// Ignore short words
				density[word] = (density[word] || 0) + 1;
			}
		});

		// Convert to percentages and sort by frequency
		const sortedWords = Object.entries(density)
			.map(([word, count]) => ({
				word,
				density: (count / wordCount) * 100,
			}))
			.sort((a, b) => b.density - a.density);

		return {
			primary: sortedWords[0]?.word || "",
			secondary: sortedWords.slice(1, 6).map((w) => w.word),
			density: Object.fromEntries(sortedWords.slice(0, 10).map(({ word, density }) => [word, density])),
		};
	}

	private analyzeContentStructure(element: Element): any {
		const text = element.textContent || "";
		const paragraphs = element.querySelectorAll("p").length;
		const sentences = text.split(/[.!?]+/).length;
		const words = text.split(/\s+/).length;
		const readingTime = Math.ceil(words / 200); // Assuming 200 words per minute

		return {
			paragraphs,
			sentences,
			words,
			readingTime,
		};
	}

	private analyzeContentQuality(element: Element): any {
		const issues: string[] = [];
		const suggestions: string[] = [];

		// Check content length
		if (element.textContent!.length < 300) {
			issues.push("Content is too short");
			suggestions.push("Add more detailed information to improve content depth");
		}

		// Check heading structure
		if (!element.querySelector("h1, h2, h3")) {
			issues.push("Missing heading structure");
			suggestions.push("Add headings to improve content organization");
		}

		// Check for lists
		if (!element.querySelector("ul, ol")) {
			suggestions.push("Consider adding lists to break down information");
		}

		// Calculate quality score based on various factors
		const score = this.calculateQualityScore(element, issues.length);

		return {
			score,
			issues,
			suggestions,
		};
	}

	private calculateQualityScore(element: Element, issueCount: number): number {
		let score = 100;

		// Deduct points for issues
		score -= issueCount * 10;

		// Add points for good practices
		if (element.querySelector("img[alt]")) score += 5;
		if (element.querySelector("blockquote")) score += 5;
		if (element.querySelector("ul, ol")) score += 5;
		if (element.querySelectorAll("p").length >= 5) score += 5;

		return Math.max(0, Math.min(100, score));
	}

	private calculateReadingProgress(content: ContentMetrics): number {
		const windowHeight = window.innerHeight;
		const docHeight = document.documentElement.scrollHeight - windowHeight;
		const scrollTop = window.scrollY;
		return Math.min(100, Math.round((scrollTop / docHeight) * 100));
	}

	private getTotalInteractions(interactions: ContentMetrics["interactions"]): number {
		return Object.values(interactions).reduce((sum, count) => sum + count, 0);
	}

	private getScrollDepthDistribution(): ContentMetrics["scroll_depth_distribution"] {
		const maxDepth = Math.max(...this.scrollPositions);
		return {
			"25%": this.scrollPositions.filter((d) => d >= 25).length,
			"50%": this.scrollPositions.filter((d) => d >= 50).length,
			"75%": this.scrollPositions.filter((d) => d >= 75).length,
			"100%": this.scrollPositions.filter((d) => d >= 100).length,
		};
	}

	private getEngagementSignals(content: ContentMetrics): ContentMetrics["engagement_signals"] {
		return {
			scroll_speed: this.calculateScrollSpeeds(),
			time_to_first_interaction: this.getTimeToFirstInteraction(),
			interaction_frequency: this.calculateInteractionFrequency(content),
			return_visits: this.getReturnVisits(),
			exit_points: this.getExitPoints(),
		};
	}

	private calculateScrollSpeeds(): number[] {
		const speeds: number[] = [];
		for (let i = 1; i < this.scrollPositions.length; i++) {
			speeds.push(this.scrollPositions[i] - this.scrollPositions[i - 1]);
		}
		return speeds;
	}

	private getTimeToFirstInteraction(): number | null {
		// Implementation
		return null;
	}

	private calculateInteractionFrequency(content: ContentMetrics): number {
		const totalInteractions = this.getTotalInteractions(content.interactions);
		const timeOnPage = (Date.now() - this.contentViewStartTime) / 1000; // in seconds
		return timeOnPage > 0 ? totalInteractions / timeOnPage : 0;
	}

	private getReturnVisits(): number {
		// Implementation
		return 0;
	}

	private getExitPoints(): string[] {
		// Implementation
		return [];
	}
}
