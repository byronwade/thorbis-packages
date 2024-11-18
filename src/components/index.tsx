import { useEffect, useRef } from 'react';
import { ThorbisAnalytics } from '../core/analytics';

export const Thorbis = () => {
  const analyticsRef = useRef<ThorbisAnalytics | null>(null);

  useEffect(() => {
    if (analyticsRef.current) {
      return;
    }

    const initAnalytics = async () => {
      try {
        const analytics = new ThorbisAnalytics({
          sessionId: Math.random().toString(36).slice(2),
          debug: true,
          options: {
            pageViews: true,
            navigation: true,
            engagement: true,
            forms: true,
          },
        });

        analyticsRef.current = analytics;
        await analytics.init();
      } catch (error) {
        console.error(
          '❌ Thorbis Error: Analytics initialization failed',
          error
        );
      }
    };

    initAnalytics();

    return () => {
      if (analyticsRef.current) {
        analyticsRef.current.cleanup();
        analyticsRef.current = null;
      }
    };
  }, []);

  return null;
};
