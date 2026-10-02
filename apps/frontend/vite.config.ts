import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/pxg-historybook/',
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      '/static': 'http://localhost:3001',
    },
  },
});
