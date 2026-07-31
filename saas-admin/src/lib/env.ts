export const env = {
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:3000/v1',
  /**
   * The tenant-facing app. Only used to build "open workspace" links; empty
   * simply hides them, so the console never depends on it being deployed.
   */
  appUrl: (import.meta.env.VITE_APP_URL || '').replace(/\/+$/, ''),
};
