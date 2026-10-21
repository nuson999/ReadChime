import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: { rollupOptions: {
    input: { dashboard: 'dashboard.html', popup: 'popup.html' },
    output: { manualChunks(id) {
      const normalized = id.replaceAll('\\', '/');
      if (/node_modules\/(react|react-dom|scheduler)\//.test(normalized)) return 'react-vendor';
      if (normalized.includes('/node_modules/recharts/')) return 'charts';
    } },
  } },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
