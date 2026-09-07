import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { attach, connectBrowser, evaluate, until } from './cdp.mjs';

const browser = await connectBrowser();
try {
  assert.ok(Number(browser.version.match(/\/(\d+)/)?.[1]) >= 140);
  console.log(`PASS: minimum Chrome version (${browser.version})`);
  const { id } = await browser.send('Extensions.loadUnpacked', { path: resolve('dist') });
  console.log('PASS: unpacked extension loaded by Chrome');
  const { targetId: managerId } = await browser.send('Target.createTarget', { url: 'chrome://extensions/' });
  const manager = await attach(browser, managerId);
  await until(() => evaluate(browser, manager, "Boolean(document.querySelector('extensions-manager')?.shadowRoot?.querySelector('extensions-toolbar')?.shadowRoot?.querySelector('#devMode'))"), 'Developer Mode control');
  const developerMode = await evaluate(browser, manager, `(() => {
    const toggle = document.querySelector('extensions-manager').shadowRoot.querySelector('extensions-toolbar').shadowRoot.querySelector('#devMode');
    if (!toggle.checked) toggle.click();
    return toggle.checked;
  })()`, { userGesture: true });
  assert.equal(developerMode, true);
  console.log('PASS: Chrome extensions Developer Mode enabled');
  await browser.send('Target.closeTarget', { targetId: managerId });
  const { targetId } = await browser.send('Target.createTarget', { url: 'https://www.youtube.com/' });
  const youtube = await attach(browser, targetId);
  await until(() => evaluate(browser, youtube, "location.origin === 'https://www.youtube.com' && document.readyState === 'complete'"), 'YouTube loaded');
  const page = await evaluate(browser, youtube, '({url: location.href, title: document.title})');
  assert.ok(!page.title.includes('ERR_'), 'YouTube network error');
  const { targetInfos: tabs } = await browser.send('Target.getTargets', { filter: [{ type: 'tab' }] });
  const tab = tabs.find((target) => target.url === page.url);
  assert.ok(tab, 'YouTube tab target is available');
  await browser.send('Extensions.triggerAction', { id, targetId: tab.targetId });
  const panelTarget = await until(async () => {
    const { targetInfos } = await browser.send('Target.getTargets');
    return targetInfos.find((target) => target.url === `chrome-extension://${id}/sidepanel.html`);
  }, 'actual Side Panel target');
  const panel = await attach(browser, panelTarget.targetId);
  await until(() => evaluate(browser, panel, "document.querySelector('#connection-status')?.textContent.includes('연결됨')"), 'Content Script → Worker → Side Panel');
  await evaluate(browser, panel, "document.querySelector('#recheck').click()");
  assert.equal(await evaluate(browser, panel, "document.querySelector('#recheck').disabled"), false);
  console.log('PASS: actual Side Panel, YouTube Content Script and runtime connection probe');
  const permissions = await evaluate(browser, panel, 'chrome.permissions.getAll()');
  assert.deepEqual(permissions.permissions, ['sidePanel', 'storage']);
  console.log('PASS: required permissions contain sidePanel and storage');
  mkdirSync('.chrome-test', { recursive: true });
  try {
    const { data } = await browser.send('Page.captureScreenshot', {}, panel);
    writeFileSync('.chrome-test/phase0.png', Buffer.from(data, 'base64'));
    console.log('PASS: Side Panel screenshot saved');
  } catch {
    console.log('UNVERIFIED: Side Panel screenshot is unavailable in this Chrome mode');
  }
  writeFileSync('.chrome-test/phase0.json', JSON.stringify({ browser: browser.version, extensionId: id, developerMode, youtubeTitle: page.title, sidePanel: true, messaging: true, permissions }, null, 2));
} finally {
  try { await browser.send('Browser.close'); } catch { }
  browser.close();
}
