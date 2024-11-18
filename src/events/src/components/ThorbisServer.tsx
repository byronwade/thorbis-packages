import React from 'react';
import type { AnalyticsConfig } from '../lib/analytics/types';

export interface ThorbisServerProps {
  config?: Partial<AnalyticsConfig>;
  debug?: boolean;
}

export function ThorbisServer(props: ThorbisServerProps) {
  // This is our server component that dynamically imports the client component
  if (typeof window === 'undefined') {
    return null;
  }

  // Dynamically import the client component
  const ClientComponent = React.lazy(() =>
    import('./Thorbis').then((mod) => ({ default: mod.Thorbis }))
  );

  return (
    <React.Suspense fallback={null}>
      <ClientComponent {...props} />
    </React.Suspense>
  );
}
