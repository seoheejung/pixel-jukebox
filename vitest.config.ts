import { defineConfig } from 'vitest/config';

export default defineConfig({
  envDir: false,
  define: { __PLAYER_BRIDGE_URL__: JSON.stringify('https://bridge.test/player.html') },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    clearMocks: true,
  },
});
