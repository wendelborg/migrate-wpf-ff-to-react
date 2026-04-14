import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-webview',
    lib: {
      entry: 'src/mount.ts',
      formats: ['iife'],
      name: 'AppPages',
      fileName: () => 'pages.js',
    },
  },
});
