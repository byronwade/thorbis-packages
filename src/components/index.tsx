import { useEffect, useRef } from 'react';
import { ThorbisAnalytics } from '../core/analytics';

export const Thorbis = () => {
  const analyticsRef = useRef<ThorbisAnalytics | null>(null);

  useEffect(() => {
		if (analyticsRef.current) return;

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
						heatmaps: true,
						seo: true,
						project: true,
						performance: true,
						demographics: true,
						error: true,
						media: true,
						search: true,
					},
					batchConfig: {
						maxBatchSize: 10,
						flushInterval: 5000,
					},
				});

				analyticsRef.current = analytics;
				await analytics.init();
			} catch (error) {
				console.error("❌ Thorbis Error: Analytics initialization failed", error);
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

  return (
		<div className="image-container">
			<img src="https://picsum.photos/800/400" alt="Description" width={800} height={400} loading="eager" style={{ maxWidth: "100%", height: "auto" }} />
		</div>
  );
};
