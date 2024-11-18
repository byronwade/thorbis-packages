import { Thorbis } from './src/components/Thorbis';
import { analytics, trackEvent } from './src/lib/analytics/core';
import type { AnalyticsConfig } from './src/lib/analytics/types';

// Export the main component and functionality
export { Thorbis };
export { analytics, trackEvent };
export type { AnalyticsConfig };

// Create analytics namespace
export const ThorbisAnalytics = {
  Component: Thorbis,
  analytics,
  track: trackEvent,
};

export default ThorbisAnalytics;
