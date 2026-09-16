import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { connectBrowser, connectTarget, evaluate, until } from './cdp.mjs';

const executable = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const root = resolve('player-bridge');
const output = resolve('.chrome-test');
const profile = resolve(output, `web-demo-profile-${process.pid}`);
const debuggingPort = 16000 + (process.pid % 30000);
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
]);

assert.ok(existsSync(executable), 'Chrome executable is unavailable');
for (const file of ['index.html', 'demo.css', 'demo.js', 'player.html', 'player.css', 'player.js']) {
  assert.ok(existsSync(resolve(root, file)), `Missing Pages asset: ${file}`);
}
await mkdir(profile, { recursive: true });

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    const requested = pathname === '/' ? '/index.html' : pathname;
    const file = resolve(root, `.${requested}`);
    if (file !== root && !file.startsWith(`${root}${sep}`)) throw new Error('invalid path');
    const body = await readFile(file);
    response.writeHead(200, {
      'content-type': mime.get(extname(file)) ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    response.end(body);
  } catch {
    if (!response.headersSent) response.writeHead(404);
    response.end('not found');
  }
});
await new Promise((resolveReady, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolveReady);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}`;

for (const path of ['/', '/demo.css', '/demo.js', '/player.html', '/player.css', '/player.js']) {
  const response = await fetch(`${origin}${path}`);
  assert.equal(response.status, 200, `${path} must be served without a 404`);
}

const child = spawn(executable, [
  '--headless=new',
  `--remote-debugging-port=${debuggingPort}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-background-networking',
  `--user-data-dir=${profile}`,
  'about:blank',
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let chromeError = '';
child.stderr.setEncoding('utf8');
child.stderr.on('data', (chunk) => { chromeError = `${chromeError}${chunk}`.slice(-4000); });

let browser;
const pages = [];
const browserErrors = [];
const failedAssets = [];

async function page(width, height) {
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
  const targets = await fetch(`http://127.0.0.1:${debuggingPort}/json/list`).then((response) => response.json());
  const target = targets.find((item) => item.id === targetId);
  assert.ok(target?.webSocketDebuggerUrl, 'Page target debugger is unavailable');
  const connection = await connectTarget(target.webSocketDebuggerUrl);
  pages.push(connection);
  await connection.send('Page.enable');
  await connection.send('Runtime.enable');
  await connection.send('Log.enable');
  await connection.send('Network.enable');
  await connection.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  connection.onEvent((message) => {
    if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') browserErrors.push('console.error');
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') browserErrors.push(message.params.entry.text);
    if (message.method === 'Network.responseReceived' && message.params.response.url.startsWith(origin) && message.params.response.status >= 400) {
      failedAssets.push(`${message.params.response.status} ${message.params.response.url}`);
    }
    if (message.method === 'Network.loadingFailed' && message.params.type !== 'Document') failedAssets.push(message.params.errorText);
  });
  return connection;
}

try {
  const debuggerEndpoint = `http://127.0.0.1:${debuggingPort}`;
  await until(async () => {
    if (child.exitCode !== null) throw new Error(`Chrome exited early (${child.exitCode}): ${chromeError}`);
    try {
      return await fetch(`${debuggerEndpoint}/json/version`, { signal: AbortSignal.timeout(500) }).then((response) => response.ok);
    } catch {
      return false;
    }
  }, 'Chrome debugging endpoint', 12000);
  browser = await connectBrowser(debuggerEndpoint);

  const desktop = await page(1280, 900);
  await desktop.send('Page.navigate', { url: `${origin}/` });
  await until(() => evaluate(desktop, undefined, "document.readyState === 'complete' && document.querySelector('#screen-state')?.textContent === 'READY'"), 'desktop demo ready');
  assert.equal(await evaluate(desktop, undefined, 'document.documentElement.scrollWidth <= innerWidth'), true, 'Desktop page must not overflow horizontally');
  assert.equal(await evaluate(desktop, undefined, "window.PixelJukeboxDemo.hasCompleted(sessionStorage)"), false, 'First session must be ready');
  await evaluate(desktop, undefined, "document.querySelector('#demo').scrollIntoView({ block: 'start' }); document.querySelector('#demo-button').click()", { userGesture: true });
  await until(() => evaluate(desktop, undefined, "!document.querySelector('#results-panel').hidden && document.querySelectorAll('.result-list li').length === 8"), 'desktop demo results', 10000);
  assert.equal(await evaluate(desktop, undefined, "window.PixelJukeboxDemo.claimDemo(sessionStorage)"), false, 'Second run in one session must be rejected');
  const { data: desktopShot } = await desktop.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(resolve(output, 'web-demo-desktop.png'), desktopShot, 'base64');

  await desktop.send('Page.reload');
  await until(() => evaluate(desktop, undefined, "document.readyState === 'complete' && !document.querySelector('#results-panel').hidden"), 'same-session reload');
  assert.equal(await evaluate(desktop, undefined, "document.querySelector('#demo-button').disabled && document.querySelector('#session-message').textContent.includes('이미 Demo를 실행')"), true, 'Same session must restore the completed state');

  const mobile = await page(390, 844);
  await mobile.send('Page.navigate', { url: `${origin}/` });
  await until(() => evaluate(mobile, undefined, "document.readyState === 'complete' && document.querySelector('#screen-state')?.textContent === 'READY'"), 'mobile demo ready');
  assert.equal(await evaluate(mobile, undefined, "!window.PixelJukeboxDemo.hasCompleted(sessionStorage)"), true, 'A new tab session must allow a new run');
  assert.equal(await evaluate(mobile, undefined, 'document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth'), true, '390px page must not overflow horizontally');
  await evaluate(mobile, undefined, "document.querySelector('#demo').scrollIntoView({ block: 'start' }); document.querySelector('#demo-button').click()", { userGesture: true });
  await until(() => evaluate(mobile, undefined, "!document.querySelector('#results-panel').hidden && document.querySelectorAll('.result-list li').length === 8"), 'mobile demo results', 10000);
  const { data: mobileShot } = await mobile.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(resolve(output, 'web-demo-mobile-390.png'), mobileShot, 'base64');

  assert.deepEqual(failedAssets, [], `Static assets failed: ${failedAssets.join(', ')}`);
  assert.deepEqual(browserErrors, [], `Browser errors: ${browserErrors.join(', ')}`);
  console.log('PASS: Web Demo renders at 1280px and 390px without horizontal overflow');
  console.log('PASS: first run, same-session limit, and new-session run');
  console.log('PASS: eight documented E2E results, no local asset 404, no console error');
  console.log('PASS: existing player.html, player.css, and player.js remain available');
  console.log(`Screenshots: ${resolve(output, 'web-demo-{desktop,mobile-390}.png')}`);
} finally {
  for (const connection of pages) connection.close();
  if (browser) {
    try {
      await Promise.race([
        browser.send('Browser.close'),
        new Promise((resolveTimeout) => setTimeout(resolveTimeout, 1500)),
      ]);
    } catch { }
    browser.close();
  }
  if (child.exitCode === null) child.kill();
  server.closeAllConnections();
  await new Promise((resolveClosed) => server.close(resolveClosed));
}
