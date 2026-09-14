import type { DesignSettings } from '../shared/settings';
import { defaultSettings } from '../shared/settings';
import {
  isPlayerBridgeEvent,
  PLAYER_BRIDGE_ORIGIN,
  PLAYER_BRIDGE_URL,
  playerBridgeCommand,
  playerBridgeInit,
  playerBridgeLoad,
} from '../shared/player-bridge';
import type { PlayerBridgeCommand } from '../shared/player-bridge';
import type { PlayerAction, PlayerSnapshot, PlaybackState, Track } from '../shared/track';
import { createAudioControls } from './audio';

type EmbeddedPlayerEvent =
  | { type: 'state'; state: PlaybackState; videoId: string | null; currentTime?: number }
  | { type: 'metadata'; videoId: string; videoTitle: string; channelTitle: string }
  | { type: 'error'; code: number; videoId: string | null };

export function playerErrorMessage(code: number | null): string {
  if (code === 100) return 'This video is unavailable or private.';
  if (code === 101 || code === 150) return 'This video does not allow embedded playback.';
  if (code === 153) return 'YouTube could not verify this player.';
  if (code === 5) return 'This video cannot play in the HTML5 player.';
  return 'Playback error.';
}

export function createPlayer(root: HTMLElement, onCommand: (action: PlayerAction) => void, onEmbeddedEvent: (event: EmbeddedPlayerEvent) => void, onRecommend: () => void = () => undefined) {
  root.innerHTML = `
    <div class="screen-bezel" id="lcd-screen">
      <div id="video-view">
      <div class="embedded-video"><iframe title="YouTube Player Bridge" allow="autoplay; encrypted-media; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
      <div class="now-playing">
        <div class="track-copy"><p class="eyebrow">NOW PLAYING</p>
          <h2 class="track-title">Paste a YouTube link to start.</h2>
          <p class="channel-title"></p><p class="playback-status" role="status" aria-live="polite"></p>
        </div>
        <button class="mini-disc" type="button" aria-label="Keep this vibe going" title="Keep This Vibe" aria-expanded="false" aria-controls="continue-drawer"><i aria-hidden="true"></i></button>
        <div class="track-controls" aria-label="Playback order controls">
          <button class="track-previous" type="button" aria-label="Previous track">◀ PREV</button>
          <button class="track-repeat" type="button" aria-label="Repeat current track" aria-pressed="false">↻ ONE</button>
          <button class="track-next" type="button" aria-label="Next track">NEXT ▶</button>
          <button class="track-queue" type="button" aria-label="Open playlist" aria-expanded="false">QUEUE</button>
        </div>
        <div class="audio-controls"><button id="player-mute" type="button" aria-label="Mute audio" aria-pressed="false" disabled>MUTE</button><label for="player-volume">VOL</label><input id="player-volume" type="range" min="0" max="100" step="1" value="100" aria-label="Volume" disabled /><output id="player-volume-value" for="player-volume">100</output><div class="audio-connection" hidden><span id="audio-connection-message" role="status"></span><button id="audio-connect" type="button" aria-describedby="audio-connection-message" title="Connect player controls">CONNECT</button></div></div>
      </div>
      <section class="now-playing-queue" aria-label="Now Playing playlist" aria-hidden="true" inert>
        <header><strong>PLAYLIST</strong><button class="now-playing-queue-close" type="button" aria-label="Close playlist">CLOSE</button></header>
        <div class="now-playing-queue-list"></div>
      </section>
      <section id="continue-drawer" class="now-playing-queue recommendation-drawer" aria-label="Keep This Vibe" aria-hidden="true" inert></section>
      </div>
    </div>
    <div class="control-deck">
      <div class="dpad" aria-label="Direction pad">
        <button id="dpad-up" type="button" aria-label="Up">▲</button>
        <button id="dpad-left" type="button" aria-label="Left">◀</button>
        <button id="dpad-right" type="button" aria-label="Right">▶</button>
        <button id="dpad-down" type="button" aria-label="Down">▼</button>
      </div>
      <div class="action-buttons">
        <label class="button-b"><button id="button-b" type="button" aria-label="Back"></button><span aria-hidden="true"><svg class="hardware-letter" viewBox="0 0 14 12"><path fill-rule="evenodd" d="M0 0H10L13 2V5L11 6L13 7V10L10 12H0ZM3 3V5H10V3ZM3 7V9H10V7Z"/></svg></span></label>
        <label class="button-a"><button id="button-a" type="button" aria-label="Confirm"></button><span aria-hidden="true"><svg class="hardware-letter" viewBox="0 0 14 12"><path fill-rule="evenodd" d="M0 12V3L3 0H11L14 3V12H11V8H3V12ZM3 3V5H11V3Z"/></svg></span></label>
      </div>
    </div>
    <div class="lower-deck">
      <div class="system-controls">
        <button id="button-select" class="system-button" type="button"><i></i><span>SELECT</span></button>
        <button id="button-start" class="system-button" type="button"><i></i><span>START</span></button>
      </div>
      <div class="speaker" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
    </div>`;
  const iframe = root.querySelector<HTMLIFrameElement>('iframe')!;
  createAudioControls(root, iframe, () => {
    if (loadedVideoId) activeLoad = playerBridgeLoad(loadedVideoId, shouldAutoplay, lastCurrentTime);
    iframe.src = PLAYER_BRIDGE_URL;
  });
  const title = root.querySelector<HTMLElement>('.track-title')!;
  const channel = root.querySelector<HTMLElement>('.channel-title')!;
  const status = root.querySelector<HTMLElement>('.playback-status')!;
  const disc = root.querySelector<HTMLButtonElement>('.mini-disc')!;
  const previous = root.querySelector<HTMLButtonElement>('.track-previous')!;
  const repeat = root.querySelector<HTMLButtonElement>('.track-repeat')!;
  const next = root.querySelector<HTMLButtonElement>('.track-next')!;
  let loadedVideoId = '';
  let bridgeReady = false;
  let activeLoad: PlayerBridgeCommand | null = null;
  let lastErrorCode: number | null = null;

  iframe.addEventListener('load', () => {
    bridgeReady = false;
    iframe.contentWindow?.postMessage(playerBridgeInit(), PLAYER_BRIDGE_ORIGIN);
  });
  iframe.src = PLAYER_BRIDGE_URL;

  function post(message: PlayerBridgeCommand) {
    if (!bridgeReady || !iframe.contentWindow) return;
    iframe.contentWindow.postMessage(message, PLAYER_BRIDGE_ORIGIN);
  }

  function load(track: Track, autoplay = true) {
    loadedVideoId = track.videoId;
    lastCurrentTime = 0;
    forwardedState = '';
    shouldAutoplay = autoplay;
    lastErrorCode = null;
    activeLoad = playerBridgeLoad(track.videoId, autoplay);
    if (activeLoad) post(activeLoad);
  }

  function command(action: 'play' | 'pause') {
    shouldAutoplay = action === 'play';
    syncDisc();
    post(playerBridgeCommand(action));
  }

  let hostWindow = root.ownerDocument.defaultView ?? window;
  let lastCurrentTime = 0;
  let shouldAutoplay = false;
  let forwardedState = '';
  let discFrame = 0;
  let discAngle = 0;
  let discVelocity = 0;
  let discTimestamp = 0;
  let discVisible = true;
  let discObserver: IntersectionObserver | undefined;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const animateDisc = (timestamp: number) => {
    const delta = Math.min(50, discTimestamp ? timestamp - discTimestamp : 16);
    discTimestamp = timestamp;
    const target = shouldAutoplay ? .11 : 0;
    discVelocity += (target - discVelocity) * Math.min(1, delta / (shouldAutoplay ? 240 : 700));
    discAngle = (discAngle + discVelocity * delta) % 360;
    disc.style.transform = `rotate(${discAngle}deg)`;
    if (shouldAutoplay || Math.abs(discVelocity) > .001) discFrame = hostWindow.requestAnimationFrame(animateDisc);
    else { discFrame = 0; discTimestamp = 0; }
  };
  const syncDisc = () => {
    if (discFrame) hostWindow.cancelAnimationFrame(discFrame);
    discFrame = 0; discTimestamp = 0;
    if (!reducedMotion.matches && discVisible && !hostWindow.document.hidden && (shouldAutoplay || Math.abs(discVelocity) > .001)) discFrame = hostWindow.requestAnimationFrame(animateDisc);
    else if (reducedMotion.matches) { discVelocity = 0; disc.style.transform = ''; }
  };
  const onVisibility = () => syncDisc();
  const observeDisc = () => {
    discObserver?.disconnect();
    const Observer = hostWindow.IntersectionObserver;
    if (!Observer) { discVisible = true; return; }
    discObserver = new Observer(([entry]) => { discVisible = Boolean(entry?.isIntersecting); syncDisc(); });
    discObserver.observe(disc);
  };
  const onMessage = (event: MessageEvent) => {
    if (event.origin !== PLAYER_BRIDGE_ORIGIN || event.source !== iframe.contentWindow || !isPlayerBridgeEvent(event.data)) return;
    if (event.data.type === 'ready') {
      bridgeReady = true;
      if (activeLoad) post(activeLoad);
      return;
    }
    if (event.data.type === 'state') {
      if (event.data.videoId && event.data.videoId !== loadedVideoId) return;
      lastErrorCode = null;
      if (event.data.currentTime !== undefined) lastCurrentTime = event.data.currentTime;
      const signature = `${event.data.videoId ?? ''}:${event.data.state}`;
      if (signature === forwardedState) return;
      forwardedState = signature;
      onEmbeddedEvent({ type: 'state', state: event.data.state, videoId: event.data.videoId ?? null, ...(event.data.currentTime !== undefined ? { currentTime: event.data.currentTime } : {}) });
    }
    if (event.data.type === 'metadata') onEmbeddedEvent({
      type: 'metadata',
      videoId: event.data.videoId,
      videoTitle: event.data.videoTitle,
      channelTitle: event.data.channelTitle,
    });
    if (event.data.type === 'error') {
      if (event.data.videoId && event.data.videoId !== loadedVideoId) return;
      lastErrorCode = event.data.code;
      forwardedState = '';
      onEmbeddedEvent({ type: 'error', code: event.data.code, videoId: event.data.videoId ?? null });
    }
  };
  hostWindow.addEventListener('message', onMessage);
  hostWindow.document.addEventListener('visibilitychange', onVisibility);
  reducedMotion.addEventListener('change', syncDisc);
  observeDisc();
  previous.addEventListener('click', () => onCommand('previous'));
  repeat.addEventListener('click', () => onCommand('repeat-one'));
  next.addEventListener('click', () => onCommand('next'));
  disc.addEventListener('click', onRecommend);

  return {
    load,
    render(snapshot: PlayerSnapshot, _settings: DesignSettings = defaultSettings, playlistNavigation: { previous: boolean; next: boolean; repeatOne?: boolean } = { previous: false, next: false }) {
      const track = snapshot.track;
      const playing = track?.playbackState === 'playing';
      shouldAutoplay = playing || track?.playbackState === 'buffering';
      syncDisc();
      root.dataset.videoId = track?.videoId ?? '';
      root.dataset.playbackState = track?.playbackState ?? '';
      title.textContent = track?.videoTitle ?? 'Paste a YouTube link to start.';
      channel.textContent = track?.channelTitle ? `CHANNEL · ${track.channelTitle}` : '';
      status.textContent = snapshot.error ? playerErrorMessage(lastErrorCode) : '';
      status.classList.toggle('error-text', snapshot.error);
      previous.disabled = !track || !playlistNavigation.previous;
      next.disabled = !track || !playlistNavigation.next;
      repeat.disabled = !track;
      disc.disabled = !track;
      repeat.setAttribute('aria-pressed', String(Boolean(playlistNavigation.repeatOne)));
    },
    command,
    moveTo(container: HTMLElement, before: Node | null = null) {
      if (loadedVideoId) activeLoad = playerBridgeLoad(loadedVideoId, shouldAutoplay, lastCurrentTime);
      if (discFrame) hostWindow.cancelAnimationFrame(discFrame);
      hostWindow.removeEventListener('message', onMessage);
      hostWindow.document.removeEventListener('visibilitychange', onVisibility);
      discObserver?.disconnect();
      container.insertBefore(root, before);
      hostWindow = root.ownerDocument.defaultView ?? window;
      hostWindow.addEventListener('message', onMessage);
      hostWindow.document.addEventListener('visibilitychange', onVisibility);
      observeDisc();
      syncDisc();
    },
    get loadedVideoId() { return loadedVideoId; },
  };
}
