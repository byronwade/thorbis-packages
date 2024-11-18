import { BaseTracker } from './base';

interface SEOMetrics {
  meta: {
    title: {
      exists: boolean;
      length: number;
      content: string;
      issues?: string[];
    };
    description: {
      exists: boolean;
      length: number;
      content: string;
      issues?: string[];
    };
    robots: {
      exists: boolean;
      content: string;
      issues?: string[];
    };
    viewport: {
      exists: boolean;
      content: string;
      issues?: string[];
    };
    canonical: {
      exists: boolean;
      href: string;
      issues?: string[];
    };
    openGraph: {
      exists: boolean;
      tags: Record<string, string>;
      missing: string[];
    };
    twitter: {
      exists: boolean;
      tags: Record<string, string>;
      missing: string[];
    };
  };
  content: {
    headings: {
      h1Count: number;
      headingStructure: Array<{
        level: number;
        text: string;
        order: number;
      }>;
      issues?: string[];
    };
    images: {
      total: number;
      withAlt: number;
      withoutAlt: Array<{
        src: string;
        location: string;
      }>;
      largeImages: Array<{
        src: string;
        size: number;
      }>;
    };
    links: {
      internal: number;
      external: number;
      broken: Array<{
        href: string;
        text: string;
      }>;
      noFollow: number;
      issues?: string[];
    };
  };
  performance: {
    loadTime: number;
    resourceHints: {
      preload: string[];
      prefetch: string[];
      preconnect: string[];
      missing?: string[];
    };
    lazyLoading: {
      implemented: boolean;
      candidates: string[];
    };
  };
  mobile: {
    viewport: boolean;
    touchTargets: Array<{
      element: string;
      size: number;
      location: string;
    }>;
    fontSizes: Array<{
      size: number;
      elements: number;
    }>;
  };
}

interface SEOScore {
  score: number;
  penalties: Array<{ reason: string; points: number }>;
  improvements: string[];
}

interface EnhancedSEOMetrics extends SEOMetrics {
  schema: {
    exists: boolean;
    types: string[];
    missing: string[];
    issues?: string[];
  };
  accessibility: {
    ariaLabels: number;
    ariaDescriptions: number;
    missingLabels: string[];
    contrastIssues: Array<{
      element: string;
      ratio: number;
      required: number;
    }>;
  };
  keywords: {
    density: Record<string, number>;
    inTitle: string[];
    inHeadings: string[];
    inMetaDescription: string[];
    suggestions: string[];
  };
  technical: {
    htmlLang: boolean;
    charset: boolean;
    viewportMeta: boolean;
    doctype: boolean;
    validAmpHtml?: boolean;
    hreflangTags: Array<{
      lang: string;
      url: string;
    }>;
  };
}

export class SEOTracker extends BaseTracker {
  private metrics: EnhancedSEOMetrics;
  private isInitialized = false;
  private isAnalyzing = false;
  private analysisTimeout: NodeJS.Timeout | null = null;
  private observer: MutationObserver | null = null;
  private readonly THRESHOLDS = {
    TITLE_MIN_LENGTH: 30,
    TITLE_MAX_LENGTH: 60,
    DESC_MIN_LENGTH: 120,
    DESC_MAX_LENGTH: 155,
    MIN_WORDS_PER_PAGE: 300,
    MAX_IMAGE_SIZE: 200 * 1024, // 200KB
    MIN_TOUCH_TARGET: 44, // 44x44 pixels
    MIN_MOBILE_FONT: 16,
  };

  constructor(analytics: any) {
    super(analytics);
    this.metrics = this.initializeMetrics();
  }

  async init(): Promise<void> {
    if (typeof window === 'undefined' || this.isInitialized) {
      return;
    }

    try {
      this.isInitialized = true;
      console.group('🔍 SEO Analysis');

      // Run immediate analysis
      await this.analyzePage();

      // Log the results
      this.logSEOResults();

      // Set up observers for future changes
      this.observeChanges();

      console.groupEnd();
    } catch (error) {
      console.error('SEO Analysis Error:', error);
    }
  }

