import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.minimum_chrome_version, '140');
assert.deepEqual(manifest.permissions, ['sidePanel']);
assert.deepEqual(manifest.content_scripts[0].matches, ['https://www.youtube.com/*']);
assert.equal(manifest.host_permissions, undefined);
assert.equal(manifest.optional_host_permissions, undefined);
assert.equal(manifest.background.type, 'module');
assert.equal(manifest.content_security_policy.extension_pages, "script-src 'self'; object-src 'self'");
console.log('PASS: Phase 0 source manifest and minimum permissions');

if (existsSync('dist/manifest.json')) {
  assert.deepEqual(JSON.parse(readFileSync('dist/manifest.json', 'utf8')), manifest);
  for (const entry of [manifest.background.service_worker, manifest.side_panel.default_path, ...manifest.content_scripts[0].js]) {
    assert.ok(existsSync(`dist/${entry}`), `Missing built entry: ${entry}`);
  }
  const content = readFileSync('dist/content.js', 'utf8');
  assert.ok(!/^\s*(import|export)\s/m.test(content), 'Content Script must be a classic script');
  console.log('PASS: Built manifest, entry files and Content Script format');
} else {
  console.log('UNVERIFIED: dist is absent; built artifacts have not been checked');
}
