import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.minimum_chrome_version, '140');
assert.deepEqual(manifest.permissions, ['sidePanel', 'storage']);
assert.equal(manifest.content_scripts, undefined);
assert.equal(manifest.host_permissions, undefined);
assert.deepEqual(manifest.optional_host_permissions, ['https://api.openai.com/*']);
assert.equal(manifest.background.type, 'module');
assert.equal(manifest.content_security_policy.extension_pages, "script-src 'self'; object-src 'self'; frame-src https://seoheejung.github.io; img-src 'self' https://i.ytimg.com data:");
console.log('PASS: source manifest and minimum permissions');

if (existsSync('dist/manifest.json')) {
  assert.deepEqual(JSON.parse(readFileSync('dist/manifest.json', 'utf8')), manifest);
  for (const entry of [manifest.background.service_worker, manifest.side_panel.default_path]) {
    assert.ok(existsSync(`dist/${entry}`), `Missing built entry: ${entry}`);
  }
  console.log('PASS: Built manifest and entry files');
} else {
  console.log('UNVERIFIED: dist is absent; built artifacts have not been checked');
}