  private logSEOResults(): void {
    console.group('🔍 SEO Analysis Results');

    console.group('📝 Meta Tags');
    console.table({
      Title: this.metrics.meta.title,
      Description: this.metrics.meta.description,
      'Open Graph': this.metrics.meta.openGraph.exists ? '✅' : '❌',
      'Twitter Cards': this.metrics.meta.twitter.exists ? '✅' : '❌',
    });
    console.groupEnd();

    console.group('🔤 Content Analysis');
    console.table({
      'H1 Count': this.metrics.content.headings.h1Count,
      'Total Images': this.metrics.content.images.total,
      'Images with Alt': this.metrics.content.images.withAlt,
      'Internal Links': this.metrics.content.links.internal,
      'External Links': this.metrics.content.links.external,
    });
    console.groupEnd();

    console.group('📱 Mobile Optimization');
    console.table(this.metrics.mobile);
    console.groupEnd();

    console.group('⚡ Performance');
    console.table(this.metrics.performance);
    console.groupEnd();

    console.groupEnd(); // End SEO Analysis Results
  }

  private debouncedAnalysis(): void {
    if (this.analysisTimeout) {
      clearTimeout(this.analysisTimeout);
    }

    this.analysisTimeout = setTimeout(() => {
      if (!this.isAnalyzing) {
        this.analyzePage();
      }
    }, 30000); // Check every 30 seconds
  }

  private analyzePage(): void {
    if (this.isAnalyzing) return;

    this.isAnalyzing = true;

    try {
      this.checkMetaTags();
      this.analyzeHeadings();
      this.checkImages();
      this.analyzeLinks();
      this.checkPerformance();
      this.analyzeMobileOptimization();
      this.analyzeSchemaMarkup();
      this.analyzeAccessibility();
      this.analyzeKeywords();
      this.analyzeTechnicalSEO();

      // Log issues
      this.reportIssues();
    } catch (error) {
      console.error('SEO Analysis Error:', error);
    } finally {
      this.isAnalyzing = false;
    }
  }

  private observeChanges(): void {
    if (this.observer) {
      this.observer.disconnect();
    }

    this.observer = new MutationObserver((mutations) => {
      let shouldAnalyze = false;

      mutations.forEach((mutation) => {
        if (
          mutation.type === 'childList' ||
          (mutation.type === 'attributes' &&
            ['src', 'alt', 'href'].includes(mutation.attributeName || ''))
        ) {
          shouldAnalyze = true;
        }
      });

      if (shouldAnalyze) {
        this.debouncedAnalysis();
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'alt', 'href'],
    });
  }

  cleanup(): void {
    if (this.analysisTimeout) {
      clearTimeout(this.analysisTimeout);
    }

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    // Final analysis before cleanup
    if (this.isInitialized && !this.isAnalyzing) {
      this.analyzePage();
    }

    this.isInitialized = false;
    this.isAnalyzing = false;
  }

  private getIssuesSummary() {
    const issues = [];

    // Meta issues
    if (this.metrics.meta.title.issues?.length) {
      issues.push(
        ...this.metrics.meta.title.issues.map((issue) => ({
          type: 'Meta',
          severity: 'High',
          issue,
        }))
      );
    }

    // Image issues
    if (this.metrics.content.images.withoutAlt.length) {
      issues.push({
        type: 'Images',
        severity: 'Medium',
        issue: `${this.metrics.content.images.withoutAlt.length} images missing alt text`,
      });
    }

    // Link issues
    if (this.metrics.content.links.broken.length) {
      issues.push({
        type: 'Links',
        severity: 'High',
        issue: `${this.metrics.content.links.broken.length} broken links detected`,
      });
    }

    // Mobile issues
    if (this.metrics.mobile.touchTargets.length) {
      issues.push({
        type: 'Mobile',
        severity: 'Medium',
        issue: `${this.metrics.mobile.touchTargets.length} touch targets too small`,
      });
    }

    // Performance issues
    if (this.metrics.performance.resourceHints.missing?.length) {
      issues.push({
        type: 'Performance',
        severity: 'Low',
        issue: 'Missing resource hints for optimal loading',
      });
    }

    return issues;
  }

