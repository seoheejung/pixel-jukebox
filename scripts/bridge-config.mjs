import { readFileSync } from 'node:fs';

export function parseBridgeConfig(value) {
  if (!value || typeof value !== 'object' || typeof value.url !== 'string' || !value.url.trim()) {
    throw new Error('Set url in bridge.config.local.json to your deployed HTTPS Player Bridge URL.');
  }
  let url;
  try { url = new URL(value.url); }
  catch { throw new Error('Bridge url must be an absolute HTTPS URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname === '/') {
    throw new Error('Bridge url must use HTTPS with a page path and no credentials, query or fragment.');
  }
  return { url: url.href, origin: url.origin };
}

export function readBridgeConfig(path = 'bridge.config.local.json') {
  let content;
  try { content = readFileSync(path, 'utf8'); }
  catch { throw new Error('Copy bridge.config.example.json to bridge.config.local.json and set your own deployed Bridge URL before building.'); }
  let value;
  try { value = JSON.parse(content); }
  catch { throw new Error('bridge.config.local.json must contain valid JSON.'); }
  return parseBridgeConfig(value);
}

export function renderBridgeAsset(source, config) {
  const { origin } = parseBridgeConfig(config);
  return source.replaceAll('__PLAYER_BRIDGE_ORIGIN__', origin);
}
