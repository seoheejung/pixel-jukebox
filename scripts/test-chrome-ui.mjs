import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { connectBrowser, connectTarget, evaluate, until } from './cdp.mjs';
import { readBridgeConfig } from './bridge-config.mjs';

const executable = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const root = resolve('dist');
const output = resolve('.chrome-test');
const profile = resolve(output, `ui-profile-${process.pid}`);
const debuggingPort = 12000 + (process.pid % 30000);
const bridgeUrl = readBridgeConfig().url;
const bridgeFixture = `<!doctype html><meta charset="utf-8"><script>
let parentOrigin = '';
let videoId = '';
addEventListener('message', (event) => {
  const message = event.data;
  if (message?.source !== 'pixel-jukebox-sidepanel' || message.version !== 1) return;
  if (message.type === 'init') {
    parentOrigin = event.origin;
    parent.postMessage({ source: 'pixel-jukebox-player-bridge', version: 1, type: 'ready' }, parentOrigin);
    return;
  }
  if (!parentOrigin || event.origin !== parentOrigin) return;
  if (message.type === 'load') {
    videoId = message.videoId;
    parent.postMessage({ source: 'pixel-jukebox-player-bridge', version: 1, type: 'state', videoId, state: message.autoplay ? 'playing' : 'paused' }, parentOrigin);
  }
  if (message.type === 'command') {
    parent.postMessage({ source: 'pixel-jukebox-player-bridge', version: 1, type: 'state', videoId, state: message.action === 'play' ? 'playing' : 'paused' }, parentOrigin);
  }
});
<\/script>`;
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.svg', 'image/svg+xml'], ['.png', 'image/png'],
]);

assert.ok(existsSync(executable), 'Chrome executable is unavailable');
assert.ok(existsSync(resolve(root, 'sidepanel.html')), 'Run npm run build before the Chrome UI smoke test');
await mkdir(profile, { recursive: true });

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    const requested = pathname === '/' ? '/sidepanel.html' : pathname;
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
const panelUrl = `http://127.0.0.1:${address.port}/sidepanel.html`;