  private initializeMetrics(): EnhancedSEOMetrics {
    return {
      meta: {
        title: { exists: false, length: 0, content: '' },
        description: { exists: false, length: 0, content: '' },
        robots: { exists: false, content: '' },
        viewport: { exists: false, content: '' },
        canonical: { exists: false, href: '' },
        openGraph: { exists: false, tags: {}, missing: [] },
        twitter: { exists: false, tags: {}, missing: [] },
      },
      content: {
        headings: {
          h1Count: 0,
          headingStructure: [],
        },
        images: {
          total: 0,
          withAlt: 0,
          withoutAlt: [],
          largeImages: [],
        },
        links: {
          internal: 0,
          external: 0,
          broken: [],
          noFollow: 0,
        },
      },
      performance: {
        loadTime: 0,
        resourceHints: {
          preload: [],
          prefetch: [],
          preconnect: [],
        },
        lazyLoading: {
          implemented: false,
          candidates: [],
        },
      },
      mobile: {
        viewport: false,
        touchTargets: [],
        fontSizes: [],
      },
      schema: {
        exists: false,
        types: [],
        missing: [],
      },
      accessibility: {
        ariaLabels: 0,
        ariaDescriptions: 0,
        missingLabels: [],
        contrastIssues: [],
      },
      keywords: {
        density: {},
        inTitle: [],
        inHeadings: [],
        inMetaDescription: [],
        suggestions: [],
      },
      technical: {
        htmlLang: false,
        charset: false,
        viewportMeta: false,
        doctype: false,
        validAmpHtml: false,
        hreflangTags: [],
      },
    };
  }

  private checkMetaTags(): void {
    // Title
    const title = document.querySelector('title');
    const titleContent = title?.textContent || '';
    this.metrics.meta.title = {
      exists: !!title,
      length: titleContent.length,
      content: titleContent,
      issues: this.validateTitle(titleContent),
    };

    // Description
    const description = document.querySelector('meta[name="description"]');
    const descContent = description?.getAttribute('content') || '';
    this.metrics.meta.description = {
      exists: !!description,
      length: descContent.length,
      content: descContent,
      issues: this.validateDescription(descContent),
    };

    // Open Graph
    this.checkOpenGraphTags();

    // Twitter Cards
    this.checkTwitterCards();
  }

  private validateTitle(title: string): string[] {
    const issues: string[] = [];
    if (!title) {
      issues.push('Missing page title');
    } else {
      if (title.length < this.THRESHOLDS.TITLE_MIN_LENGTH) {
        issues.push(
          `Title too short (${title.length} chars). Minimum ${this.THRESHOLDS.TITLE_MIN_LENGTH} recommended`
        );
      }
      if (title.length > this.THRESHOLDS.TITLE_MAX_LENGTH) {
        issues.push(
          `Title too long (${title.length} chars). Maximum ${this.THRESHOLDS.TITLE_MAX_LENGTH} recommended`
        );
      }
    }
    return issues;
  }

  private checkOpenGraphTags(): void {
    const requiredOGTags = ['title', 'description', 'image', 'url'];
    const ogTags: Record<string, string> = {};
    const missing: string[] = [];

    document.querySelectorAll('meta[property^="og:"]').forEach((tag) => {
      const property = tag.getAttribute('property')?.replace('og:', '');
      const content = tag.getAttribute('content');
      if (property && content) {
        ogTags[property] = content;
      }
    });

    requiredOGTags.forEach((tag) => {
      if (!ogTags[tag]) {
        missing.push(tag);
      }
    });

    this.metrics.meta.openGraph = {
      exists: Object.keys(ogTags).length > 0,
      tags: ogTags,
      missing,
    };
  }

  private analyzeHeadings(): void {
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const structure: Array<{ level: number; text: string; order: number }> = [];
    const issues: string[] = [];

    headings.forEach((heading, index) => {
      const level = parseInt(heading.tagName[1]);
      structure.push({
        level,
        text: heading.textContent?.trim() || '',
        order: index + 1,
      });
    });

    // Check for heading hierarchy issues
    let lastLevel = 0;
    structure.forEach((heading) => {
      if (heading.level - lastLevel > 1) {
        issues.push(
          `Skipped heading level: from h${lastLevel} to h${heading.level}`
        );
      }
      lastLevel = heading.level;
    });

    this.metrics.content.headings = {
      h1Count: document.querySelectorAll('h1').length,
      headingStructure: structure,
      issues,
    };
  }

