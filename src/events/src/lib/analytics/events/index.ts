export { setupClickTracking } from './click';
export { setupFormTracking } from './form';
export { setupPageTracking, trackPageView } from './page';
export { setupErrorTracking } from './error';

export function setupAllTracking() {
  setupClickTracking();
  setupFormTracking();
  setupPageTracking();
  setupErrorTracking();
}
