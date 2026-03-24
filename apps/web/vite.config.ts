/// <reference types="vitest/config" />
// https://vite.dev/config/
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// If you want to configure Vitest later, you can do it in the `test` block below.
// For now this is a minimal, Storybook-agnostic config.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Everything starting with /api goes to the backend
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/api'),
      },
      '/health': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:4000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  test: {
    // Basic Vitest config; tweak or remove if you're not using Vitest yet
    environment: 'jsdom',
    globals: true,
  },
});
