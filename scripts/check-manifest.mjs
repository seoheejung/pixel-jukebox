import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.minimum_chrome_version, '140');
assert.deepEqual(manifest.permissions, ['storage']);
assert.deepEqual(manifest.content_scripts, [{ matches: ['https://www.youtube.com/embed/*'], js: ['youtube-controls.js'], all_frames: true, run_at: 'document_idle' }]);
assert.equal(manifest.host_permissions, undefined);
assert.deepEqual(manifest.optional_host_permissions, ['https://api.openai.com/*', 'https://www.youtube.com/*']);
assert.equal(manifest.background.type, 'module');
assert.equal(manifest.action.default_popup, 'sidepanel.html');
const expectedIcons = {
  16: 'icons/icon-16.png',
  32: 'icons/icon-32.png',
  48: 'icons/icon-48.png',
  128: 'icons/icon-128.png',
};
assert.deepEqual(manifest.icons, expectedIcons);
assert.deepEqual(manifest.action.default_icon, { 16: expectedIcons[16], 32: expectedIcons[32] });
for (const [size, icon] of Object.entries(expectedIcons)) {
  const data = readFileSync(`public/${icon}`);
  assert.deepEqual([...data.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(data.readUInt32BE(16), Number(size));
  assert.equal(data.readUInt32BE(20), Number(size));
}
assert.equal(manifest.side_panel, undefined);
assert.equal(manifest.content_security_policy.extension_pages, "script-src 'self'; object-src 'self'; frame-src https://seoheejung.github.io; img-src 'self' https://i.ytimg.com data:");
console.log('PASS: source manifest and minimum permissions');

if (existsSync('dist/manifest.json')) {
  assert.deepEqual(JSON.parse(readFileSync('dist/manifest.json', 'utf8')), manifest);
  for (const entry of [manifest.background.service_worker, manifest.action.default_popup, 'youtube-controls.js', ...Object.values(manifest.icons)]) {
    assert.ok(existsSync(`dist/${entry}`), `Missing built entry: ${entry}`);
  }
  console.log('PASS: Built manifest and entry files');
} else {
  console.log('UNVERIFIED: dist is absent; built artifacts have not been checked');
}
