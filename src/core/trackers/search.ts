import { BaseTracker } from './base';
import type { SearchData } from './types';

export class SearchTracker extends BaseTracker {
  private searchHistory: SearchData[] = [];
  private currentQuery: string = '';

  init() {
    if (typeof window === 'undefined') return;

    // Listen for search form submissions
    document.addEventListener('submit', this.handleSearchSubmit);
    // Listen for search result clicks
    document.addEventListener('click', this.handleSearchResultClick);

    this.log('Search tracker initialized');
  }

  private handleSearchSubmit = (event: Event) => {
    const form = event.target as HTMLFormElement;
    if (!this.isSearchForm(form)) return;

    const searchInput = form.querySelector(
      'input[type="search"]'
    ) as HTMLInputElement;
    if (!searchInput) return;

    const query = searchInput.value.trim();
    this.currentQuery = query;

    this.analytics.track('search', {
      query,
      timestamp: new Date().toISOString(),
    });
  };

  private handleSearchResultClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const resultItem = target.closest('[data-search-result]');

    if (resultItem && this.currentQuery) {
      const position = resultItem.getAttribute('data-position');
      const itemId = resultItem.getAttribute('data-item-id');

      this.analytics.track('searchResultClick', {
        query: this.currentQuery,
        position: parseInt(position || '0'),
        itemId,
        timestamp: new Date().toISOString(),
      });
    }
  };

  private isSearchForm(element: HTMLElement): boolean {
    return (
      element.tagName === 'FORM' &&
      (element.getAttribute('role') === 'search' ||
        element.querySelector('input[type="search"]') !== null)
    );
  }

  cleanup() {
    document.removeEventListener('submit', this.handleSearchSubmit);
    document.removeEventListener('click', this.handleSearchResultClick);
  }
}
