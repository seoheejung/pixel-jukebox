import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { attach, connectBrowser, evaluate, until } from './cdp.mjs';

const browser = await connectBrowser();
try {
  const { id } = await browser.send('Extensions.loadUnpacked', { path: resolve('dist') });
  const panelUrl = `chrome-extension://${id}/sidepanel.html`;
  const { targetId } = await browser.send('Target.createTarget', { url: panelUrl });
  const panel = await attach(browser, targetId);
  await until(() => evaluate(browser, panel, "document.readyState === 'complete' && Boolean(document.querySelector('#video-url'))"), 'Extension page');
  await evaluate(browser, panel, `(() => {
    window.__playbackState = '';
    window.addEventListener('message', (event) => {
      if (event.source === document.querySelector('iframe').contentWindow && event.origin === 'https://seoheejung.github.io' && event.data?.type === 'state') window.__playbackState = event.data.state;
    });
    const input = document.querySelector('#video-url');
    input.value = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    document.querySelector('#add-video').click();
  })()`, { userGesture: true });

  await until(() => evaluate(browser, panel, "/Never Gonna Give You Up/i.test(document.querySelector('.track-title')?.textContent ?? '')"), 'Bridge metadata', 40000);
  await until(() => evaluate(browser, panel, "window.__playbackState === 'playing' || window.__playbackState === 'paused'"), 'Bridge state', 40000);
  if (await evaluate(browser, panel, "window.__playbackState !== 'playing'")) {
    await evaluate(browser, panel, "document.querySelector('.toggle').click()", { userGesture: true });
  }
  await until(() => evaluate(browser, panel, "window.__playbackState === 'playing'"), 'Actual playing state', 40000);
  await evaluate(browser, panel, "document.querySelector('.toggle').click()", { userGesture: true });
  await until(() => evaluate(browser, panel, "window.__playbackState === 'paused'"), 'Pause command');

  await mkdir(resolve('.chrome-test'), { recursive: true });
  for (const width of [320, 390, 480]) {
    await browser.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false }, panel);
    const layout = await evaluate(browser, panel, `(() => {
      const frame = document.querySelector('.embedded-video iframe');
      const bounds = frame.getBoundingClientRect();
      const points = [[bounds.left + 1, bounds.top + 1], [bounds.right - 1, bounds.top + 1], [bounds.left + 1, bounds.bottom - 1], [bounds.right - 1, bounds.bottom - 1], [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2]];
      return {
        width: bounds.width, height: bounds.height,
        unobscured: points.every(([x, y]) => document.elementFromPoint(x, y) === frame),
        overflow: document.documentElement.scrollWidth > innerWidth,
        disc: Boolean(document.querySelector('.disc')),
        controls: document.querySelectorAll('#player .playback-controls button').length,
        metadataBottom: document.querySelector('.now-playing').getBoundingClientRect().bottom,
        find: document.querySelector('#ai-picks').textContent,
      };
    })()`);
    assert.ok(layout.width >= 200 && layout.height >= 200, JSON.stringify(layout));
    assert.equal(layout.unobscured, true);
    assert.equal(layout.overflow, false);
    assert.equal(layout.disc, false);
    assert.equal(layout.controls, 3);
    assert.ok(layout.metadataBottom < 900);
    assert.equal(layout.find, 'FIND');
    const { data } = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, panel);
    await writeFile(resolve(`.chrome-test/gameboy-${width}.png`), data, 'base64');
    console.log(`PASS: ${width}px panel, ${layout.width}×${layout.height}px unobscured player`);
  }

  const { targetInfos } = await browser.send('Target.getTargets');
  const bridgeTarget = targetInfos.find((target) => target.url.startsWith('https://seoheejung.github.io/pixel-jukebox/player.html'));
  assert.ok(bridgeTarget);
  assert.equal(targetInfos.some((target) => target.type === 'page' && target.url.includes('youtube.com/watch')), false);
  const bridge = await attach(browser, bridgeTarget.targetId);
  await evaluate(browser, bridge, `window.parent.postMessage({
    source: 'pixel-jukebox-player-bridge', version: 1, type: 'error', code: 150,
  }, 'chrome-extension://${id}')`);
  await until(() => evaluate(browser, panel, "document.querySelector('.playback-status')?.textContent === 'This video does not allow embedded playback.'"), 'Specific playback error');
  console.log('PASS: Actual playing/pause states, metadata, no YouTube tab, error 150 guidance');
} finally {
  try { await browser.send('Browser.close'); } catch { }
  browser.close();
}
