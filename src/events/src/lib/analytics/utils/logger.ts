export const logger = {
  info: (message: string, data?: any) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(
        `%c🔍 Thorbis: ${message}`,
        'background: #2563eb; color: white; padding: 2px 4px; border-radius: 4px;',
        data
      );
    }
  },
  error: (message: string, error?: any) => {
    console.error(
      `%c❌ Thorbis Error: ${message}`,
      'background: #dc2626; color: white; padding: 2px 4px; border-radius: 4px;',
      error
    );
  },
  debug: (message: string, data?: any) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(
        `%c🔧 Thorbis Debug: ${message}`,
        'background: #0891b2; color: white; padding: 2px 4px; border-radius: 4px;',
        data
      );
    }
  },
  warn: (message: string, data?: any) => {
    console.warn(
      `%c⚠️ Thorbis Warning: ${message}`,
      'background: #d97706; color: white; padding: 2px 4px; border-radius: 4px;',
      data
    );
  },
};
