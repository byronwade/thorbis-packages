import { analytics } from '../core';

export function setupPageTracking() {
  if (typeof window === 'undefined') return;

  // Track initial page view
  trackPageView();

  // Track route changes
  const pushState = history.pushState;
  history.pushState = (...args) => {
    pushState.apply(history, args);
    trackPageView();
  };

  window.addEventListener('popstate', () => trackPageView());
}

export function trackPageView() {
  analytics.track('page_view', {
    title: document.title,
    url: window.location.href,
    path: window.location.pathname,
    referrer: document.referrer,
    timestamp: Date.now(),
  });
}
