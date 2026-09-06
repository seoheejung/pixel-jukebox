import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { attach, connectBrowser, evaluate, until } from './cdp.mjs';

const browser = await connectBrowser();
try {
  const { id } = await browser.send('Extensions.loadUnpacked', { path: resolve('dist') });
  const firstId = 'dQw4w9WgXcQ';
  const { targetId } = await browser.send('Target.createTarget', { url: `https://www.youtube.com/watch?v=${firstId}&list=RD${firstId}&start_radio=1` });
  const youtube = await attach(browser, targetId);
  const ready = (session) => until(() => evaluate(browser, session, "Boolean(document.querySelector('ytd-watch-metadata ytd-channel-name a')?.textContent.trim()) && document.querySelector('video')?.readyState >= 3"), 'YouTube playable metadata', 30000);
  await ready(youtube);
  const { targetInfos: tabs } = await browser.send('Target.getTargets', { filter: [{ type: 'tab' }] });
  const tab = tabs.find((item) => item.url.includes(firstId));
  await browser.send('Extensions.triggerAction', { id, targetId: tab.targetId });
  const panelTarget = await until(async () => (await browser.send('Target.getTargets')).targetInfos.find((target) => target.url === `chrome-extension://${id}/sidepanel.html`), 'Side Panel');
  const panel = await attach(browser, panelTarget.targetId);
  const panelId = () => evaluate(browser, panel, "document.querySelector('#player')?.dataset.videoId");
  const currentId = () => evaluate(browser, youtube, "new URL(location.href).searchParams.get('v')");
  await until(async () => await panelId() === firstId, 'first track');
  await until(() => evaluate(browser, panel, "document.querySelector('.artwork').naturalWidth > 0"), 'thumbnail loaded');
  assert.match(await evaluate(browser, panel, "document.querySelector('.channel-title').textContent"), /Rick Astley/);
  console.log('PASS: actual video ID, title, channel and thumbnail');

  await evaluate(browser, youtube, "document.querySelector('video').pause()");
  await until(() => evaluate(browser, panel, "document.querySelector('.toggle').getAttribute('aria-label') === '재생'"), 'pause state');
  assert.equal(await evaluate(browser, panel, "getComputedStyle(document.querySelector('.disc')).animationPlayState"), 'paused');
  await evaluate(browser, panel, "document.querySelector('.toggle').click()", { userGesture: true });
  await until(() => evaluate(browser, youtube, "!document.querySelector('video').paused"), 'panel play control');
  await until(() => evaluate(browser, panel, "getComputedStyle(document.querySelector('.disc')).animationPlayState === 'running'"), 'disc rotation');
  await evaluate(browser, panel, "document.querySelector('.toggle').click()", { userGesture: true });
  await until(() => evaluate(browser, youtube, "document.querySelector('video').paused"), 'panel pause control');
  console.log('PASS: actual Play/Pause controller and rotation synchronization');

  await evaluate(browser, youtube, "window.__pixelSpaCount = 0; document.addEventListener('yt-navigate-finish', () => window.__pixelSpaCount++);");
  const origin = await evaluate(browser, youtube, 'performance.timeOrigin');
  await until(() => evaluate(browser, panel, "!document.querySelector('.next').disabled"), 'native Next available');
  await evaluate(browser, panel, "document.querySelector('.next').click()", { userGesture: true });
  await until(async () => { const value = await currentId(); return value && value !== firstId && await panelId() === value; }, 'native Next SPA track update', 30000);
  const nextId = await currentId();
  assert.equal(await evaluate(browser, youtube, 'performance.timeOrigin'), origin);
  assert.ok(await evaluate(browser, youtube, 'window.__pixelSpaCount') > 0);
  console.log('PASS: actual YouTube Next and SPA transition without page reload');

  const previousAvailable = await evaluate(browser, panel, "!document.querySelector('.previous').disabled");
  if (previousAvailable) {
    await evaluate(browser, panel, "document.querySelector('.previous').click()", { userGesture: true });
    await until(async () => await panelId() === firstId, 'native Previous', 30000);
    console.log('PASS: actual YouTube Previous controller');
  } else {
    console.log('UNVERIFIED: native Previous is unavailable in this YouTube session; disabled UI verified');
    await evaluate(browser, youtube, 'history.back()');
    await until(async () => await panelId() === firstId, 'browser Back', 30000);
  }

  const navigation = await browser.send('Page.getNavigationHistory', {}, youtube);
  const currentEntry = navigation.entries[navigation.currentIndex];
  const neighbor = navigation.entries[navigation.currentIndex + 1] ?? navigation.entries[navigation.currentIndex - 1];
  assert.ok(neighbor && new URL(neighbor.url).searchParams.get('v'), 'YouTube history entry');
  await browser.send('Page.navigateToHistoryEntry', { entryId: neighbor.id }, youtube);
  await until(async () => await panelId() === new URL(neighbor.url).searchParams.get('v'), 'history navigation');
  await browser.send('Page.navigateToHistoryEntry', { entryId: currentEntry.id }, youtube);
  await until(async () => await panelId() === firstId, 'history restored');
  console.log('PASS: actual browser Back/Forward track synchronization');

  await ready(youtube);
  await evaluate(browser, youtube, `(async () => {
    const video = document.querySelector('video');
    if (!Number.isFinite(video.duration) || video.duration < 1) throw new Error('No seekable video');
    video.muted = true;
    video.currentTime = video.duration - 0.5;
    await video.play();
  })()`, { userGesture: true });
  await until(async () => { const value = await currentId(); return value && value !== firstId && await panelId() === value; }, 'native YouTube autoplay after media end', 30000);
  console.log('PASS: actual YouTube playlist autoplay after seeking to media end');

  const secondId = await currentId() === '4Ygvv_Ae3dg' ? firstId : '4Ygvv_Ae3dg';
  const secondUrl = `https://www.youtube.com/watch?v=${secondId}`;
  const { targetId: secondTarget } = await browser.send('Target.createTarget', { url: secondUrl });
  const second = await attach(browser, secondTarget);
  await ready(second);
  const secondTitle = await evaluate(browser, second, "document.querySelector('ytd-watch-metadata h1').textContent.trim()");
  await until(() => evaluate(browser, panel, `[...document.querySelector('#tab-select').options].some(option => option.textContent.includes(${JSON.stringify(secondTitle)}))`), 'second tab state');
  await evaluate(browser, youtube, "document.querySelector('video').pause()");
  await evaluate(browser, second, "document.querySelector('video').pause()");
  await evaluate(browser, panel, `(() => {
    const select = document.querySelector('#tab-select');
    select.value = [...select.options].find(option => option.textContent.includes(${JSON.stringify(secondTitle)})).value;
    select.dispatchEvent(new Event('change'));
  })()`);
  await until(async () => await panelId() === secondId, 'second tab selected');
  await until(() => evaluate(browser, panel, "document.querySelector('.toggle').getAttribute('aria-label') === '재생'"), 'second tab paused');
  await evaluate(browser, panel, "document.querySelector('.toggle').click()", { userGesture: true });
  await until(() => evaluate(browser, second, "!document.querySelector('video').paused"), 'selected second tab playback');
  assert.equal(await evaluate(browser, youtube, "document.querySelector('video').paused"), true);
  console.log('PASS: two actual YouTube tabs; controls affect only the selected tab');
  const { cssContentSize } = await browser.send('Page.getLayoutMetrics', {}, panel);
  const capture = { captureBeyondViewport: true, clip: { ...cssContentSize, scale: 1 } };
  const { data } = await browser.send('Page.captureScreenshot', capture, panel);
  writeFileSync('.chrome-test/phase1-lp.png', Buffer.from(data, 'base64'));
  await evaluate(browser, panel, "document.querySelector('.disc').dataset.style = 'cd'");
  const cd = await browser.send('Page.captureScreenshot', capture, panel);
  writeFileSync('.chrome-test/phase1-cd.png', Buffer.from(cd.data, 'base64'));
  await evaluate(browser, panel, "document.querySelector('.disc').dataset.style = 'lp'");
  writeFileSync('.chrome-test/phase1.json', JSON.stringify({ browser: browser.version, initialTrack: firstId, nextTrack: nextId, metadata: true, artwork: true, playPause: true, rotation: true, spa: true, historyNavigation: true, nativeAutoplay: true, nativePrevious: previousAvailable, tabIsolation: true }, null, 2));
} finally {
  browser.close();
}
