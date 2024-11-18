export const storage = {
  async init() {
    if (typeof window !== 'undefined') {
      console.log('🔍 Storage initialized');
    }
    return true;
  },

  async storeBehaviorData(event: any) {
    if (typeof window !== 'undefined') {
      try {
        const events = JSON.parse(
          localStorage.getItem('thorbis_events') || '[]'
        );
        events.push(event);
        localStorage.setItem('thorbis_events', JSON.stringify(events));
        console.log('🔍 Event stored:', event);
      } catch (error) {
        console.error('Failed to store event:', error);
      }
    }
  },
};
