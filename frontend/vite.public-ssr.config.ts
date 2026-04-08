import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    ssr: 'src/ssr/publicRouteRenderer.ts',
    outDir: 'dist-ssr',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'public-route-renderer.mjs',
      },
    },
  },
});
