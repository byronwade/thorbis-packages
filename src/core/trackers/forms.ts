import { BaseTracker } from './base';

export class FormsTracker extends BaseTracker {
  constructor(analytics: any, debug: boolean = true) {
    super(analytics, debug);
  }

  init(): void {
    if (typeof window === 'undefined') return;
    this.log('Forms tracker initialized');
  }

  cleanup(): void {
    // Cleanup implementation
  }
}
