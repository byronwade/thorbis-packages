import { BaseTracker } from './base';

interface SearchMetrics {
  searches: Array<{
    id: string;
    query: string;
    timestamp: string;
    results: {
      total: number;
      displayed: number;
      clicked: number;
      position?: number;
    };
    performance: {
      responseTime: number;
      renderTime: number;
      totalTime: number;
    };
    filters?: Record<string, any>;
    refinements?: Array<{
      type: string;
      value: string;
      timestamp: string;
    }>;
    context: {
      location: string;
      previousQuery?: string;
      sessionSearches: number;
      device: string;
      source: 'searchbox' | 'suggestions' | 'filters' | 'voice';
    };
    user: {
      isLoggedIn: boolean;
      searchCount: number;
      lastSearchTime?: string;
    };
  }>;
  summary: {
    totalSearches: number;
    uniqueSearches: number;
    averageResults: number;
    noResultsQueries: string[];
    popularQueries: Array<{
      query: string;
      count: number;
      clickThrough: number;
    }>;
    searchPatterns: Array<{
      pattern: string[];
      frequency: number;
    }>;
    performance: {
      averageResponseTime: number;
      averageResultCount: number;
      searchesByHour: Record<string, number>;
    };
    engagement: {
      clickThroughRate: number;
      refinementRate: number;
      abandonmentRate: number;
      averageSessionSearches: number;
    };
  };
}

export class SearchTracker extends BaseTracker {
  private metrics: SearchMetrics = {
    searches: [],
    summary: {
      totalSearches: 0,
      uniqueSearches: 0,
      averageResults: 0,
      noResultsQueries: [],
      popularQueries: [],
      searchPatterns: [],
      performance: {
        averageResponseTime: 0,
        averageResultCount: 0,
        searchesByHour: {},
      },
      engagement: {
        clickThroughRate: 0,
        refinementRate: 0,
        abandonmentRate: 0,
        averageSessionSearches: 0,
      },
    },
  };

  private searchStartTime: number = 0;
  private uniqueQueries: Set<string> = new Set();
  private sessionSearches: number = 0;
  private readonly DEBOUNCE_TIME = 300; // ms
  private debounceTimer: NodeJS.Timeout | null = null;
  private observer: MutationObserver | null = null;
  private searchBoxes: WeakSet<HTMLElement> = new WeakSet();

