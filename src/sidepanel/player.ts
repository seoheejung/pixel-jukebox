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

type EmbeddedPlayerEvent =
  | { type: 'state'; state: PlaybackState }
  | { type: 'metadata'; videoId: string; videoTitle: string; channelTitle: string };

export function createPlayer(root: HTMLElement, onCommand: (action: PlayerAction) => void, onEmbeddedEvent: (event: EmbeddedPlayerEvent) => void) {
  root.innerHTML = `
    <div class="embedded-video"><iframe title="YouTube Player Bridge" allow="autoplay; encrypted-media; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
    <div class="disc-stage"><div class="disc" data-style="lp" data-playing="false" aria-label="LP disc">
      <div class="disc-label"><img class="artwork" alt="Current video thumbnail" referrerpolicy="no-referrer" hidden /></div><div class="disc-hole"></div>
    </div></div>
    <p class="eyebrow">NOW PLAYING</p>
    <h2 class="track-title">Paste a YouTube link to start.</h2>
    <p class="channel-title"></p>
    <p class="playback-status" role="status" aria-live="polite"></p>
    <div class="playback-controls">
      <button class="previous" type="button" aria-label="Previous" title="Previous" disabled>◀</button>
      <button class="toggle" type="button" aria-label="Play" disabled><span class="play-icon">▶</span><span class="pause-icon">Ⅱ</span></button>
      <button class="next" type="button" aria-label="Next" title="Next" disabled>▶</button>
    </div>`;
  const iframe = root.querySelector<HTMLIFrameElement>('iframe')!;
  const disc = root.querySelector<HTMLElement>('.disc')!;
  const title = root.querySelector<HTMLElement>('.track-title')!;
  const channel = root.querySelector<HTMLElement>('.channel-title')!;
  const status = root.querySelector<HTMLElement>('.playback-status')!;
  const artwork = root.querySelector<HTMLImageElement>('.artwork')!;
  const buttons = Object.fromEntries(['previous', 'toggle', 'next'].map((action) => [action, root.querySelector<HTMLButtonElement>(`.${action}`)!])) as Record<PlayerAction, HTMLButtonElement>;
  for (const action of ['previous', 'toggle', 'next'] as const) buttons[action].addEventListener('click', () => onCommand(action));
  artwork.addEventListener('error', () => { artwork.hidden = true; });
  let imageUrl = '';
  let loadedVideoId = '';
  let bridgeReady = false;
  let activeLoad: PlayerBridgeCommand | null = null;

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
    activeLoad = playerBridgeLoad(track.videoId, autoplay);
    if (activeLoad) post(activeLoad);
  }

  function command(action: 'play' | 'pause') {
    post(playerBridgeCommand(action));
  }

  window.addEventListener('message', (event) => {
    if (event.origin !== PLAYER_BRIDGE_ORIGIN || event.source !== iframe.contentWindow || !isPlayerBridgeEvent(event.data)) return;
    if (event.data.type === 'ready') {
      bridgeReady = true;
      if (activeLoad) post(activeLoad);
      return;
    }
    if (event.data.type === 'state') onEmbeddedEvent({ type: 'state', state: event.data.state });
    if (event.data.type === 'metadata') onEmbeddedEvent({
      type: 'metadata',
      videoId: event.data.videoId,
      videoTitle: event.data.videoTitle,
      channelTitle: event.data.channelTitle,
    });
    if (event.data.type === 'error') onEmbeddedEvent({ type: 'state', state: 'error' });
  });

  return {
    load,
    render(snapshot: PlayerSnapshot, settings: DesignSettings = defaultSettings, playlistNavigation = { previous: false, next: false }) {
      const track = snapshot.track;
      const playing = track?.playbackState === 'playing';
      disc.dataset.playing = String(playing);
      disc.dataset.style = settings.discStyle;
      disc.style.setProperty('--disc-accent', settings.accent);
      root.dataset.videoId = track?.videoId ?? '';
      title.textContent = track?.videoTitle ?? 'Paste a YouTube link to start.';
      channel.textContent = track?.channelTitle ? `CHANNEL · ${track.channelTitle}` : '';
      status.textContent = snapshot.error ? 'Playback error.' : '';
      status.classList.toggle('error-text', snapshot.error);
      if ((track?.thumbnail ?? '') !== imageUrl) {
        imageUrl = track?.thumbnail ?? '';
        artwork.hidden = !imageUrl;
        if (imageUrl) artwork.src = imageUrl;
        else artwork.removeAttribute('src');
      }
      buttons.previous.disabled = !track || !playlistNavigation.previous;
      buttons.next.disabled = !track || !playlistNavigation.next;
      buttons.toggle.disabled = !track;
      buttons.toggle.setAttribute('aria-label', playing || track?.playbackState === 'buffering' ? 'Pause' : 'Play');
      buttons.toggle.dataset.playing = String(playing || track?.playbackState === 'buffering');
    },
    command,
    get loadedVideoId() { return loadedVideoId; },
  };
}
