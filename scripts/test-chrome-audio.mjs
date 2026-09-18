import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { attach, connectBrowser, evaluate, until } from './cdp.mjs';
import { readBridgeConfig } from './bridge-config.mjs';

const bridgeUrl = readBridgeConfig().url;

const output = resolve('.chrome-test');
await mkdir(output, { recursive: true });
const port = 12000 + (process.pid % 30000);
const child = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${port}`, '--enable-unsafe-extension-debugging',
  '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
  `--user-data-dir=${resolve(output, `audio-profile-${process.pid}`)}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
const youtubeUrl = 'https://www.youtube.com/embed/dQw4w9WgXcQ';
const bridge = `<!doctype html><style>html,body,iframe{width:100%;height:100%;margin:0;border:0}</style><iframe src="${youtubeUrl}"></iframe><script>
addEventListener('message', e => {
 if (e.source !== parent || e.data?.source !== 'pixel-jukebox-sidepanel') return;
 const msg = {source:'pixel-jukebox-player-bridge',version:1};
 if(e.data.type==='init') parent.postMessage({...msg,type:'ready'},e.origin);
 if(e.data.type==='load') parent.postMessage({...msg,type:'state',state:e.data.autoplay?'playing':'paused',videoId:e.data.videoId},e.origin);
});</script>`;
const youtube = `<!doctype html><style>video{width:200px;height:60px}button{width:140px;height:32px}</style><div id="movie_player" class="ad-showing"><video></video><button class="ytp-ad-skip-button-modern" hidden disabled>Skip Ad</button></div><script>
document.querySelector('button').onclick=(event)=>{if(!event.isTrusted){document.body.dataset.syntheticRejected='true';return;}document.body.dataset.clicks=String(Number(document.body.dataset.clicks||0)+1);document.querySelector('#movie_player').classList.remove('ad-showing');};
</script>`;
let browser;
try {
  await until(async () => {
    if (child.exitCode !== null) throw new Error('Chrome exited');
    try { return (await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(500) })).ok; } catch { return false; }
  }, 'Chrome start');
  browser = await connectBrowser(`http://127.0.0.1:${port}`);
  const failures = [];
  const configure = async (session) => {
    await browser.send('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }] }, session);
    await browser.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, session);
  };
  browser.onEvent((event) => {
    if (event.method === 'Target.attachedToTarget') {
      const session = event.params.sessionId;
      void configure(session).then(() => browser.send('Runtime.runIfWaitingForDebugger', {}, session)).catch(error => failures.push(error.message));
    }
    if (event.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = event.params;
    const html = request.url === bridgeUrl ? bridge : request.url.startsWith(youtubeUrl) ? youtube : null;
    const operation = html !== null ? browser.send('Fetch.fulfillRequest', {
      requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }], body: Buffer.from(html).toString('base64'),
    }, event.sessionId) : browser.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }, event.sessionId);
    void operation.catch(error => failures.push(error.message));
  });
  const { id } = await browser.send('Extensions.loadUnpacked', { path: resolve('dist') });
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
  const panel = await attach(browser, targetId);
  await browser.send('Page.enable', {}, panel);
  await configure(panel);
  await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: "addEventListener('message',e=>{if(e.data?.source==='pixel-jukebox-youtube-controls'&&e.data.type==='skip-diagnostics')e.stopImmediatePropagation();},true);" }, panel);
  await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: "window.__audioEvents=[];addEventListener('message',e=>{if(e.data?.source==='pixel-jukebox-youtube-controls')window.__audioEvents.push({origin:e.origin,type:e.data.type});});" }, panel);
  await browser.send('Page.navigate', { url: `chrome-extension://${id}/sidepanel.html` }, panel);
  try {
    await until(() => evaluate(browser, panel, "Boolean(document.querySelector('#player-volume')) && !document.querySelector('#player-volume').disabled"), 'Real extension content script audio handshake');
  } catch (error) {
    const { targetInfos: targets } = await browser.send('Target.getTargets');
    console.log('Handshake diagnostics', JSON.stringify({ failures, events: await evaluate(browser, panel, 'window.__audioEvents'), targets: targets.map(t => ({type:t.type,url:t.url})) }));
    for (const info of targets.filter(t => t.type === 'iframe')) {
      const session = await attach(browser, info.targetId);
      console.log('Frame', await evaluate(browser, session, "({url:location.href, ancestors:[...location.ancestorOrigins], video:!!document.querySelector('video'), controls:!!document.querySelector('#movie_player')})"));
    }
    throw error;
  }
  const { targetInfos } = await browser.send('Target.getTargets');
  const youtubeTarget = targetInfos.find(target => target.type === 'iframe' && target.url.startsWith(youtubeUrl));
  assert.ok(youtubeTarget, 'Embedded YouTube fixture target');
  const embedded = await attach(browser, youtubeTarget.targetId);
  await evaluate(browser, panel, `(() => {
    document.querySelector('[data-open="playlist"]').click();
    const input = document.querySelector('#video-url');
    input.value = 'https://youtu.be/dQw4w9WgXcQ';
    document.querySelector('#add-video').click();
  })()`);
  await until(() => evaluate(browser, panel, "document.querySelector('#player').dataset.videoId === 'dQw4w9WgXcQ'"), 'Fixture track load');
  assert.equal(await evaluate(browser, panel, "getComputedStyle(document.querySelector('.audio-connection')).display"), 'none', 'Connected player must not show the connection notice');
  const connectionLayout = await evaluate(browser, panel, `(() => {
    const notice = document.querySelector('.audio-connection');
    notice.hidden = false;
    const audio = document.querySelector('.audio-controls').getBoundingClientRect();
    const button = document.querySelector('#audio-connect').getBoundingClientRect();
    notice.hidden = true;
    return button.width > 0 && button.top >= audio.top && button.bottom <= audio.bottom && button.right <= audio.right;
  })()`);
  assert.ok(connectionLayout, 'Reconnect button fits within the volume row');
  const setVolume = value => evaluate(browser, panel, `(() => {const input=document.querySelector('#player-volume');input.value=${value};input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const video = expression => evaluate(browser, embedded, expression);
  await video("document.querySelector('button').dispatchEvent(new MouseEvent('click',{bubbles:true}))");
  assert.equal(await video("document.body.dataset.syntheticRejected"), 'true', 'Ad fixture rejects untrusted JavaScript clicks');
  await setVolume(27);
  await until(() => video("document.querySelector('video').volume === .27 && !document.querySelector('video').muted"), 'Actual media element volume');
  await evaluate(browser, panel, "document.querySelector('#player-mute').click()");
  await until(() => video("document.querySelector('video').muted"), 'Mute');
  await evaluate(browser, panel, "document.querySelector('#player-mute').click()");
  await until(() => video("!document.querySelector('video').muted && document.querySelector('video').volume === .27"), 'Unmute preserves volume');
  await video("window.postMessage({source:'pixel-jukebox-youtube-controls',version:1,type:'settings',volume:99,muted:false,autoSkip:true},'*')");
  assert.equal(await video("document.querySelector('video').volume"), .27, 'Untrusted same-frame message cannot control audio');
  assert.equal(await video("Number(document.body.dataset.clicks || 0)"), 0, 'Hidden disabled ads must not be skipped');
  await video("document.querySelector('button').hidden=false");
  await new Promise(resolveWait => setTimeout(resolveWait, 600));
  assert.equal(await video("Number(document.body.dataset.clicks || 0)"), 0, 'Visible disabled ads must not be skipped');
  await video("document.querySelector('button').disabled=false");
  await until(() => video("document.body.dataset.clicks === '1'"), 'Skippable ad auto click');
  assert.equal(await evaluate(browser, panel, "document.querySelector('#auto-skip-ads small').textContent"), 'ON', 'Trusted input is available');
  await evaluate(browser, panel, "document.querySelector('#auto-skip-ads').click()");
  await video("document.querySelector('#movie_player').classList.add('ad-showing')");
  await new Promise(resolveWait => setTimeout(resolveWait, 1700));
  assert.equal(await video("document.body.dataset.clicks"), '1', 'Auto skip OFF must not click');
  await evaluate(browser, panel, "document.querySelector('#auto-skip-ads').click()");
  await until(() => video("document.body.dataset.clicks === '2'"), 'Auto skip can be reenabled');
  await video(`(() => {
    const player = document.querySelector('#movie_player');
    const old = player.querySelector('button');
    const control = document.createElement('div');
    control.className = 'ytp-skip-ad-button';
    control.setAttribute('role', 'button');
    control.setAttribute('aria-label', '광고 건너뛰기');
    control.textContent = '건너뛰기';
    control.style.cssText = 'width:140px;height:32px';
    control.onclick = old.onclick;
    old.replaceWith(control);
    player.classList.add('ad-showing');
  })()`);
  await until(() => video("document.body.dataset.clicks === '3'"), 'Non-native role-button skip control');
  await video(`(() => {
    const player = document.querySelector('#movie_player');
    const old = player.querySelector('[role="button"]');
    const wrapper = document.createElement('div');
    wrapper.className = 'ytp-ad-skip-button-container';
    wrapper.style.opacity = '0';
    const control = document.createElement('button');
    control.textContent = 'Skip Ads';
    control.onclick = old.onclick;
    wrapper.append(control);
    old.replaceWith(wrapper);
    player.classList.remove('ad-showing');
  })()`);
  await new Promise(resolveWait => setTimeout(resolveWait, 600));
  assert.equal(await video("document.body.dataset.clicks"), '3', 'Invisible ancestor must prevent a click');
  await video("document.querySelector('.ytp-ad-skip-button-container').style.opacity='1'");
  await until(() => video("document.body.dataset.clicks === '4'"), 'Visible wrapper button without legacy ad-state class');
  await video(`(() => {
    const wrapper = document.querySelector('.ytp-ad-skip-button-container');
    const old = wrapper.querySelector('button');
    const control = document.createElement('button');
    control.setAttribute('aria-label', '광고 건너뛰기');
    control.textContent = '5초 후 광고 건너뛰기';
    control.setAttribute('aria-disabled', 'true');
    control.onclick = old.onclick;
    wrapper.replaceWith(control);
    const next = document.createElement('button');
    next.textContent = 'Skip intro';
    next.onclick = () => { document.body.dataset.wrongClick = 'true'; };
    document.querySelector('#movie_player').append(next);
  })()`);
  await new Promise(resolveWait => setTimeout(resolveWait, 1700));
  assert.equal(await video("document.body.dataset.clicks"), '4', 'Disabled semantic skip countdown must not click');
  await video("document.querySelector('button').removeAttribute('aria-disabled')");
  await new Promise(resolveWait => setTimeout(resolveWait, 600));
  assert.equal(await video("document.body.dataset.clicks"), '4', 'Countdown text must not be treated as a ready skip label');
  await video("document.querySelector('button').textContent='건너뛰기'");
  await until(() => video("document.body.dataset.clicks === '5'"), 'Korean skip label without legacy CSS classes');
  await video(`(() => {
    const old = document.querySelector('button');
    const control = document.createElement('div');
    control.setAttribute('role', 'button');
    control.innerHTML = '<span>Skip ads</span>';
    control.style.cssText = 'width:140px;height:32px';
    control.onclick = old.onclick;
    old.replaceWith(control);
  })()`);
  await until(() => video("document.body.dataset.clicks === '6'"), 'English skip text inside a role button without legacy CSS classes');
  await video(`(() => {
    const old = document.querySelector('#movie_player [role="button"]');
    const wrapper = document.createElement('div');
    wrapper.style.visibility = 'hidden';
    const button = document.createElement('button');
    button.className = 'ytp-skip-ad-button';
    button.textContent = '건너뛰기';
    button.onclick = old.onclick;
    wrapper.append(button);
    old.replaceWith(wrapper);
  })()`);
  await new Promise(resolveWait => setTimeout(resolveWait, 600));
  assert.equal(await video("document.body.dataset.clicks"), '6', 'Inherited hidden visibility must prevent clicking');
  await video("document.querySelector('.ytp-skip-ad-button').style.visibility='visible'");
  await until(() => video("document.body.dataset.clicks === '7'"), 'Visible skip button overriding a hidden ancestor must be clicked');
  await video(`(() => {
    const old = document.querySelector('.ytp-skip-ad-button');
    const slot = document.createElement('div');
    slot.className = 'ytp-ad-skip-button-slot';
    slot.id = 'skip-button:s';
    slot.innerHTML = '<span class="ytp-ad-skip-button-container ytp-ad-skip-button-container-detached"><button class="ytp-ad-skip-button-modern ytp-button"><div class="ytp-ad-text ytp-ad-skip-button-text-centered ytp-ad-skip-button-text" id="ad-text:t">건너뛰기</div><span class="ytp-ad-skip-button-icon-modern"><svg height="100%" viewBox="-6 -6 36 36" width="100%" aria-hidden="true" focusable="false"><path d="M5,18l10-6L5,6V18L5,18z M19,6h-2v12h2V6z" fill="#fff"></path></svg></span></button></span>';
    slot.querySelector('button').onclick = old.onclick;
    old.remove();
    document.body.append(slot);
  })()`);
  await until(() => video("document.body.dataset.clicks === '8'"), 'User skip markup detached from movie_player must be clicked');
  await video(`(() => {
    const old = document.querySelector('.ytp-ad-skip-button-slot');
    const slot = old.cloneNode(true);
    slot.querySelector('button').onclick = old.querySelector('button').onclick;
    slot.setAttribute('aria-hidden', 'true');
    slot.style.display = 'none';
    old.remove();
    document.querySelector('#movie_player').append(slot);
  })()`);
  await new Promise(resolveWait => setTimeout(resolveWait, 600));
  assert.equal(await video("document.body.dataset.clicks"), '8', 'CSS-hidden skip must remain unclicked with aria-hidden');
  await video("document.querySelector('.ytp-ad-skip-button-slot').style.display='block'");
  await until(() => video("document.body.dataset.clicks === '9'"), 'Visible skip inside movie_player must not be blocked by ancestor aria-hidden');
  await evaluate(browser, panel, "Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text)=>{window.__skipReport=JSON.parse(text)}}})");
  await until(() => evaluate(browser, panel, "(() => {document.querySelector('#copy-skip-diagnostics').click();return window.__skipReport?.history.some(item=>item.lastResult==='input-sent' && item.attempts>0);})()"), 'Copy diagnostics includes actual content-script detection and debugger result');
  const diagnostic = await evaluate(browser, panel, 'window.__skipReport');
  assert.equal(diagnostic.debuggerPermission, true);
  assert.equal(diagnostic.connected, true);
  assert.equal(diagnostic.build, 'debugger-v3');
  assert.equal(diagnostic.contentBuild, 'debugger-v3');
  assert.deepEqual(diagnostic.registeredScripts, ['youtube-controls-v3.js']);
  await video(`window.top.postMessage({source:'pixel-jukebox-youtube-controls',version:1,type:'ready'},'chrome-extension://${id}')`);
  await until(() => evaluate(browser, panel, "(() => {document.querySelector('#copy-skip-diagnostics').click();return window.__skipReport?.legacyReadyCount > 0;})()"), 'Legacy heartbeat is identified');
  assert.equal(await evaluate(browser, panel, 'window.__skipReport.contentBuild'), 'debugger-v3', 'Legacy heartbeat cannot overwrite verified content script identity');
  assert.ok(diagnostic.history.length <= 12, 'Diagnostic history stays bounded');
  await evaluate(browser, panel, "document.querySelector('#button-select').click()");
  await new Promise(resolveWait => setTimeout(resolveWait, 1700));
  assert.equal(await video("document.body.dataset.clicks"), '9', 'Hidden player menu must not receive debugger clicks');
  await evaluate(browser, panel, "document.querySelector('[data-open=\"now-playing\"]').click()");
  assert.equal(await video("document.body.dataset.wrongClick"), undefined, 'Unrelated skip controls must not click');
  await video("document.querySelector('video').remove();document.querySelector('#movie_player').prepend(document.createElement('video'))");
  await until(() => video("document.querySelector('video').volume === .27"), 'Replacement media retains volume');
  await evaluate(browser, panel, "document.querySelector('[data-open=\"now-playing\"]').click()");
  const { data } = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, panel);
  await writeFile(resolve(output, 'gameboy-volume.png'), data, 'base64');
  await browser.send('Page.reload', {}, panel);
  await until(() => evaluate(browser, panel, "document.querySelector('#player-volume')?.value === '27' && !document.querySelector('#player-volume').disabled"), 'Volume preference persists after reload');
  const { targetId: plainId } = await browser.send('Target.createTarget', { url: 'about:blank' });
  const plain = await attach(browser, plainId);
  await configure(plain);
  await browser.send('Page.navigate', { url: youtubeUrl }, plain);
  await until(() => evaluate(browser, plain, "Boolean(document.querySelector('video'))"), 'Unrelated YouTube page');
  await evaluate(browser, plain, "document.querySelector('button').hidden=false;document.querySelector('button').disabled=false");
  await new Promise(resolveWait => setTimeout(resolveWait, 800));
  assert.equal(await evaluate(browser, plain, "Number(document.body.dataset.clicks || 0)"), 0, 'Normal YouTube page must remain untouched');
  assert.deepEqual(failures, []);
  console.log('PASS real extension injection: volume, mute/unmute, persistence, replaced media, message origin checks');
  console.log('PASS ad fixture: visible enabled Skip only, disabled/hidden ignored, toggle OFF/ON, unrelated page untouched');
  console.log('PASS host: extension page fixture');
} finally {
  if (browser) { try { await browser.send('Browser.close'); } catch {} browser.close(); }
  if (child.exitCode === null) child.kill();
}
