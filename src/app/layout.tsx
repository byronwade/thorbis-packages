import { useEffect } from 'react';
import { SEOTracker } from '@/core/trackers/seo';
import { ThorbisAnalytics } from '@/core/analytics';
import { ReactNode } from 'react';
import { AnalyticsConfig } from '@/core/types';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  useEffect(() => {
    let analytics: ThorbisAnalytics | null = null;

    const initAnalytics = async () => {
      try {
        console.group('🚀 Initializing Analytics');

        const config: AnalyticsConfig = {
          sessionId: crypto.randomUUID(),
          debug: true,
          options: {
            pageViews: true,
            navigation: true,
            engagement: true,
            seo: true,
            project: true,
            performance: true,
          },
        };

        analytics = new ThorbisAnalytics(config);
        await analytics.init();

        console.log('✅ Analytics initialization complete');
        console.groupEnd();
      } catch (error) {
        console.error('❌ Analytics initialization failed:', error);
        console.groupEnd();
      }
    };

    // Initialize analytics
    initAnalytics();

    // Cleanup
    return () => {
      if (analytics) {
        console.group('🧹 Cleanup');
        analytics.cleanup();
        console.groupEnd();
      }
    };
  }, []);

  return <>{children}</>;
}
