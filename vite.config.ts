import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  envDir: false,
  build: {
    target: 'chrome140',
    rollupOptions: {
      input: {
        sidepanel: 'sidepanel.html',
        background: 'src/background/index.ts',
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
});
