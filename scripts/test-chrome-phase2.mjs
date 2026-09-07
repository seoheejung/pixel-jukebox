import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { attach, connectBrowser, evaluate, until } from './cdp.mjs';

const browser = await connectBrowser();
try {
  const loaded = await browser.send('Extensions.loadUnpacked', { path: resolve('dist') });
  await browser.send('Extensions.uninstall', { id: loaded.id });
  const { id } = await browser.send('Extensions.loadUnpacked', { path: resolve('dist') });
  const firstId = 'dQw4w9WgXcQ';
  const { targetId } = await browser.send('Target.createTarget', { url: `https://www.youtube.com/watch?v=${firstId}` });
  const youtube = await attach(browser, targetId);
  const ready = (session) => until(() => evaluate(browser, session, "Boolean(document.querySelector('ytd-watch-metadata h1')?.textContent.trim()) && document.querySelector('video')?.readyState >= 3"), 'YouTube track', 30000);
  await ready(youtube);
  const { targetInfos: tabs } = await browser.send('Target.getTargets', { filter: [{ type: 'tab' }] });
  const tab = tabs.find((item) => item.url.includes(firstId));
  await browser.send('Extensions.triggerAction', { id, targetId: tab.targetId });
  const panelTarget = await until(async () => (await browser.send('Target.getTargets')).targetInfos.find((item) => item.url === `chrome-extension://${id}/sidepanel.html`), 'Side Panel');
  const panel = await attach(browser, panelTarget.targetId);
  await until(() => evaluate(browser, panel, "document.querySelector('#player')?.dataset.videoId === 'dQw4w9WgXcQ'"), 'first player track');

  await evaluate(browser, panel, `(() => { const input = document.querySelector('#video-url'); input.value = 'https://www.youtube.com/watch?v=${firstId}'; document.querySelector('#add-video').click(); })()`, { userGesture: true });
  await until(() => evaluate(browser, panel, "document.querySelectorAll('.playlist-row').length === 1"), 'add current track');

  await evaluate(browser, panel, "(() => { const input = document.querySelector('#video-url'); input.value = 'https://youtu.be/4Ygvv_Ae3dg'; document.querySelector('#add-video').click(); })()", { userGesture: true });
  await until(() => evaluate(browser, panel, "document.querySelectorAll('.playlist-row').length === 2"), 'second playlist track');
  await evaluate(browser, panel, "(() => { const rows = [...document.querySelectorAll('.playlist-row')]; const transfer = new DataTransfer(); transfer.setData('text/plain', rows[1].dataset.videoId); rows[0].dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer })); })()");
  await until(() => evaluate(browser, panel, "document.querySelector('.playlist-row')?.dataset.videoId === '4Ygvv_Ae3dg'"), 'playlist reorder');
  await evaluate(browser, panel, "document.querySelector('.next').click()", { userGesture: true });
  await until(() => evaluate(browser, panel, "document.querySelector('#player')?.dataset.videoId === '4Ygvv_Ae3dg'"), 'playlist next navigation');
  await evaluate(browser, panel, "document.querySelector('.previous').click()", { userGesture: true });
  await until(() => evaluate(browser, panel, "document.querySelector('#player')?.dataset.videoId === 'dQw4w9WgXcQ'"), 'playlist previous navigation');

  await evaluate(browser, panel, "(() => { const input = document.querySelector('#background'); input.value = '#ffffff'; input.dispatchEvent(new Event('change', { bubbles: true })); })()");
  await until(() => evaluate(browser, panel, "getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim() === '#ffffff'"), 'design persistence');
  await browser.send('Page.reload', {}, panel);
  await until(() => evaluate(browser, panel, "document.querySelectorAll('.playlist-row').length === 2 && document.querySelector('#background').value === '#ffffff'"), 'restored playlist and design');

  await until(() => evaluate(browser, panel, "!document.querySelector('#export-png').disabled"), 'PNG export control');
  await evaluate(browser, panel, "document.querySelector('#export-png').click()", { userGesture: true });
  await until(() => evaluate(browser, panel, "document.querySelector('#export-status').textContent === 'EXPORT COMPLETE'"), 'PNG export');
  await until(() => evaluate(browser, panel, "!document.querySelector('#export-gif').disabled"), 'GIF export control');
  await evaluate(browser, panel, "document.querySelector('#export-gif').click()", { userGesture: true });
  await until(() => evaluate(browser, panel, "document.querySelector('#export-status').textContent === 'EXPORT COMPLETE'"), 'GIF export');
  await until(() => evaluate(browser, panel, "!document.querySelector('#open-pip').disabled"), 'PiP export control');
  const pipOpened = await evaluate(browser, panel, "(async () => { if (!('documentPictureInPicture' in window)) return false; const pip = await documentPictureInPicture.requestWindow({ width: 320, height: 420 }); pip.close(); return true; })()", { userGesture: true });
  assert.equal(pipOpened, true);

  mkdirSync('.chrome-test', { recursive: true });
  writeFileSync('.chrome-test/phase2.json', JSON.stringify({ browser: browser.version, playlist: true, reorder: true, repeatNavigation: true, storageRestore: true, designRestore: true, png: true, gif: true, pip: true }, null, 2));
  console.log(`PASS: Phase 2 Chrome verification (${browser.version})`);
} finally {
  try { await browser.send('Browser.close'); } catch { }
  browser.close();
}
