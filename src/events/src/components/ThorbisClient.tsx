'use client';

import React, { useEffect } from 'react';
import { analytics } from '../lib/analytics/core';
import { logger } from '../lib/analytics/utils/logger';
import type { AnalyticsConfig } from '../lib/analytics/types';

export interface ThorbisClientProps {
  config?: Partial<AnalyticsConfig>;
  debug?: boolean;
}

export function ThorbisClient(props: ThorbisClientProps) {
  useEffect(() => {
    const initializeAnalytics = async () => {
      try {
        await analytics.init(props.config);
        logger.info('Analytics initialized', props.config);
      } catch (error) {
        logger.error('Failed to initialize analytics', error);
      }
    };

    initializeAnalytics();
  }, [props.config]);

  return null;
}

export default ThorbisClient;
