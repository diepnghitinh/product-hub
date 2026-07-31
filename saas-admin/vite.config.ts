import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // 3001 is the tenant app and 3002 is the collab (Hocuspocus) server, so the
    // console gets 3003. Being a separate origin from the tenant app is the
    // point — a workspace user has no URL that loads this bundle.
    port: 3003,
    host: true,
  },
});
