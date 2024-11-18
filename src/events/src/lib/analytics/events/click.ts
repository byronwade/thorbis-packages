import { analytics } from '../core';

export function setupClickTracking() {
  if (typeof window === 'undefined') return;

  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    analytics.track('click', {
      element: target.tagName,
      id: target.id,
      class: target.className,
      text: target.textContent,
      path: e
        .composedPath()
        .map((el) => (el as HTMLElement).tagName)
        .join(' > '),
      timestamp: Date.now(),
    });
  });
}
