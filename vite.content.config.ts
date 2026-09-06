import { defineConfig } from 'vite';

// Content Script의 독립 실행 번들
export default defineConfig({
  envDir: false,
  publicDir: false,
  build: {
    target: 'chrome140',
    emptyOutDir: false,
    lib: {
      entry: 'src/content/index.ts',
      name: 'PixelJukeboxContent',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
  },
});
