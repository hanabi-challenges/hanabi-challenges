import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  base: '/tracker/',
  resolve: {
    alias: {
      '@tracker/types': resolve(__dirname, '../types/dist/index.js'),
    },
  },
  server: {
    proxy: {
      '/tracker/api': {
        target: 'http://localhost:4001',
        changeOrigin: true,
      },
      '/tracker/health': {
        target: 'http://localhost:4001',
        changeOrigin: true,
      },
    },
  },
});
