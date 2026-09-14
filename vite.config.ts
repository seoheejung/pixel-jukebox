import { defineConfig } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readBridgeConfig, renderBridgeAsset } from './scripts/bridge-config.mjs';

export default defineConfig(() => {
  const bridge = readBridgeConfig();
  return {
    base: './',
    envDir: false,
    define: { __PLAYER_BRIDGE_URL__: JSON.stringify(bridge.url) },
    plugins: [{
      name: 'player-bridge-config',
      writeBundle(options) {
        for (const file of ['manifest.json', 'youtube-controls-v3.js']) {
          const source = readFileSync(resolve('public', file), 'utf8');
          writeFileSync(resolve(options.dir ?? 'dist', file), renderBridgeAsset(source, bridge));
        }
      },
    }],
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
  };
});
