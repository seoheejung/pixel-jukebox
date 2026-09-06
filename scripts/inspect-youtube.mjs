import { mkdirSync, writeFileSync } from 'node:fs';
import { attach, connectBrowser, evaluate, until } from './cdp.mjs';

const browser = await connectBrowser();
try {
  const { targetId } = await browser.send('Target.createTarget', { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  const session = await attach(browser, targetId);
  await until(() => evaluate(browser, session, "document.readyState === 'complete' && Boolean(document.querySelector('video')) && Boolean(document.querySelector('ytd-watch-metadata ytd-channel-name a')?.textContent.trim())"), 'YouTube video metadata DOM', 30000);
  const result = await evaluate(browser, session, `(() => {
    const video = document.querySelector('video');
    return {
      url: location.href,
      headings: [...document.querySelectorAll('h1')].map(e => ({text: e.textContent, html: e.outerHTML.slice(0, 800)})),
      meta: [...document.querySelectorAll('meta[property], meta[itemprop], link[rel="canonical"]')].map(e => e.outerHTML).slice(0, 30),
      channelLinks: [...document.querySelectorAll('a[href]')].filter(e => /^\\/(channel\\/|@)/.test(e.getAttribute('href')) && e.textContent.trim()).slice(0, 5).map(e => ({text: e.textContent.trim(), html: e.outerHTML.slice(0, 500), parent: e.parentElement.outerHTML.slice(0, 1000)})),
      video: {html: video.outerHTML.slice(0, 600), paused: video.paused, readyState: video.readyState, error: video.error?.code},
      containers: [...document.querySelectorAll('[video-id]')].slice(0, 5).map(e => ({tag: e.tagName, id: e.id, videoId: e.getAttribute('video-id')})),
      scopedChannel: document.querySelector('ytd-watch-metadata ytd-channel-name a')?.textContent,
      playerAncestors: [video.parentElement, video.parentElement.parentElement].map(e => ({tag: e.tagName, id: e.id, class: e.className})),
      buttons: [...document.querySelectorAll('#movie_player button, #movie_player a')].filter(e => /play|prev|next/.test(e.className)).map(e => ({tag: e.tagName, class: e.className, label: e.getAttribute('aria-label'), href: e.getAttribute('href'), disabled: e.getAttribute('aria-disabled'), display: getComputedStyle(e).display})),
    };
  })()`);
  mkdirSync('.chrome-test', { recursive: true });
  writeFileSync('.chrome-test/youtube-dom.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  browser.close();
}