  private checkImages(): void {
    const images = document.querySelectorAll('img');
    const withoutAlt: Array<{ src: string; location: string }> = [];
    const largeImages: Array<{ src: string; size: number }> = [];
    let withAlt = 0;

    images.forEach((img) => {
      // Check alt text
      if (img.hasAttribute('alt')) {
        withAlt++;
      } else {
        withoutAlt.push({
          src: img.src,
          location: this.getElementPath(img),
        });
      }

      // Check image size
      if (img.complete) {
        const size = this.estimateImageSize(img);
        if (size > this.THRESHOLDS.MAX_IMAGE_SIZE) {
          largeImages.push({ src: img.src, size });
        }
      }
    });

    this.metrics.content.images = {
      total: images.length,
      withAlt,
      withoutAlt,
      largeImages,
    };
  }

  private reportIssues(): void {
    const score = this.generateSEOScore();

    console.group('🔍 SEO Analysis Report');

    console.log('Overall Score:', score.score);

    if (score.penalties.length > 0) {
      console.group('Critical Issues');
      score.penalties.forEach((penalty) => {
        console.log(`${penalty.reason} (-${penalty.points} points)`);
      });
      console.groupEnd();
    }

    console.group('Improvements');
    score.improvements.forEach((improvement) => {
      console.log('•', improvement);
    });
    console.groupEnd();

    // Log detailed metrics
    console.group('Detailed Metrics');
    console.log('Meta Tags:', this.metrics.meta);
    console.log('Content Structure:', this.metrics.content);
    console.log('Schema Markup:', this.metrics.schema);
    console.log('Accessibility:', this.metrics.accessibility);
    console.log('Keywords:', this.metrics.keywords);
    console.log('Technical SEO:', this.metrics.technical);
    console.groupEnd();

    console.groupEnd();

    // Track issues
    this.analytics.track('seoAnalysis', {
      timestamp: new Date().toISOString(),
      url: window.location.href,
      score: score.score,
      penalties: score.penalties,
      metrics: this.metrics,
    });
  }

  private getElementPath(element: Element): string {
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
      current = current.parentElement as Element;
    }

