import assert from 'node:assert/strict';
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
    const input = document.querySelector('#video-url');
    input.value = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    document.querySelector('#add-video').click();
  })()`, { userGesture: true });

  await until(() => evaluate(browser, panel, "document.querySelector('.track-title')?.textContent !== 'YouTube video dQw4w9WgXcQ'"), 'Bridge metadata', 40000);
  const metadata = await evaluate(browser, panel, `({
    title: document.querySelector('.track-title')?.textContent,
    channel: document.querySelector('.channel-title')?.textContent,
    status: document.querySelector('.playback-status')?.textContent,
    action: document.querySelector('.toggle')?.getAttribute('aria-label'),
  })`);
  assert.match(metadata.title, /Never Gonna Give You Up/i);
  assert.match(metadata.channel, /Rick Astley/i);
  assert.notEqual(metadata.status, 'Playback error.');

  const layout = await evaluate(browser, panel, `(() => {
    const video = document.querySelector('.embedded-video');
    const disc = document.querySelector('.disc');
    const panel = document.querySelector('.pixel-panel');
    const button = document.querySelector('button');
    return {
      videoHeight: video?.getBoundingClientRect().height,
      discWidth: disc?.getBoundingClientRect().width,
      panelBorder: panel && getComputedStyle(panel).borderTopWidth,
      buttonBorder: button && getComputedStyle(button).borderTopWidth,
    };
  })()`);
  assert.ok(layout.videoHeight >= 190 && layout.videoHeight <= 220);
  assert.ok(layout.discWidth >= 180 && layout.discWidth <= 220);
  assert.equal(layout.panelBorder, '1px');
  assert.equal(layout.buttonBorder, '1px');

  if (metadata.action !== 'Pause') {
    await evaluate(browser, panel, "document.querySelector('.toggle').click()", { userGesture: true });
  }
  await until(() => evaluate(browser, panel, "document.querySelector('.toggle')?.getAttribute('aria-label') === 'Pause'"), 'Bridge playback', 40000);

  const { targetInfos } = await browser.send('Target.getTargets');
  assert.ok(targetInfos.some((target) => target.url.startsWith('https://seoheejung.github.io/pixel-jukebox/player.html')));
  assert.equal(targetInfos.some((target) => target.type === 'page' && target.url.includes('youtube.com/watch')), false);
  console.log(`PASS: ${metadata.title} / ${metadata.channel}`);
  console.log('PASS: Bridge playback state without a YouTube tab');
  console.log(`PASS: Compact layout (${layout.videoHeight}px player / ${layout.discWidth}px disc)`);
} finally {
  try { await browser.send('Browser.close'); } catch { }
  browser.close();
}
