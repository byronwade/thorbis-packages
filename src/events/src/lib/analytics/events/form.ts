import { analytics } from '../core';

export function setupFormTracking() {
  if (typeof window === 'undefined') return;

  document.addEventListener('submit', (e) => {
    const form = e.target as HTMLFormElement;
    analytics.track('form_submit', {
      formId: form.id,
      formAction: form.action,
      formMethod: form.method,
      timestamp: Date.now(),
    });
  });
}