    return path.join(' > ');
  }

  private estimateImageSize(img: HTMLImageElement): number {
    // Rough estimation based on dimensions and pixel depth
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    return width * height * 4; // Assuming 4 bytes per pixel (32-bit color)
  }

  private validateDescription(description: string): string[] {
    const issues: string[] = [];
    if (!description) {
      issues.push('Missing meta description');
    } else {
      if (description.length < this.THRESHOLDS.DESC_MIN_LENGTH) {
        issues.push(
          `Description too short (${description.length} chars). Minimum ${this.THRESHOLDS.DESC_MIN_LENGTH} recommended`
        );
      }
      if (description.length > this.THRESHOLDS.DESC_MAX_LENGTH) {
        issues.push(
          `Description too long (${description.length} chars). Maximum ${this.THRESHOLDS.DESC_MAX_LENGTH} recommended`
        );
      }
    }
    return issues;
  }

  private checkTwitterCards(): void {
    const requiredTwitterTags = ['card', 'title', 'description', 'image'];
    const twitterTags: Record<string, string> = {};
    const missing: string[] = [];

    document.querySelectorAll('meta[name^="twitter:"]').forEach((tag) => {
      const name = tag.getAttribute('name')?.replace('twitter:', '');
      const content = tag.getAttribute('content');
      if (name && content) {
        twitterTags[name] = content;
      }
    });

    requiredTwitterTags.forEach((tag) => {
      if (!twitterTags[tag]) {
        missing.push(tag);
      }
    });

    this.metrics.meta.twitter = {
      exists: Object.keys(twitterTags).length > 0,
      tags: twitterTags,
      missing,
    };
  }

  private analyzeLinks(): void {
    const links = document.querySelectorAll('a');
    const internal: string[] = [];
    const external: string[] = [];
    const broken: Array<{ href: string; text: string }> = [];
    let noFollow = 0;

    links.forEach((link) => {
      const href = link.href;
      const rel = link.getAttribute('rel');

      if (rel?.includes('nofollow')) {
        noFollow++;
      }

      if (href) {
        try {
          const url = new URL(href);
          if (url.hostname === window.location.hostname) {
            internal.push(href);
          } else {
            external.push(href);
          }
        } catch {
          broken.push({ href, text: link.textContent?.trim() || '' });
        }
      } else if (link.hasAttribute('href')) {
        broken.push({
          href: link.getAttribute('href') || '',
          text: link.textContent?.trim() || '',
        });
      }
    });

    this.metrics.content.links = {
      internal: internal.length,
      external: external.length,
      broken,
      noFollow,
      issues:
        broken.length > 0 ? [`Found ${broken.length} broken links`] : undefined,
    };
  }

  private checkPerformance(): void {
    // Check resource hints
    const hints = {
      preload: Array.from(
        document.querySelectorAll<HTMLLinkElement>('link[rel="preload"]')
      ).map((el) => el.href),
      prefetch: Array.from(
        document.querySelectorAll<HTMLLinkElement>('link[rel="prefetch"]')
      ).map((el) => el.href),
      preconnect: Array.from(
        document.querySelectorAll<HTMLLinkElement>('link[rel="preconnect"]')
      ).map((el) => el.href),
    };

    // Check lazy loading
    const lazyLoadable = document.querySelectorAll('img, iframe');
    const lazyLoaded = document.querySelectorAll(
      'img[loading="lazy"], iframe[loading="lazy"]'
    );
    const candidates = Array.from(lazyLoadable)
      .filter((el) => !el.hasAttribute('loading'))
      .map((el) => this.getElementPath(el));

    this.metrics.performance = {
      loadTime: performance.now(),
      resourceHints: {
        ...hints,
        missing: this.suggestResourceHints(),
      },
      lazyLoading: {
        implemented: lazyLoaded.length > 0,
        candidates,
      },
    };
  }

  private suggestResourceHints(): string[] {
    const suggestions: string[] = [];
    const criticalResources = [
      ...Array.from(
        document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')
      ).map((el) => el.href),
      ...Array.from(
        document.querySelectorAll<HTMLScriptElement>('script[src]')
      ).map((el) => el.src),
    ];

    if (
      criticalResources.length > 0 &&
      !document.querySelector('link[rel="preload"]')
    ) {
      suggestions.push('Consider preloading critical CSS/JS resources');
    }

    return suggestions;
  }

  private analyzeMobileOptimization(): void {
    // Check viewport
    const viewport = document.querySelector('meta[name="viewport"]');

    // Check touch targets
    const smallTouchTargets: Array<{
      element: string;
      size: number;
      location: string;
    }> = [];
    document
      .querySelectorAll('a, button, input, select, textarea')
      .forEach((el) => {
        const rect = el.getBoundingClientRect();
        const size = Math.min(rect.width, rect.height);
        if (size < this.THRESHOLDS.MIN_TOUCH_TARGET) {
          smallTouchTargets.push({
            element: this.getElementPath(el),
            size,
            location: `${Math.round(rect.left)},${Math.round(rect.top)}`,
          });
        }
      });

    // Check font sizes
    const fontSizes = new Map<number, number>();
    document.querySelectorAll('*').forEach((el) => {
      const fontSize = parseInt(window.getComputedStyle(el).fontSize);
      fontSizes.set(fontSize, (fontSizes.get(fontSize) || 0) + 1);
    });

    this.metrics.mobile = {
      viewport: !!viewport,
      touchTargets: smallTouchTargets,
      fontSizes: Array.from(fontSizes.entries()).map(([size, elements]) => ({
        size,
        elements,
      })),
    };
  }

  private analyzeSchemaMarkup(): void {
    const schemas = document.querySelectorAll(
      'script[type="application/ld+json"]'
    );
    const types: string[] = [];
    const issues: string[] = [];

    schemas.forEach((schema) => {
      try {
        const data = JSON.parse(schema.textContent || '');
        if (data['@type']) {
          types.push(data['@type']);
        }
      } catch (error) {
        issues.push('Invalid JSON-LD schema markup');
      }
    });

    const recommendedSchemas = [
      'Organization',
      'WebSite',
      'Article',
      'BreadcrumbList',
    ];
    const missing = recommendedSchemas.filter((type) => !types.includes(type));

    this.metrics.schema = {
      exists: schemas.length > 0,
      types,
      missing,
      issues,
    };
  }

  private analyzeAccessibility(): void {
    const elements = document.querySelectorAll('*');
    const missingLabels: string[] = [];
    const contrastIssues: Array<{
      element: string;
      ratio: number;
      required: number;
    }> = [];

    elements.forEach((element) => {
      // Check for interactive elements without labels
      if (element.matches('button, input, select, textarea')) {
        const hasLabel =
          element.hasAttribute('aria-label') ||
          element.hasAttribute('aria-labelledby') ||
          element.hasAttribute('title');
        if (!hasLabel) {
          missingLabels.push(this.getElementPath(element));
        }
      }

      // Check color contrast
      if (element.textContent?.trim()) {
        const style = window.getComputedStyle(element);
        const ratio = this.calculateContrastRatio(
          style.color,
          style.backgroundColor
        );
        const required = this.getRequiredContrastRatio(style.fontSize);
        if (ratio < required) {
          contrastIssues.push({
            element: this.getElementPath(element),
            ratio,
            required,
          });
        }
      }
    });

    this.metrics.accessibility = {
      ariaLabels: document.querySelectorAll('[aria-label]').length,
      ariaDescriptions: document.querySelectorAll('[aria-describedby]').length,
      missingLabels,
      contrastIssues,
    };
  }

  private analyzeKeywords(): void {
    const text = document.body.textContent || '';
    const words = text.toLowerCase().match(/\b\w+\b/g) || [];
    const wordCount = words.length;

    // Calculate keyword density
    const density: Record<string, number> = {};
    words.forEach((word) => {
      if (word.length > 3) {
        // Ignore short words
        density[word] = (density[word] || 0) + 1;
      }
    });

    // Convert to percentages and sort
    Object.keys(density).forEach((word) => {
      density[word] = (density[word] / wordCount) * 100;
    });

    const title = document.title.toLowerCase();
    const description =
      document
        .querySelector('meta[name="description"]')
        ?.getAttribute('content')
        ?.toLowerCase() || '';
    const headings = Array.from(document.querySelectorAll('h1, h2, h3')).map(
      (h) => h.textContent?.toLowerCase() || ''
    );

    this.metrics.keywords = {
      density,
      inTitle: Object.keys(density).filter((word) => title.includes(word)),
      inHeadings: Object.keys(density).filter((word) =>
        headings.some((h) => h.includes(word))
      ),
      inMetaDescription: Object.keys(density).filter((word) =>
        description.includes(word)
      ),
      suggestions: this.generateKeywordSuggestions(density),
    };
  }

  private analyzeTechnicalSEO(): void {
    const html = document.documentElement;

    this.metrics.technical = {
      htmlLang: html.hasAttribute('lang'),
      charset: !!document.charset,
      viewportMeta: !!document.querySelector('meta[name="viewport"]'),
      doctype: !!document.doctype,
      validAmpHtml: document.querySelector('html[amp]') !== null,
      hreflangTags: Array.from(
        document.querySelectorAll('link[rel="alternate"][hreflang]')
      ).map((tag) => ({
        lang: tag.getAttribute('hreflang') || '',
        url: tag.getAttribute('href') || '',
      })),
    };
  }

  private generateSEOScore(): SEOScore {
    let score = 100;
    const penalties: Array<{ reason: string; points: number }> = [];

    // Meta tags
    if (!this.metrics.meta.title.exists) {
      penalties.push({ reason: 'Missing title tag', points: 10 });
    }
    if (!this.metrics.meta.description.exists) {
      penalties.push({ reason: 'Missing meta description', points: 5 });
    }

    // Content
    if (this.metrics.content.headings.h1Count === 0) {
      penalties.push({ reason: 'Missing H1 heading', points: 8 });
    }
    if (this.metrics.content.headings.h1Count > 1) {
      penalties.push({ reason: 'Multiple H1 headings', points: 5 });
    }

    // Images
    const missingAltRatio =
      this.metrics.content.images.withoutAlt.length /
      this.metrics.content.images.total;
    if (missingAltRatio > 0.2) {
      penalties.push({
        reason: 'High percentage of images missing alt text',
        points: Math.round(missingAltRatio * 10),
      });
    }

    // Links
    if (this.metrics.content.links.broken.length > 0) {
      penalties.push({
        reason: 'Broken links detected',
        points: this.metrics.content.links.broken.length * 2,
      });
    }

    // Schema
    if (!this.metrics.schema?.exists) {
      penalties.push({ reason: 'Missing schema markup', points: 5 });
    }

    // Technical
    if (!this.metrics.technical.htmlLang) {
      penalties.push({ reason: 'Missing HTML lang attribute', points: 3 });
    }

    // Calculate final score
    const totalPenalty = penalties.reduce((sum, p) => sum + p.points, 0);
    score = Math.max(0, score - totalPenalty);

    return {
      score,
      penalties,
      improvements: this.generateImprovements(penalties),
    };
  }

  private generateImprovements(
    penalties: Array<{ reason: string; points: number }>
  ): string[] {
    const improvements: string[] = [];

    penalties.forEach(({ reason }) => {
      switch (reason) {
        case 'Missing title tag':
          improvements.push(
            'Add a descriptive title tag between 50-60 characters'
          );
          break;
        case 'Missing meta description':
          improvements.push(
            'Add a compelling meta description between 120-155 characters'
          );
          break;
        case 'Missing H1 heading':
          improvements.push(
            'Add a single H1 heading that clearly describes the page content'
          );
          break;
        // Add more specific improvements based on penalties
      }
    });

    return improvements;
  }

  private calculateContrastRatio(
    foreground: string,
    background: string
  ): number {
    // Convert colors to relative luminance and calculate ratio
    const getLuminance = (color: string): number => {
      // Implementation of color luminance calculation
      return 1; // Placeholder
    };

    const fg = getLuminance(foreground);
    const bg = getLuminance(background);

    return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
  }

  private getRequiredContrastRatio(fontSize: string): number {
    const size = parseFloat(fontSize);
    return size >= 18 || (size >= 14 && fontSize.includes('bold')) ? 3 : 4.5;
  }

  private generateKeywordSuggestions(
    density: Record<string, number>
  ): string[] {
    const suggestions: string[] = [];
    const sortedKeywords = Object.entries(density)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);

    // Check title keyword usage
    const titleWords = document.title.toLowerCase().split(/\W+/);
    const missingTitleKeywords = sortedKeywords
      .filter(([word]) => !titleWords.includes(word))
      .slice(0, 3);

    if (missingTitleKeywords.length > 0) {
      suggestions.push(
        `Consider adding high-frequency keywords to title: ${missingTitleKeywords
          .map(([word]) => word)
          .join(', ')}`
      );
    }

    // Check meta description keyword usage
    const metaDesc = document
      .querySelector('meta[name="description"]')
      ?.getAttribute('content')
      ?.toLowerCase();
    const missingDescKeywords = sortedKeywords
      .filter(([word]) => !metaDesc?.includes(word))
      .slice(0, 3);

    if (missingDescKeywords.length > 0) {
      suggestions.push(
        `Consider adding high-frequency keywords to meta description: ${missingDescKeywords
          .map(([word]) => word)
          .join(', ')}`
      );
    }

    // Check heading keyword usage
    const headingText = Array.from(document.querySelectorAll('h1, h2, h3'))
      .map((el) => el.textContent?.toLowerCase() || '')
      .join(' ');
    const missingHeadingKeywords = sortedKeywords
      .filter(([word]) => !headingText.includes(word))
      .slice(0, 3);

    if (missingHeadingKeywords.length > 0) {
      suggestions.push(
        `Consider using these keywords in headings: ${missingHeadingKeywords
          .map(([word]) => word)
          .join(', ')}`
      );
    }

    // Check keyword density
    const lowDensityKeywords = sortedKeywords
      .filter(([, density]) => density < 0.1) // Less than 0.1%
      .slice(0, 3);

    if (lowDensityKeywords.length > 0) {
      suggestions.push(
        `Consider increasing usage of these keywords: ${lowDensityKeywords
          .map(([word]) => word)
          .join(', ')}`
      );
    }

    // Check for long-tail keyword opportunities
    const phrases = this.extractPhrases(document.body.textContent || '');
    const potentialLongTail = phrases
      .filter((phrase) => phrase.split(/\W+/).length >= 3)
      .slice(0, 3);

    if (potentialLongTail.length > 0) {
      suggestions.push(
        `Consider optimizing for these long-tail phrases: ${potentialLongTail.join(
          ', '
        )}`
      );
    }

    return suggestions;
  }

  private extractPhrases(text: string): string[] {
    const phrases = text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .reduce((acc: string[], word, i, arr) => {
        if (i < arr.length - 2) {
          acc.push(`${word} ${arr[i + 1]} ${arr[i + 2]}`);
        }
        return acc;
      }, []);

    // Return unique phrases sorted by frequency
    return Array.from(new Set(phrases));
  }

  public getMetrics(): EnhancedSEOMetrics {
    // Run a final analysis if needed
    if (!this.isAnalyzing) {
      this.analyzePage();
    }
    return this.metrics;
  }
}
