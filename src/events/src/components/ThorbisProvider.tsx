import type { AnalyticsConfig } from '../lib/analytics/types';
import { ThorbisWrapper } from './ThorbisWrapper';

export interface ThorbisProviderProps {
  config?: Partial<AnalyticsConfig>;
  debug?: boolean;
}

export function ThorbisProvider(props: ThorbisProviderProps) {
  // Only render on client side
  if (typeof window === 'undefined') return null;

  return <ThorbisWrapper {...props} />;
}
