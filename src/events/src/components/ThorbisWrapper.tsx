import React, { Suspense } from 'react';
import type { AnalyticsConfig } from '../lib/analytics/types';

const ThorbisClient = React.lazy(() =>
  import('./Thorbis').then((mod) => ({
    default: () => <mod.Thorbis {...props} />,
  }))
);

export interface ThorbisWrapperProps {
  config?: Partial<AnalyticsConfig>;
  debug?: boolean;
}

export function ThorbisWrapper(props: ThorbisWrapperProps) {
  return (
    <Suspense fallback={null}>
      <ThorbisClient {...props} />
    </Suspense>
  );
}
