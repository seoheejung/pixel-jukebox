import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { attach, connectBrowser, evaluate, until } from './cdp.mjs';

const browser = await connectBrowser();
try {
  const loaded = await browser.send('Extensions.loadUnpacked', { path: resolve('dist') });
  await browser.send('Extensions.uninstall', { id: loaded.id });
  const { id } = await browser.send('Extensions.loadUnpacked', { path: resolve('dist') });
  const { targetId } = await browser.send('Target.createTarget', { url: 'https://www.youtube.com/' });
  const youtube = await attach(browser, targetId);
  const contexts = [];
  await browser.send('Runtime.enable', {}, youtube);
  const stop = browser.onEvent((event) => {
    if (event.sessionId === youtube && event.method === 'Runtime.executionContextCreated') contexts.push(event.params.context);
  });
  await until(() => evaluate(browser, youtube, "location.origin === 'https://www.youtube.com' && document.readyState === 'complete'"), 'YouTube page');
  const { targetInfos: tabs } = await browser.send('Target.getTargets', { filter: [{ type: 'tab' }] });
  const tab = tabs.find((item) => item.url.startsWith('https://www.youtube.com'));
  await browser.send('Extensions.triggerAction', { id, targetId: tab.targetId });
  const panelTarget = await until(async () => (await browser.send('Target.getTargets')).targetInfos.find((item) => item.url === `chrome-extension://${id}/sidepanel.html`), 'Side Panel');
  const panel = await attach(browser, panelTarget.targetId);
  await until(() => evaluate(browser, panel, "document.querySelector('#ai-status')?.textContent === 'OPENAI PERMISSION NOT GRANTED'"), 'AI opt-in state');
  const permissions = await evaluate(browser, panel, 'chrome.permissions.getAll()');
  assert.ok(!permissions.origins.some((origin) => origin.includes('api.openai.com')), 'OpenAI permission must remain optional');

  const workerTarget = (await browser.send('Target.getTargets')).targetInfos.find((item) => item.type === 'service_worker' && item.url.endsWith('/background.js'));
  const worker = await attach(browser, workerTarget.targetId);
  const workerRead = await evaluate(browser, worker, "(async () => { await chrome.storage.local.set({openaiApiKey: 'phase3-probe'}); await chrome.storage.session.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'}); await chrome.storage.local.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'}); return (await chrome.storage.local.get(['openaiApiKey'])).openaiApiKey === 'phase3-probe'; })()");
  assert.equal(workerRead, true);

  await new Promise((resolve) => setTimeout(resolve, 500));
  stop();
  const chromeContexts = [];
  for (const context of contexts) {
    try {
      if (await evaluate(browser, youtube, "typeof chrome !== 'undefined' && typeof chrome.storage !== 'undefined'", { contextId: context.id })) chromeContexts.push(context);
    } catch { }
  }
  assert.ok(chromeContexts.length > 0, 'Content Script execution context was not found');
  let localBlocked = false;
  let sessionBlocked = false;
  for (const context of chromeContexts) {
    try { await evaluate(browser, youtube, "chrome.storage.local.get(['openaiApiKey'])", { contextId: context.id }); }
    catch { localBlocked = true; }
    try { await evaluate(browser, youtube, "chrome.storage.session.get(['openaiApiKey'])", { contextId: context.id }); }
    catch { sessionBlocked = true; }
  }
  assert.equal(localBlocked, true);
  assert.equal(sessionBlocked, true);
  await evaluate(browser, worker, "(async () => { await chrome.storage.local.remove(['openaiApiKey']); await chrome.storage.session.set({openaiApiKey: 'phase3-session-probe'}); })()");
  await browser.send('Browser.close');
  browser.close();
  await until(async () => {
    try { await fetch('http://127.0.0.1:9223/json/version'); return false; } catch { return true; }
  }, 'Chrome shutdown', 10000);
  const child = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--remote-debugging-port=9223', '--enable-unsafe-extension-debugging', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    `--user-data-dir=${resolve('.chrome-test/profile')}`, 'about:blank',
  ], { detached: true, windowsHide: true, stdio: 'ignore' });
  child.unref();
  await until(async () => {
    try { await fetch('http://127.0.0.1:9223/json/version'); return true; } catch { return false; }
  }, 'Chrome restart', 10000);
  const restarted = await connectBrowser();
  const reloaded = await restarted.send('Extensions.loadUnpacked', { path: resolve('dist') });
  const restartedWorkerTarget = await until(async () => (await restarted.send('Target.getTargets')).targetInfos.find((item) => item.type === 'service_worker' && item.url.endsWith('/background.js')), 'restarted Service Worker');
  const restartedWorker = await attach(restarted, restartedWorkerTarget.targetId);
  await restarted.send('Runtime.enable', {}, restartedWorker);
  const sessionAfterRestart = await evaluate(restarted, restartedWorker, "(async () => typeof chrome === 'undefined' ? 'NO_CHROME' : (await chrome.storage.session.get(['openaiApiKey'])).openaiApiKey)()");
  assert.equal(sessionAfterRestart, undefined);
  await restarted.send('Extensions.uninstall', { id: reloaded.id });
  await restarted.send('Browser.close');
  restarted.close();
  console.log(`PASS: Phase 3 Chrome verification (${browser.version})`);
} finally {
  try { browser.close(); } catch { }
}
