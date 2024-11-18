export interface AnalyticsConfig {
  appId: string;
  version: string;
  debug?: boolean;
}

export interface EventData {
  type: string;
  timestamp: number;
  data: Record<string, any>;
  sessionId: string;
}

export interface UserSession {
  id: string;
  startTime: number;
  lastActive: number;
  events: EventData[];
}
