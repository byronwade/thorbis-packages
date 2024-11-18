import { analytics } from '../core';

export function setupErrorTracking() {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (e) => {
    analytics.track('error', {
      message: e.message,
      filename: e.filename,
      lineNumber: e.lineno,
      columnNumber: e.colno,
      stack: e.error?.stack,
      timestamp: Date.now(),
    });
  });

  window.addEventListener('unhandledrejection', (e) => {
    analytics.track('unhandled_rejection', {
      message: e.reason?.message || String(e.reason),
      stack: e.reason?.stack,
      timestamp: Date.now(),
    });
  });
}