  async init(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      // Set up search tracking with proper cleanup
      this.setupSearchTracking();
      this.observeSearchElements();

      this.log('Search tracker initialized');
    } catch (error) {
      console.warn('Error initializing search tracker:', error);
    }
  }

  getData(): any {
    return {
      searches: this.metrics.searches,
      summary: {
        ...this.metrics.summary,
        totalSearches: this.metrics.searches.length,
        uniqueSearches: this.uniqueQueries.size,
        averageResults: this.calculateAverageResults(),
        popularQueries: this.getPopularQueries(),
        searchPatterns: this.analyzeSearchPatterns(),
        performance: {
          ...this.metrics.summary.performance,
          averageResponseTime: this.calculateAverageResponseTime(),
          searchesByHour: this.getSearchesByHour(),
        },
        engagement: {
          ...this.metrics.summary.engagement,
          clickThroughRate: this.calculateClickThroughRate(),
          refinementRate: this.calculateRefinementRate(),
          abandonmentRate: this.calculateAbandonmentRate(),
          averageSessionSearches: this.sessionSearches,
        },
      },
    };
  }

  private setupSearchTracking(): void {
    // Track form submissions
    document.addEventListener('submit', this.handleSearchSubmit, {
      passive: true,
    });

    // Track search input interactions
    document.addEventListener('input', this.handleSearchInput, {
      passive: true,
    });

    // Track search result clicks
    document.addEventListener('click', this.handleResultClick, {
      passive: true,
    });
  }

  private observeSearchElements(): void {
    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            this.detectAndTrackSearchElements(node);
          }
        });
      });
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Initial detection
    this.detectAndTrackSearchElements(document.body);
  }

  private detectAndTrackSearchElements(root: HTMLElement): void {
    // Find search inputs
    root
      .querySelectorAll(
        'input[type="search"], input[aria-label*="search" i], input[placeholder*="search" i]'
      )
      .forEach((element) => {
        if (element instanceof HTMLElement && !this.searchBoxes.has(element)) {
          this.searchBoxes.add(element);
          this.setupSearchElementTracking(element);
        }
      });
  }

  private setupSearchElementTracking(element: HTMLElement): void {
    // Track focus/blur for engagement metrics
    element.addEventListener('focus', () => this.handleSearchFocus(element), {
      passive: true,
    });
    element.addEventListener('blur', () => this.handleSearchBlur(element), {
      passive: true,
    });
  }

  private handleSearchSubmit = (event: Event): void => {
    const form = event.target as HTMLFormElement;
    if (!this.isSearchForm(form)) return;

    const searchInput = form.querySelector(
      'input[type="search"], input[type="text"]'
    ) as HTMLInputElement;
    if (!searchInput) return;

    const query = searchInput.value.trim();
    if (!query) return;

    this.trackSearch({
      query,
      source: 'searchbox',
      timestamp: new Date().toISOString(),
    });
  };

  private handleSearchInput = (event: Event): void => {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    this.debounceTimer = setTimeout(() => {
      const input = event.target as HTMLInputElement;
      if (!this.isSearchInput(input)) return;

      const query = input.value.trim();
      if (query.length >= 3) {
        this.trackSearch({
          query,
          source: 'suggestions',
          timestamp: new Date().toISOString(),
        });
      }
    }, this.DEBOUNCE_TIME);
  };

  private handleResultClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;
    const resultElement = target.closest('[data-search-result]');
    if (!resultElement) return;

    const resultData = this.getResultData(resultElement);
    if (!resultData) return;

    this.trackResultClick(resultData);
  };

  private handleSearchFocus = (element: HTMLElement): void => {
    this.searchStartTime = Date.now();
  };

  private handleSearchBlur = (element: HTMLElement): void => {
    const duration = Date.now() - this.searchStartTime;
    if (duration < 100) return; // Ignore accidental focus

    this.trackSearchEngagement({
      element: element.id || this.getElementPath(element),
      duration,
      timestamp: new Date().toISOString(),
    });
  };

  private trackSearch(data: {
    query: string;
    source: string;
    timestamp: string;
  }): void {
    const searchId = crypto.randomUUID();
    const startTime = performance.now();

    this.sessionSearches++;
    this.uniqueQueries.add(data.query);

    const searchData = {
      id: searchId,
      query: data.query,
      timestamp: data.timestamp,
      results: {
        total: 0,
        displayed: 0,
        clicked: 0,
      },
      performance: {
        responseTime: 0,
        renderTime: 0,
        totalTime: 0,
      },
      context: {
        location: window.location.pathname,
        previousQuery:
          this.metrics.searches[this.metrics.searches.length - 1]?.query,
        sessionSearches: this.sessionSearches,
        device: this.getDeviceType(),
        source: data.source as
          | 'searchbox'
          | 'suggestions'
          | 'filters'
          | 'voice',
      },
      user: {
        isLoggedIn: this.isUserLoggedIn(),
        searchCount: this.metrics.searches.length + 1,
        lastSearchTime:
          this.metrics.searches[this.metrics.searches.length - 1]?.timestamp,
      },
    };

    // Track performance
    requestAnimationFrame(() => {
      const endTime = performance.now();
      searchData.performance = {
        responseTime: endTime - startTime,
        renderTime: 0, // Will be updated when results render
        totalTime: endTime - startTime,
      };
    });

    this.metrics.searches.push(searchData);

    // Track analytics
    this.analytics.track('search', {
      searchId,
      query: data.query,
      source: data.source,
      timestamp: data.timestamp,
    });
  }

  private trackResultClick(data: any): void {
    const lastSearch = this.metrics.searches[this.metrics.searches.length - 1];
    if (!lastSearch) return;

    lastSearch.results.clicked++;

    this.analytics.track('searchResultClick', {
      searchId: lastSearch.id,
      query: lastSearch.query,
      resultId: data.id,
      position: data.position,
      timestamp: new Date().toISOString(),
    });
  }

  private trackSearchEngagement(data: {
    element: string;
    duration: number;
    timestamp: string;
  }): void {
    this.analytics.track('searchEngagement', data);
  }

  private isSearchForm(form: HTMLFormElement): boolean {
    return (
      form.getAttribute('role') === 'search' ||
      !!form.querySelector('input[type="search"]') ||
      form.getAttribute('aria-label')?.toLowerCase().includes('search') ||
      false
    );
  }

  private isSearchInput(input: HTMLInputElement): boolean {
    return (
      input.type === 'search' ||
      input.getAttribute('aria-label')?.toLowerCase().includes('search') ||
      input.placeholder.toLowerCase().includes('search') ||
      false
    );
  }

  private getResultData(element: Element): any {
    try {
      const data = element.getAttribute('data-search-result');
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  private getElementPath(element: Element): string {
    const path: string[] = [];
    let current = element;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        selector += `#${current.id}`;
      } else if (current.className) {
        selector += `.${current.className.split(' ')[0]}`;
      }
      path.unshift(selector);
      current = current.parentElement as Element;
    }

    return path.join(' > ');
  }

  private calculateAverageResults(): number {
    if (this.metrics.searches.length === 0) return 0;
    const total = this.metrics.searches.reduce(
      (sum, search) => sum + search.results.total,
      0
    );
    return Math.round(total / this.metrics.searches.length);
  }

  private getPopularQueries(): Array<{
    query: string;
    count: number;
    clickThrough: number;
  }> {
    const queries = new Map<string, { count: number; clicks: number }>();

    this.metrics.searches.forEach((search) => {
      const existing = queries.get(search.query) || { count: 0, clicks: 0 };
      queries.set(search.query, {
        count: existing.count + 1,
        clicks: existing.clicks + search.results.clicked,
      });
    });

    return Array.from(queries.entries())
      .map(([query, data]) => ({
        query,
        count: data.count,
        clickThrough: data.clicks / data.count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private analyzeSearchPatterns(): Array<{
    pattern: string[];
    frequency: number;
  }> {
    const patterns: Map<string, number> = new Map();
    const queries = this.metrics.searches.map((s) => s.query);

    // Look for patterns of 2-3 consecutive searches
    for (let size = 2; size <= 3; size++) {
      for (let i = 0; i <= queries.length - size; i++) {
        const pattern = queries.slice(i, i + size);
        const key = pattern.join(' → ');
        patterns.set(key, (patterns.get(key) || 0) + 1);
      }
    }

    return Array.from(patterns.entries())
      .map(([pattern, frequency]) => ({
        pattern: pattern.split(' → '),
        frequency,
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5);
  }

  private calculateAverageResponseTime(): number {
    if (this.metrics.searches.length === 0) return 0;
    const total = this.metrics.searches.reduce(
      (sum, search) => sum + search.performance.responseTime,
      0
    );
    return Math.round(total / this.metrics.searches.length);
  }

  private getSearchesByHour(): Record<string, number> {
    const hours: Record<string, number> = {};
    this.metrics.searches.forEach((search) => {
      const hour = new Date(search.timestamp).getHours();
      hours[hour] = (hours[hour] || 0) + 1;
    });
    return hours;
  }

  private calculateClickThroughRate(): number {
    if (this.metrics.searches.length === 0) return 0;
    const clicks = this.metrics.searches.reduce(
      (sum, search) => sum + search.results.clicked,
      0
    );
    return Math.round((clicks / this.metrics.searches.length) * 100);
  }

  private calculateRefinementRate(): number {
    if (this.metrics.searches.length <= 1) return 0;
    const refinements = this.metrics.searches.filter(
      (search) => search.context.previousQuery
    ).length;
    return Math.round((refinements / (this.metrics.searches.length - 1)) * 100);
  }

  private calculateAbandonmentRate(): number {
    if (this.metrics.searches.length === 0) return 0;
    const abandonedSearches = this.metrics.searches.filter(
      (search) => search.results.clicked === 0
    ).length;
    return Math.round((abandonedSearches / this.metrics.searches.length) * 100);
  }

  private getDeviceType(): string {
    const ua = navigator.userAgent;
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua))
      return 'tablet';
    if (
      /Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(
        ua
      )
    ) {
      return 'mobile';
    }
    return 'desktop';
  }

  private isUserLoggedIn(): boolean {
    // Implement based on your authentication system
    return false;
  }

  cleanup(): void {
    if (this.observer) {
      this.observer.disconnect();
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    document.removeEventListener('submit', this.handleSearchSubmit);
    document.removeEventListener('input', this.handleSearchInput);
    document.removeEventListener('click', this.handleResultClick);
  }
}
