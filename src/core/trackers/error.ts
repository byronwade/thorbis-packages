import { BaseTracker } from './base';

interface ErrorData {
  message: string;
  stack?: string;
  type: string;
  url: string;
  line?: number;
  column?: number;
  timestamp: string;
  context?: {
    componentStack?: string;
    breadcrumbs?: string[];
    state?: any;
    environment?: {
      url: string;
      userAgent: string;
      viewport: {
        width: number;
        height: number;
      };
    };
  };
}

export class ErrorTracker extends BaseTracker {
  private errors: ErrorData[] = [];
  private readonly MAX_ERRORS = 1000; // Prevent memory leaks
  private readonly MAX_STACK_LENGTH = 50; // Limit stack trace length
  private readonly ERROR_DEBOUNCE = 1000; // Prevent error spam
  private lastErrorTime: number = 0;
  private errorCounts: Map<string, number> = new Map();

  async init(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      // Use passive event listeners for better performance
      const options = { passive: true };

      // Global error handling
      window.addEventListener('error', this.handleError, options);
      window.addEventListener(
        'unhandledrejection',
        this.handleRejection,
        options
      );

      // Framework-specific error handling
      this.setupFrameworkErrorHandling();

      this.log('Error tracker initialized');
    } catch (error) {
      console.warn('Error initializing error tracker:', error);
    }
  }

  getData(): any {
    return {
      errors: this.errors.map(this.sanitizeError),
      summary: {
        totalErrors: this.errors.length,
        types: this.getErrorTypes(),
        mostFrequent: this.getMostFrequentErrors(),
        errorRates: this.calculateErrorRates(),
        trends: this.analyzeErrorTrends(),
      },
    };
  }

  cleanup(): void {
    try {
      window.removeEventListener('error', this.handleError);
      window.removeEventListener('unhandledrejection', this.handleRejection);
      this.cleanupFrameworkHandlers();
    } catch (error) {
      console.warn('Error cleaning up error tracker:', error);
    }
  }

  private handleError = (event: ErrorEvent): void => {
    try {
      // Debounce errors
      const now = Date.now();
      if (now - this.lastErrorTime < this.ERROR_DEBOUNCE) return;
      this.lastErrorTime = now;

      // Check error limit
      if (this.errors.length >= this.MAX_ERRORS) {
        this.errors.shift(); // Remove oldest error
      }

      const errorData = this.createErrorData({
        message: event.message,
        stack: event.error?.stack,
        type: 'uncaught',
        url: event.filename,
        line: event.lineno,
        column: event.colno,
      });

      this.trackError(errorData);
    } catch (error) {
      console.warn('Error handling error event:', error);
    }
  };

  private handleRejection = (event: PromiseRejectionEvent): void => {
    try {
      const errorData = this.createErrorData({
        message: event.reason?.message || String(event.reason),
        stack: event.reason?.stack,
        type: 'unhandledRejection',
        url: window.location.href,
      });

      this.trackError(errorData);
    } catch (error) {
      console.warn('Error handling rejection:', error);
    }
  };

  private createErrorData(data: Partial<ErrorData>): ErrorData {
    return {
      message: this.sanitizeErrorMessage(data.message || 'Unknown error'),
      stack: this.sanitizeStackTrace(data.stack),
      type: data.type || 'unknown',
      url: data.url || window.location.href,
      line: data.line,
      column: data.column,
      timestamp: new Date().toISOString(),
      context: {
        componentStack: this.getReactComponentStack(),
        breadcrumbs: this.getErrorBreadcrumbs(),
        state: this.getApplicationState(),
        environment: {
          url: window.location.href,
          userAgent: navigator.userAgent,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
          },
        },
      },
    };
  }

  private trackError(errorData: ErrorData): void {
    // Update error counts
    const errorKey = `${errorData.type}:${errorData.message}`;
    this.errorCounts.set(errorKey, (this.errorCounts.get(errorKey) || 0) + 1);

    // Add error to collection
    this.errors.push(errorData);

    // Track in analytics
    this.analytics.track('error', this.sanitizeError(errorData));
  }

  private setupFrameworkErrorHandling(): void {
    // React Error Boundary detection
    if (typeof window !== 'undefined' && (window as any).React) {
      try {
        const originalError = console.error;
        console.error = (...args: any[]) => {
          const errorMessage = args.join(' ');
          if (errorMessage.includes('React error boundary')) {
            this.trackError(
              this.createErrorData({
                message: errorMessage,
                type: 'react_boundary',
              })
            );
          }
          originalError.apply(console, args);
        };
      } catch (error) {
        console.warn('Error setting up React error handling:', error);
      }
    }

    // Vue error handler
    if (typeof window !== 'undefined' && (window as any).Vue) {
      try {
        (window as any).Vue.config.errorHandler = (
          err: Error,
          vm: any,
          info: string
        ) => {
          this.trackError(
            this.createErrorData({
              message: err.message,
              stack: err.stack,
              type: 'vue',
              context: { info },
            })
          );
        };
      } catch (error) {
        console.warn('Error setting up Vue error handling:', error);
      }
    }
  }

  private cleanupFrameworkHandlers(): void {
    // Restore original console.error
    if (typeof window !== 'undefined' && (window as any).React) {
      try {
        console.error = console.error;
      } catch (error) {
        console.warn('Error cleaning up React error handling:', error);
      }
    }

    // Remove Vue error handler
    if (typeof window !== 'undefined' && (window as any).Vue) {
      try {
        (window as any).Vue.config.errorHandler = null;
      } catch (error) {
        console.warn('Error cleaning up Vue error handling:', error);
      }
    }
  }

  private getReactComponentStack(): string | undefined {
    try {
      const reactFiber = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
      if (!reactFiber?.getFiberRoots) return undefined;

      const fiberRoots = Array.from(reactFiber.getFiberRoots());
      return fiberRoots
        .map((root: any) => {
          try {
            return root.current?.alternate?.stateNode?.render?.toString();
          } catch {
            return undefined;
          }
        })
        .filter(Boolean)
        .join('\n');
    } catch (error) {
      console.warn('Error getting React component stack:', error);
      return undefined;
    }
  }

  private getErrorBreadcrumbs(): string[] {
    return this.errors
      .slice(-5)
      .map((error) => `${error.type}: ${error.message}`);
  }

  private getApplicationState(): any {
    try {
      return {
        url: window.location.href,
        localStorage: this.safelyGetStorage(localStorage),
        sessionStorage: this.safelyGetStorage(sessionStorage),
        redux: this.getReduxState(),
        react: this.getReactState(),
      };
    } catch (error) {
      console.warn('Error getting application state:', error);
      return {};
    }
  }

  private safelyGetStorage(storage: Storage): Record<string, any> {
    try {
      return Object.keys(storage).reduce((acc, key) => {
        try {
          acc[key] = storage.getItem(key);
        } catch {
          // Ignore errors reading individual items
        }
        return acc;
      }, {} as Record<string, any>);
    } catch {
      return {};
    }
  }

  private getReduxState(): any {
    try {
      return (window as any).__REDUX_DEVTOOLS_EXTENSION__?.getLatestState();
    } catch {
      return undefined;
    }
  }

  private getReactState(): any {
    try {
      return (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__?.getLatestState();
    } catch {
      return undefined;
    }
  }

  private sanitizeError(error: ErrorData): ErrorData {
    return {
      ...error,
      message: this.sanitizeErrorMessage(error.message),
      stack: this.sanitizeStackTrace(error.stack),
      context: {
        ...error.context,
        state: this.sanitizeState(error.context?.state),
      },
    };
  }

  private sanitizeErrorMessage(message: string): string {
    return message.slice(0, 500); // Limit message length
  }

  private sanitizeStackTrace(stack?: string): string | undefined {
    if (!stack) return undefined;
    return stack.split('\n').slice(0, this.MAX_STACK_LENGTH).join('\n');
  }

  private sanitizeState(state: any): any {
    try {
      const seen = new WeakSet();
      return JSON.parse(
        JSON.stringify(state, (key, value) => {
          if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) return '[Circular]';
            seen.add(value);
          }
          return value;
        })
      );
    } catch {
      return '[Unable to serialize state]';
    }
  }

  private getErrorTypes(): { [key: string]: number } {
    return this.errors.reduce((types, error) => {
      types[error.type] = (types[error.type] || 0) + 1;
      return types;
    }, {} as { [key: string]: number });
  }

  private getMostFrequentErrors(): ErrorData[] {
    return Array.from(this.errorCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([key]) => {
        const [type, message] = key.split(':');
        return this.errors.find(
          (error) => error.type === type && error.message === message
        )!;
      });
  }

  private calculateErrorRates(): {
    errorsPerMinute: number;
    errorsPerHour: number;
  } {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const oneMinuteAgo = now - 60000;

    const hourlyErrors = this.errors.filter(
      (error) => new Date(error.timestamp).getTime() > oneHourAgo
    ).length;

    const minuteErrors = this.errors.filter(
      (error) => new Date(error.timestamp).getTime() > oneMinuteAgo
    ).length;

    return {
      errorsPerMinute: minuteErrors,
      errorsPerHour: hourlyErrors,
    };
  }

  private analyzeErrorTrends(): {
    increasing: boolean;
    rate: number;
    topErrors: string[];
  } {
    const recentErrors = this.errors
      .slice(-100)
      .map((error) => new Date(error.timestamp).getTime());

    const errorRate =
      recentErrors.length /
      ((recentErrors[recentErrors.length - 1] - recentErrors[0]) / 1000);

    return {
      increasing: errorRate > 0.1, // More than 1 error per 10 seconds
      rate: errorRate,
      topErrors: Array.from(this.errorCounts.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([key]) => key),
    };
  }
}
