import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseBridgeConfig, readBridgeConfig, renderBridgeAsset } from '../scripts/bridge-config.mjs';

describe('personal Bridge configuration', () => {
  it('requires an explicit local configuration without an author URL fallback', () => {
    expect(() => readBridgeConfig('bridge.config.missing-test.json')).toThrow('Copy bridge.config.example.json');
    expect(() => parseBridgeConfig(JSON.parse(readFileSync('bridge.config.example.json', 'utf8')))).toThrow('Set url');
  });

  it.each([
    null, {}, { url: '' }, { url: '/player.html' },
    { url: 'http://owner.test/player.html' }, { url: 'https://owner.test/' },
    { url: 'https://user:password@owner.test/player.html' },
    { url: 'https://owner.test/player.html?token=secret' },
    { url: 'https://owner.test/player.html#fragment' },
  ])('rejects invalid or credential-bearing configuration %j', value => {
    expect(() => parseBridgeConfig(value)).toThrow();
  });

  it.each(['https://another-user.github.io/my-player/player.html', 'https://bridge.example.org:8443/player.html'])(
    'uses %s consistently in the manifest and content script', url => {
      const config = parseBridgeConfig({ url });
      expect(config).toEqual({ url, origin: new URL(url).origin });
      const manifest = JSON.parse(renderBridgeAsset(readFileSync('public/manifest.json', 'utf8'), config));
      expect(manifest.content_security_policy.extension_pages).toContain(`frame-src ${config.origin};`);
      const content = renderBridgeAsset(readFileSync('public/youtube-controls-v3.js', 'utf8'), config);
      expect(content).toContain(`ancestors[0] !== '${config.origin}'`);
      expect(content).not.toContain('__PLAYER_BRIDGE_ORIGIN__');
      expect(JSON.stringify(manifest)).not.toContain('__PLAYER_BRIDGE_ORIGIN__');
    },
  );
});
