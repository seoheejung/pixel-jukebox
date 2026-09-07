import { emptySnapshot, isThumbnail, videoIdFromUrl } from '../shared/track';
import type { PlayerAction, PlayerSnapshot, PlaybackState } from '../shared/track';

// Chrome 실측 기준: docs/results/phase1-youtube-player.md
export const SELECTOR = {
  metadata: 'ytd-watch-metadata',
  title: 'h1',
  channel: 'ytd-channel-name a',
  image: 'meta[property="og:image"]',
  video: '#movie_player video.html5-main-video',
  previous: '#movie_player .ytp-prev-button',
  next: '#movie_player .ytp-next-button',
} as const;

function available(element: Element | null): element is HTMLElement {
  return element !== null && element.getAttribute('aria-disabled') !== 'true' && !element.hasAttribute('disabled');
}

function playbackState(video: HTMLVideoElement): PlaybackState {
  if (video.error) return 'error';
  if (video.ended) return 'ended';
  if (video.paused) return 'paused';
  return video.readyState >= 3 ? 'playing' : 'buffering';
}

export function readYouTube(document: Document, href: string): PlayerSnapshot {
  const videoId = videoIdFromUrl(href);
  const metadata = document.querySelector(SELECTOR.metadata);
  const video = document.querySelector<HTMLVideoElement>(SELECTOR.video);
  // SPA 전환 중 이전 영상 메타데이터 혼합 방지
  if (!videoId || !video || metadata?.getAttribute('video-id') !== videoId) return emptySnapshot();
  const title = metadata.querySelector(SELECTOR.title)?.textContent?.trim();
  const channel = metadata.querySelector(SELECTOR.channel)?.textContent?.trim();
  if (!title || !channel) return emptySnapshot();
  const image = document.querySelector(SELECTOR.image)?.getAttribute('content') ?? '';
  return {
    track: {
      videoId,
      videoTitle: title.slice(0, 500),
      channelTitle: channel.slice(0, 200),
      thumbnail: isThumbnail(image, videoId) ? image : '',
      videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
      playbackState: playbackState(video),
    },
    previous: available(document.querySelector(SELECTOR.previous)),
    next: available(document.querySelector(SELECTOR.next)),
    error: Boolean(video.error),
  };
}

export async function controlYouTube(document: Document, href: string, videoId: string, action: PlayerAction): Promise<void> {
  if (videoIdFromUrl(href) !== videoId) throw new Error('STALE_TRACK');
  if (action === 'toggle') {
    const video = document.querySelector<HTMLVideoElement>(SELECTOR.video);
    if (!video) throw new Error('NO_VIDEO');
    if (video.paused) await video.play();
    else video.pause();
    return;
  }
  const control = document.querySelector<HTMLElement>(SELECTOR[action]);
  if (!available(control)) throw new Error('UNAVAILABLE_CONTROL');
  control.click();
}

export function observeYouTube(document: Document, window: Window, onChange: (snapshot: PlayerSnapshot) => void) {
  let last = '';
  let scheduled: number | undefined;
  let video: HTMLVideoElement | null = null;
  let controlError = false;
  const mediaEvents = ['play', 'pause', 'playing', 'waiting', 'ended', 'loadedmetadata', 'emptied', 'error'];
  const publish = (force = false) => {
    const current = document.querySelector<HTMLVideoElement>(SELECTOR.video);
    if (current !== video) {
      for (const event of mediaEvents) video?.removeEventListener(event, onMedia);
      video = current;
      for (const event of mediaEvents) video?.addEventListener(event, onMedia);
    }
    const snapshot = readYouTube(document, window.location.href);
    snapshot.error ||= controlError;
    const next = JSON.stringify(snapshot);
    if (force || next !== last) { last = next; onChange(snapshot); }
  };
  const onMedia = () => { controlError = false; publish(); };
  const schedule = () => {
    if (scheduled !== undefined) return;
    scheduled = window.setTimeout(() => { scheduled = undefined; publish(); }, 100);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['video-id', 'content', 'aria-disabled'] });
  document.addEventListener('yt-navigate-finish', schedule);
  window.addEventListener('popstate', schedule);
  const timer = window.setInterval(() => publish(), 1000);
  publish();
  return {
    publish: () => publish(true),
    error: () => { controlError = true; publish(true); },
    stop: () => {
      observer.disconnect();
      window.clearInterval(timer);
      if (scheduled !== undefined) window.clearTimeout(scheduled);
      for (const event of mediaEvents) video?.removeEventListener(event, onMedia);
      document.removeEventListener('yt-navigate-finish', schedule);
      window.removeEventListener('popstate', schedule);
    },
  };
}

export async function restartYouTube(document: Document, href: string, videoId: string) {
  if (videoIdFromUrl(href) !== videoId) throw new Error('STALE_TRACK');
  const video = document.querySelector<HTMLVideoElement>(SELECTOR.video);
  if (!video) throw new Error('NO_VIDEO');
  video.currentTime = 0;
  await video.play();
}
