import { BaseTracker } from './base';

interface ErrorData {
  message: string;
  stack?: string;
  type: string;
  url: string;
  line?: number;
  column?: number;
  timestamp: string;
}

export class ErrorTracker extends BaseTracker {
  private errors: ErrorData[] = [];

  init() {
    if (typeof window === 'undefined') return;

    // Track uncaught errors
    window.addEventListener('error', this.handleError);
    // Track unhandled promise rejections
    window.addEventListener('unhandledrejection', this.handleRejection);

    this.log('Error tracker initialized');
  }

  private handleError = (event: ErrorEvent) => {
    const errorData: ErrorData = {
      message: event.message,
      stack: event.error?.stack,
      type: 'uncaught',
      url: event.filename,
      line: event.lineno,
      column: event.colno,
      timestamp: new Date().toISOString(),
    };

    this.errors.push(errorData);
    this.analytics.track('error', errorData);
  };

  private handleRejection = (event: PromiseRejectionEvent) => {
    const errorData: ErrorData = {
      message: event.reason?.message || String(event.reason),
      stack: event.reason?.stack,
      type: 'unhandledRejection',
      url: window.location.href,
      timestamp: new Date().toISOString(),
    };

    this.errors.push(errorData);
    this.analytics.track('error', errorData);
  };

  cleanup() {
    window.removeEventListener('error', this.handleError);
    window.removeEventListener('unhandledrejection', this.handleRejection);

    // Send final error report if there are any errors
    if (this.errors.length > 0) {
      this.analytics.track('errorReport', {
        errors: this.errors,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
