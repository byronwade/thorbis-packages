import type { EventData } from "./events";
import type { UserProfile } from "./user";

export interface AnalyticsDBSchema {
	events: {
		key: number;
		value: EventData;
		autoIncrement?: true;
		indexes: { "by-timestamp": string };
	};
	profiles: {
		key: string;
		value: UserProfile;
		indexes: { "by-lastSeen": string };
	};
}