const child = spawn(executable, [
  '--headless=new', `--remote-debugging-port=${debuggingPort}`, '--enable-unsafe-extension-debugging', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking',
  `--user-data-dir=${profile}`, 'about:blank',
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let chromeError = '';
child.stderr.setEncoding('utf8');
child.stderr.on('data', (chunk) => { chromeError = `${chromeError}${chunk}`.slice(-4000); });

let browser;
let rootBrowser;
try {
  const debuggerEndpoint = `http://127.0.0.1:${debuggingPort}`;
  await until(async () => {
    if (child.exitCode !== null) throw new Error(`Chrome exited early (${child.exitCode}): ${chromeError}`);
    try {
      return await fetch(`${debuggerEndpoint}/json/version`, { signal: AbortSignal.timeout(500) }).then((r) => r.ok);
    }
    catch { return false; }
  }, 'Chrome debugging endpoint', 12000);
  browser = await Promise.race([
    connectBrowser(debuggerEndpoint),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out connecting to Chrome WebSocket')), 5000)),
  ]);
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
  const targets = await fetch(`${debuggerEndpoint}/json/list`).then((response) => response.json());
  const target = targets.find((item) => item.id === targetId);
  assert.ok(target?.webSocketDebuggerUrl, 'Page target debugger is unavailable');
  rootBrowser = browser;
  browser = await connectTarget(target.webSocketDebuggerUrl);
  const panel = undefined;
  await browser.send('Page.enable', {}, panel);
  await browser.send('Network.enable', {}, panel);
  await browser.send('Network.setBlockedURLs', { urls: ['https://www.youtube.com/*', 'https://i.ytimg.com/*', 'http://localhost:*'] }, panel);
  await browser.send('Fetch.enable', { patterns: [{ urlPattern: bridgeUrl, resourceType: 'Document', requestStage: 'Request' }] }, panel);
  const removeFetchListener = browser.onEvent((message) => {
    if (message.sessionId !== panel || message.method !== 'Fetch.requestPaused') return;
    const requestId = message.params.requestId;
    const response = message.params.request.url === bridgeUrl
      ? browser.send('Fetch.fulfillRequest', {
          requestId, responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }],
          body: Buffer.from(bridgeFixture).toString('base64'),
        }, panel)
      : browser.send('Fetch.continueRequest', { requestId }, panel);
    void response.catch(() => {});
  });
  await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    const listeners = new Set();
    const disconnectListeners = new Set();
    const state = {
      playlist: [
        { videoId: 'dQw4w9WgXcQ', videoTitle: '밤의 픽셀 드라이브', channelTitle: '서울 신스웨이브', thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
        { videoId: 'M7lc1UVf-VE', videoTitle: '비 오는 날의 세이브 포인트', channelTitle: '8비트 라디오', thumbnail: 'https://i.ytimg.com/vi/M7lc1UVf-VE/hqdefault.jpg', videoUrl: 'https://www.youtube.com/watch?v=M7lc1UVf-VE' },
        { videoId: 'ysz5S6PUM-U', videoTitle: '별빛 카트리지', channelTitle: '모노 스테이션', thumbnail: 'https://i.ytimg.com/vi/ysz5S6PUM-U/hqdefault.jpg', videoUrl: 'https://www.youtube.com/watch?v=ysz5S6PUM-U' },
        ...Array.from({ length: 7 }, (_, index) => {
          const videoId = String(index + 1).padStart(11, '0');
          return { videoId, videoTitle: '픽셀 라디오 · 오래된 플레이리스트 ' + (index + 4), channelTitle: 'Pixel Radio', thumbnail: '', videoUrl: 'https://www.youtube.com/watch?v=' + videoId };
        }),
      ],
      settings: { shell: '#d9d7cc', screen: '#9bbc0f', button: '#a13b6d' },
    };
    const sentMessages = [];
    let aiSaveAttempts = 0;
    Object.defineProperty(window, '__uiMessages', { value: sentMessages });
    const emit = (message) => {
      const payload = structuredClone(message);
      queueMicrotask(() => listeners.forEach((listener) => listener(payload)));
    };
    window.__emitUiMessage = emit;
    const port = {
      onMessage: { addListener: (listener) => listeners.add(listener) },
      onDisconnect: { addListener: (listener) => disconnectListeners.add(listener) },
      postMessage(message) {
        sentMessages.push(structuredClone(message));
        if (message.type === 'PANEL_PROBE') emit({ type: 'CORE_STATE', state });
        if (message.type === 'AI_STATUS') emit({ type: 'AI_STATE', state: { configured: false, persisted: false, permission: true, trustedContexts: true } });
        if (message.type === 'AI_SAVE') {
          aiSaveAttempts += 1;
          if (aiSaveAttempts === 1) emit({ type: 'AI_RESULT', result: 'failed', code: 'AUTH_ERROR', details: { stage: 'connection' } });
          else {
            emit({ type: 'AI_RESULT', result: 'saved' });
            emit({ type: 'AI_STATE', state: { configured: true, persisted: false, permission: true, trustedContexts: true } });
          }
        }
        if (message.type === 'CORE_EDIT') {
          const change = message.change;
          if (change.kind === 'add' && !state.playlist.some((item) => item.videoId === change.track.videoId)) state.playlist.push(change.track);
          if (change.kind === 'remove') state.playlist = state.playlist.filter((item) => item.videoId !== change.videoId);
          if (change.kind === 'design') state.settings = change.settings;
          emit({ type: 'CORE_STATE', state });
        }
        if (message.type === 'AI_RECOMMEND') {
          emit({ type: 'AI_PROGRESS', stage: 'discovery' });
          setTimeout(() => emit({ type: 'AI_PROGRESS', stage: 'selection' }), 20);
          setTimeout(() => emit({ type: 'AI_RECOMMENDATIONS', recommendations: [
            { candidateId: 'fixture-1', videoId: 'aqz-KE-bpKQ', videoUrl: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', videoType: 'MV', title: '새벽의 체크포인트', artist: '네온 고양이', channelTitle: '네온 고양이', thumbnail: '' },
            { candidateId: 'fixture-2', videoId: 'jNQXAC9IVRw', videoUrl: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', videoType: 'PERFORMANCE', title: '메모리 카드', artist: '픽셀 웨이브', channelTitle: '픽셀 웨이브', thumbnail: '' },
            ...Array.from({ length: 4 }, (_, index) => {
              const videoId = 'FLOW' + String(index).padStart(7, '0');
              return { candidateId: 'flow-' + index, videoId, videoUrl: 'https://www.youtube.com/watch?v=' + videoId, videoType: 'AUDIO', title: '이어지는 밤 ' + (index + 3), artist: 'Pixel Radio', channelTitle: 'Pixel Radio', thumbnail: '' };
            }),
          ] }), 80);
        }
      },
    };
    try {
      const chromeMock = window.chrome || {};
      Object.defineProperties(chromeMock, {
        runtime: { value: { connect: () => port, get lastError() { return undefined; } } },
        permissions: { value: { request: async () => true } },
        storage: { value: { session: { set: async () => {} } } },
      });
      if (!window.chrome) Object.defineProperty(window, 'chrome', { value: chromeMock });
    } catch (error) { window.__chromeMockError = String(error); }
  })();` }, panel);
  await browser.send('Page.navigate', { url: panelUrl }, panel);
  await until(() => evaluate(browser, panel, "document.readyState === 'complete' && Boolean(document.querySelector('.game-boy'))"), 'Pixel Jukebox UI');
  await until(() => evaluate(browser, panel, "window.__uiMessages?.some(message => message.type === 'PANEL_PROBE') === true"), 'Chrome fixture runtime connection');
  await until(() => evaluate(browser, panel, "document.querySelector('iframe')?.contentDocument === null"), 'Cross-origin bridge fixture');

  const key = (value) => evaluate(browser, panel, `(() => {
    const options = { key: ${JSON.stringify(value)}, bubbles: true, cancelable: true };
    const target = document.activeElement || document.body;
    target.dispatchEvent(new KeyboardEvent('keydown', options));
    target.dispatchEvent(new KeyboardEvent('keyup', options));
  })()`);
  const click = (selector) => evaluate(browser, panel, `document.querySelector(${JSON.stringify(selector)})?.click()`, { userGesture: true });
  const screen = () => evaluate(browser, panel, `document.querySelector('#menu-view').hidden ? 'now-playing' : document.querySelector('#menu-view').dataset.screen`);
  const layout = () => evaluate(browser, panel, `(() => {
    const gameBoy = document.querySelector('.game-boy').getBoundingClientRect();
    const lcd = document.querySelector('#lcd-screen').getBoundingClientRect();
    const controls = [...document.querySelectorAll('#dpad-up, #dpad-down, #dpad-left, #dpad-right, #button-a, #button-b, #button-select, #button-start')]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
      .map((el) => { const r = el.getBoundingClientRect(); return { name: el.getAttribute('aria-label') || el.textContent.trim(), left: r.left, right: r.right, top: r.top, bottom: r.bottom }; });
    return {
      viewport: [innerWidth, innerHeight], scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth, gameBoy: { left: gameBoy.left, right: gameBoy.right, bottom: gameBoy.bottom },
      lcd: { left: lcd.left, right: lcd.right, top: lcd.top, bottom: lcd.bottom }, controls,
      exteriorPages: [...document.querySelectorAll('[data-view]')].filter((page) => !page.closest('#lcd-screen')).length,
    };
  })()`);

  assert.equal(await evaluate(browser, panel, "document.querySelectorAll('#lcd-screen').length"), 1, 'LCD screen root must be unique');
  assert.equal(await evaluate(browser, panel, "document.querySelector('#menu-view').parentElement.id"), 'lcd-screen', 'Menus must be inside the LCD');
  assert.equal(await evaluate(browser, panel, "[...document.querySelectorAll('[data-view]')].every((page) => page.closest('#lcd-screen'))"), true, 'No menu page may sit outside the LCD');
  assert.equal(await screen(), 'home', 'The initial screen must be the home menu');
  assert.equal(await evaluate(browser, panel, "document.querySelector('.home-screen .lcd-header span').textContent"), 'HOME', 'LCD header must not repeat the exterior logo');
  assert.equal(await evaluate(browser, panel, "(() => { const rows = [...document.querySelectorAll('.home-screen [data-open]')].map(el => el.getBoundingClientRect()); return rows.every(r => r.height >= 42) && rows[1].top - rows[0].bottom >= 6; })()"), true, 'Home rows must have generous spacing');
  assert.deepEqual(await evaluate(browser, panel, "[...document.querySelectorAll('[data-view=\"home\"] [data-open]')].map((button) => button.dataset.open)"), ['now-playing', 'playlist', 'ai-picks', 'settings'], 'Home integrates Add Music into Playlist');
  assert.equal(await evaluate(browser, panel, "document.querySelector('.screen-label') === null && !document.querySelector('#menu-view').classList.contains('toolbox')"), true, 'LCD must not retain the legacy label or toolbox card styling');
  const bezelPadding = await evaluate(browser, panel, `(() => { const style = getComputedStyle(document.querySelector('.screen-bezel')); return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft]; })()`);
  assert.equal(new Set(bezelPadding).size, 1, `LCD bezel padding must be equal: ${JSON.stringify(bezelPadding)}`);

  await click('#dpad-down');
  await click('#button-a');
  assert.equal(await screen(), 'playlist', 'Physical D-pad and A must open Playlist');
  await click('#button-b');
  assert.equal(await screen(), 'home', 'Physical B must return Home');
  await click('#button-start');
  assert.equal(await screen(), 'settings', 'Physical START must open Settings');
  assert.equal(await evaluate(browser, panel, "document.querySelector('[data-open=\"pip\"]') === null && document.querySelector('[data-view=\"pip\"]') === null"), true, 'Unverified Mini Player affordances must not be exposed');
  await key('Home');
  assert.equal(await screen(), 'home', 'Keyboard Home must act as SELECT');
  await key('ArrowDown');
  await key('Enter');
  assert.equal(await screen(), 'playlist', 'Keyboard arrows and Enter must navigate and confirm');
  await key('Escape');
  assert.equal(await screen(), 'home', 'Keyboard Escape must act as B');

  await evaluate(browser, panel, "document.body.focus()");
  const bodyFocusSelection = Number(await evaluate(browser, panel, "document.querySelector('[data-view=\"home\"] .is-selected')?.dataset.menuIndex"));
  await key('ArrowDown');
  assert.equal(await evaluate(browser, panel, "document.querySelector('[data-view=\"home\"] .is-selected')?.dataset.menuIndex"), String((bodyFocusSelection + 1) % 4), 'Keyboard navigation must work with document-body focus');

  await click('[data-open="playlist"]');
  assert.equal(await screen(), 'playlist');
  const inputSelector = '#video-url, input[type="url"]';
  await until(() => evaluate(browser, panel, `Boolean(document.querySelector(${JSON.stringify(inputSelector)}))`), 'Add-track input');
  assert.equal(await evaluate(browser, panel, `(() => {
    const row = document.querySelector('.playlist-add .video-link-row');
    const input = row?.querySelector('#video-url')?.getBoundingClientRect();
    const add = row?.querySelector('#add-video')?.getBoundingClientRect();
    return Boolean(input && add && Math.abs(input.top - add.top) < 1 && input.right <= add.left);
  })()`), true, 'Playlist link input and ADD & PLAY must share one row');
  const addButtonStyle = await evaluate(browser, panel, `(() => {
    const button = document.querySelector('#add-video');
    const rect = button.getBoundingClientRect();
    return { point: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }, shadow: getComputedStyle(button).boxShadow, transform: getComputedStyle(button).transform };
  })()`);
  assert.notEqual(addButtonStyle.shadow, 'none', 'LCD action buttons must have visible raised depth');
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...addButtonStyle.point }, panel);
  await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...addButtonStyle.point, button: 'left', buttons: 1, clickCount: 1 }, panel);
  assert.notEqual(await evaluate(browser, panel, "getComputedStyle(document.querySelector('#add-video')).transform"), addButtonStyle.transform, 'Pressed buttons must move into the surface');
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1, button: 'left', buttons: 1 }, panel);
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 1, y: 1, button: 'left', buttons: 0, clickCount: 1 }, panel);
  const selectionBefore = await evaluate(browser, panel, `(() => { const input = document.querySelector(${JSON.stringify(inputSelector)}); input.focus(); input.value = 'https://youtu.be/dQw4w9WgXcQ'; return document.querySelector('[data-menu-index].is-selected')?.dataset.menuIndex; })()`);
  await key('ArrowDown');
  assert.equal(await screen(), 'playlist', 'Arrow keys in inputs must not leave the form');
  assert.equal(await evaluate(browser, panel, "document.querySelector('[data-menu-index].is-selected')?.dataset.menuIndex"), selectionBefore, 'Form arrow keys must not move global selection');
  await key('Escape');
  assert.equal(await screen(), 'home', 'Escape in inputs must invoke the same B transition');
  await click('[data-open="playlist"]');
  await evaluate(browser, panel, "document.querySelector('#video-url').focus(); document.querySelector('#video-url').value = 'https://youtu.be/dQw4w9WgXcQ'");
  await key('Enter');
  assert.equal(await screen(), 'now-playing', 'Enter submits Playlist link');
  await until(() => evaluate(browser, panel, "document.querySelector('#player').dataset.playbackState === 'playing'"), 'Fixture track playback');
  assert.equal(await evaluate(browser, panel, "document.querySelector('#empty-player-link').hidden"), true, 'Now Playing link input must hide while Playlist has tracks');
  assert.equal(await evaluate(browser, panel, "document.querySelector('.power-light').classList.contains('is-playing')"), true, 'POWER light must turn on while music is playing');
  const recommendationRequestsBeforeConnect = await evaluate(browser, panel, "window.__uiMessages.filter((message) => message.type === 'AI_RECOMMEND').length");
  await click('.mini-disc');
  assert.equal(await screen(), 'now-playing', 'Missing API key must keep LP inside Now Playing');
  assert.equal(await evaluate(browser, panel, "document.querySelector('#continue-drawer').classList.contains('is-open') && !document.querySelector('#similar-vibes-connect').hidden && document.querySelector('#ai-picks').hidden"), true, 'Missing API key must show inline connect instead of GET PICKS');
  assert.equal(await evaluate(browser, panel, "window.__uiMessages.filter((message) => message.type === 'AI_RECOMMEND').length"), recommendationRequestsBeforeConnect, 'Missing API key must not start recommendations');
  const { data: connectShot } = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, panel);
  await writeFile(resolve(output, 'gameboy-similar-vibes-connect.png'), connectShot, 'base64');
  await evaluate(browser, panel, "document.querySelector('#similar-vibes-key').value = 'sk-inline-test'; document.querySelector('#similar-vibes-key').focus()");
  await click('#similar-vibes-connect-button');
  await until(() => evaluate(browser, panel, "document.querySelector('#similar-vibes-connect-message').textContent.includes('authentication failed')"), 'Retryable inline connection failure');
  assert.equal(await evaluate(browser, panel, "!document.querySelector('#similar-vibes-connect').hidden && document.querySelector('#ai-picks').hidden && document.querySelector('#similar-vibes-key').value.length > 0"), true, 'Failed inline connection must preserve the retryable form');
  assert.equal(await screen(), 'now-playing', 'Failed inline connection must stay inside the LP drawer');
  await click('#similar-vibes-connect-button');
  await until(() => evaluate(browser, panel, "document.querySelector('#similar-vibes-connect').hidden && !document.querySelector('#ai-picks').hidden"), 'Inline Similar Vibes connection');
  assert.equal(await screen(), 'now-playing', 'Inline connection must not navigate to Settings or replace Now Playing');
  assert.equal(await evaluate(browser, panel, "document.querySelector('#continue-drawer').classList.contains('is-open') && document.querySelector('#similar-vibes-key').value === ''"), true, 'Successful inline connection must keep the drawer open and clear its input');
  assert.equal(await evaluate(browser, panel, "Boolean(document.querySelector('#ai-picks').parentElement.classList.contains('similar-vibes-controls') && (document.querySelector('#ai-picks').compareDocumentPosition(document.querySelector('#ai-picks-list')) & Node.DOCUMENT_POSITION_FOLLOWING))"), true, 'GET PICKS must share the reference row before the list');
  assert.equal(await evaluate(browser, panel, "window.__uiMessages.filter((message) => message.type === 'AI_RECOMMEND').length"), recommendationRequestsBeforeConnect, 'Connecting must wait for an explicit GET PICKS action');
  const { data: readyShot } = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, panel);
  await writeFile(resolve(output, 'gameboy-similar-vibes-ready.png'), readyShot, 'base64');
  await click('.mini-disc');
  const actionLabelWeights = await evaluate(browser, panel, "[...document.querySelectorAll('.action-buttons label > span')].map((label) => getComputedStyle(label).fontWeight)");
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 }, panel);
  const labelClip = await evaluate(browser, panel, `(() => {
    const r = document.querySelector('.action-buttons').getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, scale: 1 };
  })()`);
  const beforeHover = await browser.send('Page.captureScreenshot', { format: 'png', clip: labelClip }, panel);
  const dpadPoint = await evaluate(browser, panel, `(() => { const r = document.querySelector('#dpad-right').getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2}; })()`);
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...dpadPoint }, panel);
  await new Promise((resolve) => setTimeout(resolve, 180));
  const afterHover = await browser.send('Page.captureScreenshot', { format: 'png', clip: labelClip }, panel);
  assert.equal(afterHover.data, beforeHover.data, 'D-pad hover must leave A/B pixels unchanged');
  await click('#dpad-right');
  assert.deepEqual(await evaluate(browser, panel, "[...document.querySelectorAll('.action-buttons label > span')].map((label) => getComputedStyle(label).fontWeight)"), actionLabelWeights, 'D-pad input must not change A/B label weight');
  await click('.track-queue');
  assert.equal(await evaluate(browser, panel, "document.querySelector('.now-playing-queue').classList.contains('is-open')"), true, 'Now Playing QUEUE must open inside the LCD');
  await until(() => evaluate(browser, panel, `(() => {
    const sheet = document.querySelector('.now-playing-queue').getBoundingClientRect();
    const view = document.querySelector('#video-view').getBoundingClientRect();
    return sheet.top < view.top + view.height * .4 && sheet.bottom <= view.bottom + 1;
  })()`), 'Queue slide reaches the lower two-thirds of the LCD');
  await mkdir(output, { recursive: true });
  const { data: queueShot } = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, panel);
  await writeFile(resolve(output, 'gameboy-now-playing-queue.png'), queueShot, 'base64');
  const queueState = await evaluate(browser, panel, `({
    rows: document.querySelectorAll('.now-playing-queue-track').length,
    playlistCount: document.querySelector('#playlist-count')?.textContent,
    messageTypes: (window.__uiMessages || []).map((message) => message.type),
    mockError: window.__chromeMockError,
    chromeRuntime: typeof window.chrome?.runtime?.connect,
    videoMessage: document.querySelector('#video-message')?.textContent,
  })`);
  assert.ok(queueState.rows >= 3, `Fixture playlist must populate the Now Playing queue: ${JSON.stringify(queueState)}`);
  const queueSelectionBefore = await evaluate(browser, panel, "document.querySelector('.now-playing-queue-track.is-selected')?.dataset.videoId");
  await click('#dpad-down');
  const queueSelectionAfter = await evaluate(browser, panel, "document.querySelector('.now-playing-queue-track.is-selected')?.dataset.videoId");
  assert.notEqual(queueSelectionAfter, queueSelectionBefore, 'D-pad must move through Now Playing queue tracks');
  await click('#button-a');
  await until(() => evaluate(browser, panel, `${JSON.stringify(queueSelectionAfter)} === document.querySelector('#player').dataset.videoId && document.querySelector('#player').dataset.playbackState === 'playing'`), 'Now Playing queue selection');
  assert.equal(await evaluate(browser, panel, "!document.querySelector('.now-playing-queue').classList.contains('is-open') && document.activeElement === document.querySelector('.track-queue')"), true, 'Selecting a queue track must close the sheet and restore toggle focus');
  assert.equal(await evaluate(browser, panel, "document.querySelector('#player').dataset.playbackState"), 'playing', 'Queue selection must keep the chosen track playing');

  await click('#button-select');
  await until(() => evaluate(browser, panel, "document.querySelector('#player').dataset.playbackState === 'paused'"), 'Menu entry pause');
  assert.equal(await evaluate(browser, panel, "document.querySelector('.power-light').classList.contains('is-playing')"), false, 'POWER light must turn off when playback pauses');
  await click('[data-open="now-playing"]');
  assert.equal(await evaluate(browser, panel, "document.querySelector('#player').dataset.playbackState"), 'paused', 'Returning to Now Playing must stay paused');
  await click('#button-a');
  await until(() => evaluate(browser, panel, "document.querySelector('#player').dataset.playbackState === 'playing'"), 'A resumes playback');
  assert.equal(await evaluate(browser, panel, "document.querySelector('.power-light').getAttribute('aria-label')"), 'Music playing', 'POWER light status must be accessible');

  await click('#button-start');
  await click('[data-open="appearance"]');
  await evaluate(browser, panel, `(() => { const input = document.querySelector('#shell-tone'); input.value = '#123456'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  assert.equal(await evaluate(browser, panel, "document.documentElement.style.getPropertyValue('--color-shell')"), '#123456', 'Appearance must preview immediately');
  await click('#button-b');
  assert.equal(await screen(), 'settings', 'Physical B must leave Appearance');
  assert.equal(await evaluate(browser, panel, "document.documentElement.style.getPropertyValue('--color-shell')"), '#d9d7cc', 'Physical B must restore saved Appearance settings');
  await click('[data-open="appearance"]');
  await evaluate(browser, panel, `(() => { const input = document.querySelector('#shell-tone'); input.value = '#e0dfd0'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await click('#button-a');
  await until(() => evaluate(browser, panel, "Array.isArray(window.__uiMessages) && window.__uiMessages.some((message) => message && message.change && message.change.settings && message.change.settings.shell === '#e0dfd0')"), 'Appearance save message');
  await click('#button-b');
  assert.equal(await evaluate(browser, panel, "document.documentElement.style.getPropertyValue('--color-shell')"), '#e0dfd0', 'Physical A must save Appearance while a color input is selected');

  await click('[data-open="openai"]');
  await evaluate(browser, panel, "document.querySelector('#ai-key').value = 'sk-test-value'");
  const recommendationsBeforeManualConnect = await evaluate(browser, panel, "window.__uiMessages.filter((message) => message.type === 'AI_RECOMMEND').length");
  await click('#button-a');
  await until(() => evaluate(browser, panel, "window.__uiMessages.some((message) => message.type === 'AI_SAVE')"), 'OpenAI A action');
  await until(() => screen().then((value) => value === 'ai-picks'), 'AI Picks after OpenAI connection');
  assert.equal(await evaluate(browser, panel, "window.__uiMessages.filter((message) => message.type === 'AI_RECOMMEND').length"), recommendationsBeforeManualConnect, 'Manual OpenAI connection must not start a recommendation request');
  await click('#button-select');

  await click('[data-open="playlist"]');
  await until(() => evaluate(browser, panel, "document.querySelectorAll('.playlist-play').length >= 3"), 'Fixture playlist');
  assert.equal(await evaluate(browser, panel, `(() => {
    const list = document.querySelector('#playlist-list');
    const style = getComputedStyle(list);
    return list.scrollHeight > list.clientHeight && style.scrollbarWidth === 'thin' && style.scrollbarColor !== 'auto';
  })()`), true, 'Overflowing playlist must use the themed thin scrollbar');
  assert.equal(await evaluate(browser, panel, "document.querySelector('[data-view=\"playlist\"] .is-selected')?.classList.contains('playlist-play')"), true, 'Playlist D-pad selection must target a track title');
  await click('#dpad-down');
  assert.equal(await evaluate(browser, panel, "document.querySelector('[data-view=\"playlist\"] .is-selected')?.classList.contains('playlist-play') && !document.querySelector('.playlist-remove.is-selected')"), true, 'Playlist D-pad must skip remove buttons');
  assert.equal(await evaluate(browser, panel, "[...document.querySelectorAll('.playlist-remove')].every((button) => button.tabIndex === 0 && !button.disabled)"), true, 'Playlist remove buttons must remain Tab-accessible and clickable');
  await click('.playlist-play');
  await click('#button-select');
  await click('[data-open="now-playing"]');
  assert.equal(await screen(), 'now-playing');
  const trackBefore = await evaluate(browser, panel, "document.querySelector('.track-title')?.textContent");
  await click('#dpad-right');
  const trackAfter = await evaluate(browser, panel, "document.querySelector('.track-title')?.textContent");
  assert.notEqual(trackAfter, trackBefore, 'Physical D-pad Right must move to the next playlist track');

  const frameIdentityBefore = await evaluate(browser, panel, `(() => { const frame = document.querySelector('iframe'); assert; frame.dataset.testIdentity ||= crypto.randomUUID(); return frame.dataset.testIdentity; })()`.replace('assert;', "if (!frame) throw new Error('missing iframe');"));
  await click('#button-select');
  await click('[data-open="playlist"]');
  await click('#button-b');
  await click('[data-open="now-playing"]');
  const frameIdentityAfter = await evaluate(browser, panel, `document.querySelector('iframe')?.dataset.testIdentity ?? null`);
  assert.equal(frameIdentityAfter, frameIdentityBefore, 'Player iframe identity must survive screen switches');

  const videoLayout = await evaluate(browser, panel, `(() => {
    const video = document.querySelector('.embedded-video').getBoundingClientRect();
    const nowPlaying = document.querySelector('.now-playing').getBoundingClientRect();
    return { video: video.height, nowPlaying: nowPlaying.height };
  })()`);
  assert.ok(videoLayout.video > videoLayout.nowPlaying, `Video must remain larger than compact track details: ${JSON.stringify(videoLayout)}`);
  let recommendationsBeforeDisc = await evaluate(browser, panel, "window.__uiMessages.filter((message) => message.type === 'AI_RECOMMEND').length");
  if (await evaluate(browser, panel, "document.querySelector('#player').dataset.playbackState !== 'playing'")) await click('#button-a');
  await until(() => evaluate(browser, panel, "document.querySelector('#player').dataset.playbackState === 'playing'"), 'Playing before continuation');
  await click('.mini-disc');
  await until(() => evaluate(browser, panel, `window.__uiMessages.filter(message => message.type === 'AI_RECOMMEND').length === ${recommendationsBeforeDisc + 1}`), 'LP automatically requests playing track');
  assert.equal(await evaluate(browser, panel, "window.__uiMessages.filter(message => message.type === 'AI_RECOMMEND').at(-1).sourceVideoId === document.querySelector('#player').dataset.videoId"), true, 'LP must use the currently playing song, not a stale manual source');
  await until(() => evaluate(browser, panel, "!document.querySelector('#similar-vibes-source-trigger').disabled && document.querySelectorAll('.ai-pick-card').length === 6"), 'Playing-track recommendations');
  recommendationsBeforeDisc += 1;
  await click('#similar-vibes-source-trigger');
  await until(() => evaluate(browser, panel, "document.activeElement?.getAttribute('role') === 'option'"), 'Picker option focus');
  await key('ArrowDown');
  await key('Escape');
  assert.equal(await evaluate(browser, panel, "document.querySelector('#similar-vibes-source-list').hidden && document.activeElement.id === 'similar-vibes-source-trigger' && document.querySelector('#continue-drawer').classList.contains('is-open')"), true, 'Escape must dismiss only the reference picker and return focus');
  await click('#similar-vibes-source-trigger');
  const sourceChoice = await evaluate(browser, panel, `(() => {
    const playing = document.querySelector('#player').dataset.videoId;
    const option = [...document.querySelectorAll('.similar-vibes-source-option')].find((item) => item.dataset.videoId !== playing);
    if (!option) throw new Error('missing non-playing Playlist source');
    const sourceVideoId = option.dataset.videoId;
    option.click();
    return { sourceVideoId, playing, coreEdits: window.__uiMessages.filter((message) => message.type === 'CORE_EDIT').length };
  })()`);
  assert.equal(await screen(), 'now-playing', 'LP continuation must keep Now Playing visible');
  assert.equal(await evaluate(browser, panel, "document.querySelector('#continue-drawer').classList.contains('is-open')"), true, 'LP must open the continuation drawer');
  assert.equal(await evaluate(browser, panel, "document.querySelector('#player').dataset.playbackState"), 'playing', 'Opening continuation must not pause playback');
  assert.equal(await evaluate(browser, panel, `document.querySelector('#similar-vibes-source-trigger').dataset.videoId === ${JSON.stringify(sourceChoice.sourceVideoId)} && document.querySelector('#player').dataset.videoId === ${JSON.stringify(sourceChoice.playing)} && window.__uiMessages.filter((message) => message.type === 'CORE_EDIT').length === ${sourceChoice.coreEdits}`), true, 'Similar Vibes must select a non-playing Playlist source without playback or queue edits');
  const recommendationDrawerLayout = await evaluate(browser, panel, `(() => {
    const drawerElement = document.querySelector('#continue-drawer');
    const queueElement = document.querySelector('.now-playing-queue:not(#continue-drawer)');
    const drawer = drawerElement.getBoundingClientRect();
    const video = document.querySelector('.embedded-video').getBoundingClientRect();
    return { drawerOffset: drawerElement.offsetTop, queueOffset: queueElement.offsetTop, drawerTop: drawer.top, videoTop: video.top, videoHeight: video.height };
  })()`);
  assert.ok(Math.abs(recommendationDrawerLayout.drawerOffset - recommendationDrawerLayout.queueOffset) < 1 && recommendationDrawerLayout.drawerTop > recommendationDrawerLayout.videoTop + recommendationDrawerLayout.videoHeight * .25, `Similar Vibes must use the same lower drawer height as Playlist and leave the player visible: ${JSON.stringify(recommendationDrawerLayout)}`);
  assert.equal(await evaluate(browser, panel, "window.__uiMessages.filter((message) => message.type === 'AI_RECOMMEND').length"), recommendationsBeforeDisc, 'Manually changing the source must wait for GET PICKS');
  await click('#ai-picks');
  await until(() => evaluate(browser, panel, `window.__uiMessages.filter((message) => message.type === 'AI_RECOMMEND').length === ${recommendationsBeforeDisc + 1}`), 'LP recommendation request');
  assert.equal(await evaluate(browser, panel, `(() => {
    const requests = window.__uiMessages.filter((message) => message.type === 'AI_RECOMMEND');
    const content = document.querySelector('#continue-drawer .lcd-content').getBoundingClientRect();
    const action = document.querySelector('#ai-picks').getBoundingClientRect();
    return requests.at(-1)?.sourceVideoId === ${JSON.stringify(sourceChoice.sourceVideoId)} && document.querySelector('#player').dataset.videoId === ${JSON.stringify(sourceChoice.playing)} && document.querySelector('#similar-vibes-source-trigger').disabled && document.querySelector('#continue-drawer .lcd-content').scrollTop === 0 && action.top >= content.top;
  })()`), true, 'GET PICKS must use the selected stored source, preserve playback, lock selection, and keep controls visible');
  assert.equal(await evaluate(browser, panel, "document.querySelector('#ai-picks-loading').hidden"), false, 'AI progress must be visible while searching');
  assert.equal(await evaluate(browser, panel, "document.querySelector('#ai-picks-source')"), null, 'Continuation must not duplicate the selected reference track');
  assert.equal(await evaluate(browser, panel, "getComputedStyle(document.querySelector('.pixel-loader i')).animationName"), 'pixel-search', 'Pixel loader must animate during search');
  await until(() => evaluate(browser, panel, "document.querySelector('#ai-picks-progress').textContent.includes('Arranging')"), 'Continuation selection progress');
  await until(() => evaluate(browser, panel, "document.querySelectorAll('.ai-pick-card').length === 6"), 'Six continuation songs');
  assert.equal(await evaluate(browser, panel, `(() => {
    const picker = document.querySelector('#similar-vibes-source-trigger').getBoundingClientRect();
    const action = document.querySelector('#ai-picks').getBoundingClientRect();
    const list = document.querySelector('#ai-picks-list');
    const message = document.querySelector('#ai-picks-message');
    return Math.abs(picker.top - action.top) < 1
      && Math.abs(picker.bottom - action.bottom) < 1
      && Boolean(list.compareDocumentPosition(message) & Node.DOCUMENT_POSITION_FOLLOWING)
      && message.textContent === '';
  })()`), true, 'Reference picker and More Like This must share one row with results before status copy');
  assert.equal(await evaluate(browser, panel, "document.querySelectorAll('.ai-pick-info, .ai-pick-back').length"), 0, 'Recommendation rows must not expose redundant info controls or duplicate backs');
  assert.equal(await evaluate(browser, panel, "document.querySelector('.ai-pick-type').textContent === 'MV' && getComputedStyle(document.querySelector('.ai-pick-face img')).display !== 'none'"), true, 'Recommendation rows must show thumbnail and video type');
  assert.equal(await evaluate(browser, panel, "getComputedStyle(document.querySelector('#ai-picks-loading')).display"), 'none', 'Completed AI loading indicator must not remain visible');
  await until(() => evaluate(browser, panel, "getComputedStyle(document.querySelector('#continue-drawer')).transform === 'matrix(1, 0, 0, 1, 0, 0)'"), 'Continuation drawer slide completion');
  const { data: continuationShot } = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, panel);
  await writeFile(resolve(output, 'gameboy-continue-listening.png'), continuationShot, 'base64');
  await click('#button-b');
  assert.equal(await screen(), 'now-playing');
  assert.equal(await evaluate(browser, panel, "document.querySelector('#continue-drawer').inert"), true, 'Closed continuation must be inert');
  assert.equal(await evaluate(browser, panel, "document.querySelector('#player').dataset.playbackState"), 'playing', 'Closing continuation must not pause');
  await click('.mini-disc');
  await until(() => evaluate(browser, panel, `window.__uiMessages.filter(message => message.type === 'AI_RECOMMEND').length === ${recommendationsBeforeDisc + 2}`), 'LP replaces the prior manual source with the playing track');
  assert.equal(await evaluate(browser, panel, "window.__uiMessages.filter(message => message.type === 'AI_RECOMMEND').at(-1).sourceVideoId === document.querySelector('#player').dataset.videoId"), true, 'Reopened LP must restore the playing song as reference');
  await until(() => evaluate(browser, panel, "!document.querySelector('#similar-vibes-source-trigger').disabled && document.querySelectorAll('.ai-pick-card').length === 6"), 'Reopened LP results');
  await evaluate(browser, panel, "document.querySelector('.ai-pick-add').focus({ preventScroll: true })");
  const continuationVideo = await evaluate(browser, panel, "document.querySelector('#player').dataset.videoId");
  await click('#button-a');
  await until(() => evaluate(browser, panel, "document.querySelector('#player').dataset.videoId === 'aqz-KE-bpKQ'"), 'A selects and plays the continuation');
  assert.notEqual(await evaluate(browser, panel, "document.querySelector('#player').dataset.videoId"), continuationVideo, 'Adding a continuation must select the new Playlist track');
  assert.equal(await evaluate(browser, panel, "window.__uiMessages.some(message => message.type === 'CORE_EDIT' && message.change?.kind === 'add' && message.change.track?.videoId === 'aqz-KE-bpKQ')"), true, 'A adds the selected continuation to Playlist and starts playback');
  const recommendationsBeforeRetry = await evaluate(browser, panel, "window.__uiMessages.filter((message) => message.type === 'AI_RECOMMEND').length");
  await evaluate(browser, panel, "window.__emitUiMessage({ type: 'AI_RECOMMENDATION_ERROR', code: 'NO_CANDIDATES', details: { stage: 'discovery' } })");
  assert.equal(await evaluate(browser, panel, "getComputedStyle(document.querySelector('#ai-picks-loading')).display"), 'none', 'Failed AI loading indicator must be hidden');
  assert.equal(await evaluate(browser, panel, "document.querySelector('#ai-picks-retry')"), null, 'Failed recommendation must not add a competing Retry action');
  await click('#ai-picks');
  await until(() => evaluate(browser, panel, `window.__uiMessages.filter((message) => message.type === 'AI_RECOMMEND').length > ${recommendationsBeforeRetry}`), 'AI retry request');
  await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, panel);
  assert.equal(await evaluate(browser, panel, "getComputedStyle(document.querySelector('.pixel-loader i')).animationName"), 'none', 'Reduced motion must stop the pixel loader');
  await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] }, panel);

  await mkdir(output, { recursive: true });
  for (const width of [360, 390, 480]) {
    await browser.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false }, panel);
    const measured = await layout();
    assert.ok(measured.scrollWidth <= width && measured.bodyScrollWidth <= width, `${width}px page overflows: ${JSON.stringify(measured)}`);
    assert.ok(measured.gameBoy.left >= 0 && measured.gameBoy.right <= width + 0.5, `${width}px console is outside viewport`);
    assert.equal(measured.exteriorPages, 0, `${width}px has a menu outside the LCD`);
    assert.equal(measured.controls.length, 8, `${width}px physical controls are missing`);
    assert.ok(measured.controls.every((control) => control.left >= 0 && control.right <= width + 0.5 && control.top >= 0 && control.bottom <= 900), `${width}px physical controls are outside the viewport`);
    for (const view of ['home', 'playlist', 'ai-picks', 'settings']) {
      await click('#button-select');
      if (view === 'settings') await click('#button-start');
      else if (view !== 'home') await click(`[data-open="${view}"]`);
      assert.equal(await screen(), view);
      if (view === 'ai-picks') {
        await click('#ai-picks');
        await until(() => evaluate(browser, panel, "document.querySelectorAll('.ai-pick-card').length === 6"), 'Continuation fixture cards');
        await until(() => evaluate(browser, panel, "!document.querySelector('#similar-vibes-source-trigger').disabled"), 'Reference picker ready');
        await click('#similar-vibes-source-trigger');
        assert.equal(await evaluate(browser, panel, `(() => {
          const list = document.querySelector('#similar-vibes-source-list');
          const option = list.querySelector('[role="option"]');
          option.textContent = 'Hearts2Hearts 하츠투하츠 · ICONIC HEART · Dance Practice Video · Hearts2Hearts';
          const lcd = document.querySelector('#lcd-screen').getBoundingClientRect();
          return !list.hidden && [list, ...list.children].every(el => { const r = el.getBoundingClientRect(); return r.left >= lcd.left && r.right <= lcd.right && el.scrollWidth >= el.clientWidth; }) && list.clientHeight <= 110 && document.documentElement.scrollWidth <= innerWidth;
        })()`), true, 'Long reference options must stay inside the LCD at every viewport width');
        if (width === 390) {
          const { data: pickerShot } = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, panel);
          await writeFile(resolve(output, 'gameboy-reference-picker-390.png'), pickerShot, 'base64');
        }
        await key('Escape');
      }
      const { data } = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, panel);
      await writeFile(resolve(output, `gameboy-${view}-${width}.png`), data, 'base64');
    }
    console.log(`PASS ${width}px: no horizontal overflow, all 8 controls and 4 LCD screens visible`);
  }
  await evaluate(browser, panel, "document.documentElement.classList.add('standalone-window')");
  await click('#button-select');
  await click('[data-open="now-playing"]');
  const standaloneSize = () => evaluate(browser, panel, `(() => {
    window.dispatchEvent(new Event('resize'));
    const scale = Number(getComputedStyle(document.documentElement).getPropertyValue('--window-scale')) || 1;
    const gameBoy = document.querySelector('.game-boy').getBoundingClientRect();
    const lcd = document.querySelector('.screen-bezel').getBoundingClientRect();
    const video = document.querySelector('.embedded-video').getBoundingClientRect();
    return { gameBoy: { width: gameBoy.width / scale, bottom: gameBoy.bottom }, lcd: { width: lcd.width, height: lcd.height }, video: { width: video.width, height: video.height } };
  })()`);
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 380, height: 650, deviceScaleFactor: 1, mobile: false }, panel);
  const standaloneMinimum = await standaloneSize();
  const { data: standaloneMinimumShot } = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, panel);
  await writeFile(resolve(output, 'gameboy-now-playing-standalone-380x650.png'), standaloneMinimumShot, 'base64');
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 720, height: 940, deviceScaleFactor: 1, mobile: false }, panel);
  const standaloneExpanded = await standaloneSize();
  const { data: standaloneExpandedShot } = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, panel);
  await writeFile(resolve(output, 'gameboy-now-playing-standalone-720x940.png'), standaloneExpandedShot, 'base64');
  assert.ok(standaloneExpanded.gameBoy.width > standaloneMinimum.gameBoy.width, `Standalone player must grow beyond its 360px minimum: ${JSON.stringify({ standaloneMinimum, standaloneExpanded })}`);
  assert.ok(standaloneExpanded.gameBoy.width <= 640 && standaloneExpanded.gameBoy.bottom <= 940, `Standalone player must stay bounded: ${JSON.stringify(standaloneExpanded)}`);
  assert.ok(standaloneExpanded.lcd.height > standaloneMinimum.lcd.height && standaloneExpanded.video.height > standaloneMinimum.video.height, `Standalone LCD and video must consume added height: ${JSON.stringify({ standaloneMinimum, standaloneExpanded })}`);
  for (const [width, height] of [[360, 600], [720, 480], [1280, 720], [1920, 1080]]) {
    await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, panel);
    await evaluate(browser, panel, 'window.scrollTo(0, 0)');
    const layout = await evaluate(browser, panel, `(() => {
      window.dispatchEvent(new Event('resize'));
      const scale = Number(getComputedStyle(document.documentElement).getPropertyValue('--window-scale')) || 1;
      const rect = selector => document.querySelector(selector).getBoundingClientRect();
      const lcd = rect('.screen-bezel');
      const video = rect('.embedded-video iframe');
      const info = rect('.now-playing');
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        scale,
        deckWidth: rect('.control-deck').width / scale,
        lcdWidth: lcd.width / scale,
        hardwareFits: rect('.dpad').left >= lcd.left && rect('.dpad').right < rect('.action-buttons').left && rect('.action-buttons').right <= lcd.right && rect('.system-controls').right < rect('.speaker').left,
        buttonWidth: rect('#button-a').width,
        shellBottom: rect('.game-boy').bottom,
        ratio: video.width / video.height,
        fillsWidth: Math.abs(video.width - (rect('.embedded-video').width - 6 * scale)) < 1,
        infoVisible: info.top >= video.bottom && info.bottom <= lcd.bottom,
        bottom: rect('.lower-deck').bottom,
        scrollHeight: document.documentElement.scrollHeight,
      };
    })()`);
    assert.ok(!layout.overflow && Math.abs(layout.deckWidth - layout.lcdWidth) < 1 && layout.hardwareFits, `Hardware must use the LCD width without overlap at ${width}x${height}: ${JSON.stringify(layout)}`);
    assert.ok(Math.abs(layout.ratio - 16 / 9) < 0.02 && layout.fillsWidth && layout.infoVisible, `Video and metadata at ${width}x${height}: ${JSON.stringify(layout)}`);
    assert.ok(layout.bottom <= layout.scrollHeight, `Controls must be reachable at ${width}x${height}`);
    if (layout.scale > 1 || (width === 360 && height === 600)) assert.ok(layout.bottom <= height, `Controls must fit at ${width}x${height}`);
    if (width === 1920) assert.ok(layout.scale > 1 && layout.buttonWidth > 60, 'Large windows must enlarge hardware controls with the video');
    if (width === 1920) assert.ok(layout.shellBottom <= height && height - layout.shellBottom < 24, 'Large windows must fill the available height with a small bottom margin');
    const screenGeometry = () => evaluate(browser, panel, `(() => {
      const shell = document.querySelector('.game-boy').getBoundingClientRect();
      const lcd = document.querySelector('#lcd-screen').getBoundingClientRect();
      const controls = document.querySelector('.control-deck').getBoundingClientRect();
      return [shell.width, shell.height, lcd.height, controls.top - shell.top].map(value => Math.round(value));
    })()`);
    const playingGeometry = await screenGeometry();
    for (const view of ['home', 'playlist', 'ai-picks', 'settings', 'now-playing']) {
      await click('#button-select');
      if (view !== 'home') await click(`[data-open="${view}"]`);
      assert.equal(await screen(), view);
      assert.deepEqual(await screenGeometry(), playingGeometry, `${width}x${height}: ${view} must preserve the shell, LCD and control positions`);
    }
  }
  console.log('PASS responsive: bounded controls, 16:9 video and visible metadata at 360x600, 720x480, 1280x720, 1920x1080');
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 560, deviceScaleFactor: 1, mobile: false }, panel);
  await evaluate(browser, panel, 'window.dispatchEvent(new Event("resize"))');
  for (const view of ['playlist', 'ai-picks']) {
    await click('#button-select');
    await click(`[data-open="${view}"]`);
    await evaluate(browser, panel, `(() => {
      const page = document.querySelector('[data-view="${view}"]');
      const items = page.querySelectorAll('button, input');
      items[items.length - 1].scrollIntoView({ block: 'end' });
      for (const frame of document.querySelectorAll('.game-boy, #lcd-screen, #video-view')) frame.scrollTop = 180;
    })()`);
    assert.equal(await evaluate(browser, panel, `(() => {
      const lcd = document.querySelector('#lcd-screen');
      const menu = document.querySelector('#menu-view').getBoundingClientRect();
      const bounds = lcd.getBoundingClientRect();
      return lcd.scrollTop === 0 && Math.abs(menu.top - bounds.top - 10) < 1 && Math.abs(menu.bottom - bounds.bottom + 10) < 1;
    })()`), true, `${view} must fill the LCD without scrolling its frame`);
    await click('#button-select');
    await click('[data-open="now-playing"]');
    assert.equal(await evaluate(browser, panel, `(() => {
      const lcd = document.querySelector('#lcd-screen');
      const video = document.querySelector('#video-view');
      return lcd.scrollTop === 0 && video.scrollTop === 0 && Math.abs(video.getBoundingClientRect().top - lcd.getBoundingClientRect().top - 10) < 1;
    })()`), true, `Returning from ${view} must restore the full video`);
  }
  console.log('PASS LCD frame: Playlist and AI PICKS scrolling cannot displace the screen or returning video');
  await click('#button-select');
  await click('[data-open="ai-picks"]');
  await evaluate(browser, panel, "window.__emitUiMessage({ type: 'CORE_STATE', state: { playlist: [], settings: { shell: '#e0dfd0', screen: '#9bbc0f', button: '#a13b6d' } } })");
  assert.equal(await evaluate(browser, panel, "document.querySelector('#similar-vibes-source-trigger').disabled && document.querySelector('#ai-picks').disabled && !document.querySelector('#similar-vibes-empty').hidden && !document.querySelector('#similar-vibes-open-playlist').hidden"), true, 'Empty Playlist must disable source and GET PICKS and offer Playlist navigation');
  assert.equal(await evaluate(browser, panel, "!document.querySelector('#empty-player-link').hidden"), true, 'Empty Playlist must show a YouTube link input in Now Playing');
  console.log('PASS navigation: SELECT/Home, A/Enter, B/Escape, START, D-pad, body focus and form isolation');
  console.log('PASS actions: Enter submits Playlist link, saves Appearance, connects OpenAI; B restores unsaved Appearance');
  console.log('PASS playback: menu entry pauses; Now Playing stays paused until A resumes');
  console.log('PASS persistence: player iframe DOM identity survived screen switches');
  console.log(`Queue screenshot: ${resolve(output, 'gameboy-now-playing-queue.png')}`);
  console.log(`Screenshots: ${resolve(output, 'gameboy-{home,playlist,ai-picks,settings}-{360,390,480}.png')}`);
  console.log(`Standalone screenshots: ${resolve(output, 'gameboy-now-playing-standalone-{380x650,720x940}.png')}`);
} finally {
  if (browser) {
    try {
      await Promise.race([
        rootBrowser?.send('Browser.close'),
        new Promise((resolveTimeout) => setTimeout(resolveTimeout, 1500)),
      ]);
    } catch { }
    browser.close();
    rootBrowser?.close();
  }
  if (child.exitCode === null) child.kill();
  server.closeAllConnections();
  await new Promise((resolveClosed) => server.close(resolveClosed));
}
