import { isCoreStateMessage, MESSAGE, MESSAGE_AI, PORT } from '../shared/messages';
import { isAiRecommendationErrorMessage, isAiRecommendationsMessage, isAiStateMessage, OPENAI_API_KEY, OPENAI_ORIGIN } from '../shared/ai';
import type { AiState } from '../shared/ai';
import { recommendationTrack } from '../shared/recommendation';
import type { Recommendation } from '../shared/recommendation';
import { adjacentTrack, playlistTrack } from '../shared/playlist';
import { applyDesign, defaultSettings, isDesignSettings } from '../shared/settings';
import type { DesignSettings } from '../shared/settings';
import { emptySnapshot, trackFromVideoId, videoIdFromUrl } from '../shared/track';
import type { PlayerAction, PlayerSnapshot, Track } from '../shared/track';
import type { CoreState } from '../shared/storage';
import { openPip } from './pip';
import { createPlayer } from './player';
import './style.css';

const videoUrl = document.querySelector<HTMLInputElement>('#video-url')!;
const addVideo = document.querySelector<HTMLButtonElement>('#add-video')!;
const videoMessage = document.querySelector<HTMLParagraphElement>('#video-message')!;
const playlistList = document.querySelector<HTMLDivElement>('#playlist-list')!;
const playlistEmpty = document.querySelector<HTMLParagraphElement>('#playlist-empty')!;
const openPipButton = document.querySelector<HTMLButtonElement>('#open-pip')!;
const discStyle = document.querySelector<HTMLSelectElement>('#disc-style')!;
const background = document.querySelector<HTMLInputElement>('#background')!;
const accent = document.querySelector<HTMLInputElement>('#accent')!;
const saveDesign = document.querySelector<HTMLButtonElement>('#save-design')!;
const aiKey = document.querySelector<HTMLInputElement>('#ai-key')!;
const aiConnect = document.querySelector<HTMLButtonElement>('#ai-connect')!;
const aiMessage = document.querySelector<HTMLParagraphElement>('#ai-message')!;
const aiPicks = document.querySelector<HTMLButtonElement>('#ai-picks')!;
const aiPicksMessage = document.querySelector<HTMLParagraphElement>('#ai-picks-message')!;
const aiPicksList = document.querySelector<HTMLDivElement>('#ai-picks-list')!;
const aiSettings = document.querySelector<HTMLDetailsElement>('.ai-settings')!;

let currentPort: chrome.runtime.Port | undefined;
let snapshot: PlayerSnapshot = emptySnapshot();
let coreState: CoreState = { playlist: [], settings: { ...defaultSettings } };
let draftSettings: DesignSettings = { ...defaultSettings };
let aiState: AiState = { configured: false, persisted: false, permission: false, trustedContexts: false };
let hasRecommendations = false;
let pendingRecommendations = false;
let bridgeMetadataTrack: Track | undefined;
let pip: { update(snapshot: PlayerSnapshot, settings: DesignSettings): void; close(): void } | undefined;

function send(message: object) {
  try { currentPort?.postMessage(message); } catch { videoMessage.textContent = 'CONNECTION LOST.'; }
}

function playlistTrackFor(track: Track) {
  return playlistTrack(track);
}

function persistBridgeMetadata() {
  if (!bridgeMetadataTrack) return;
  const stored = coreState.playlist.find((item) => item.videoId === bridgeMetadataTrack?.videoId);
  if (!stored) return;
  if (stored.videoTitle === bridgeMetadataTrack.videoTitle && stored.channelTitle === bridgeMetadataTrack.channelTitle) {
    bridgeMetadataTrack = undefined;
    return;
  }
  send({ type: MESSAGE.coreEdit, change: { kind: 'update', track: playlistTrackFor(bridgeMetadataTrack) } });
}

function renderPlaylist() {
  playlistEmpty.hidden = coreState.playlist.length > 0;
  playlistList.replaceChildren(...coreState.playlist.map((track, index) => {
    const row = document.createElement('div');
    row.className = 'playlist-row';
    row.draggable = true;
    row.dataset.videoId = track.videoId;
    row.setAttribute('role', 'listitem');
    if (snapshot.track?.videoId === track.videoId) row.classList.add('current');
    row.addEventListener('dragstart', (event) => {
      event.dataTransfer?.setData('text/plain', track.videoId);
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => row.classList.remove('dragging'));
    row.addEventListener('dragover', (event) => event.preventDefault());
    row.addEventListener('drop', (event) => {
      event.preventDefault();
      const videoId = event.dataTransfer?.getData('text/plain');
      if (videoId && videoId !== track.videoId) send({ type: MESSAGE.coreEdit, change: { kind: 'move', videoId, beforeId: track.videoId } });
    });
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'playlist-play';
    play.textContent = `${String(index + 1).padStart(2, '0')}  ${track.videoTitle}`;
    play.title = `Play ${track.videoTitle}`;
    play.addEventListener('click', () => loadTrack(trackFromVideoId(track.videoId, track), true));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'playlist-remove';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `Remove ${track.videoTitle}`);
    remove.addEventListener('click', () => send({ type: MESSAGE.coreEdit, change: { kind: 'remove', videoId: track.videoId } }));
    row.append(play, remove);
    return row;
  }));
}

function renderDesign(settings: DesignSettings) {
  draftSettings = { discStyle: settings.discStyle, background: settings.background, accent: settings.accent };
  discStyle.value = settings.discStyle;
  background.value = settings.background;
  accent.value = settings.accent;
  applyDesign(document, settings);
}

function renderPlayer() {
  const inPlaylist = Boolean(snapshot.track && coreState.playlist.some((track) => track.videoId === snapshot.track?.videoId));
  player.render(snapshot, draftSettings, { previous: inPlaylist && coreState.playlist.length > 1, next: inPlaylist && coreState.playlist.length > 1 });
  openPipButton.disabled = !snapshot.track;
  aiPicks.disabled = !snapshot.track;
  renderPlaylist();
  pip?.update(snapshot, coreState.settings);
}

function handlePlayerAction(action: PlayerAction) {
  const track = snapshot.track;
  if (!track) return;
  if (action === 'toggle') {
    player.command(track.playbackState === 'playing' || track.playbackState === 'buffering' ? 'pause' : 'play');
    return;
  }
  const next = adjacentTrack(coreState.playlist, track.videoId, action === 'next' ? 1 : -1);
  if (next) loadTrack(trackFromVideoId(next.videoId, next), true);
}

const player = createPlayer(document.querySelector<HTMLElement>('#player')!, handlePlayerAction, (event) => {
  const current = snapshot.track;
  if (!current) return;
  if (event.type === 'metadata') {
    if (event.videoId !== current.videoId || (event.videoTitle === current.videoTitle && event.channelTitle === current.channelTitle)) return;
    const track = { ...current, videoTitle: event.videoTitle, channelTitle: event.channelTitle };
    snapshot = { ...snapshot, track };
    bridgeMetadataTrack = track;
    renderPlayer();
    persistBridgeMetadata();
    return;
  }
  const { state } = event;
  snapshot = { ...snapshot, error: state === 'error', track: { ...current, playbackState: state } };
  if (state === 'ended') {
    const next = adjacentTrack(coreState.playlist, current.videoId, 1);
    if (next && coreState.playlist.length > 1) loadTrack(trackFromVideoId(next.videoId, next), true);
    else renderPlayer();
  } else renderPlayer();
});

function loadTrack(track: Track, autoplay: boolean, add = false) {
  snapshot = { track: { ...track, playbackState: autoplay ? 'buffering' : 'paused' }, previous: false, next: false, error: false };
  player.load(track, autoplay);
  renderPlayer();
  if (add) send({ type: MESSAGE.coreEdit, change: { kind: 'add', track: playlistTrackFor(track) } });
}

function previewDesign() {
  const next = { discStyle: discStyle.value, background: background.value, accent: accent.value };
  if (!isDesignSettings(next)) return;
  draftSettings = next;
  applyDesign(document, next);
  player.render(snapshot, next, { previous: false, next: false });
}

function renderRecommendations(recommendations: Recommendation[]) {
  aiPicksList.replaceChildren(...recommendations.map((recommendation) => {
    const card = document.createElement('article');
    card.className = 'ai-pick-card';
    const image = document.createElement('img');
    image.alt = '';
    image.referrerPolicy = 'no-referrer';
    image.src = recommendation.thumbnail || (recommendation.videoId ? `https://i.ytimg.com/vi/${recommendation.videoId}/hqdefault.jpg` : '');
    const meta = document.createElement('div');
    meta.className = 'ai-pick-meta';
    const title = document.createElement('h3');
    title.className = 'ai-pick-title';
    title.textContent = recommendation.title;
    const artist = document.createElement('p');
    artist.className = 'ai-pick-artist';
    artist.textContent = recommendation.channelTitle && recommendation.channelTitle !== recommendation.artist
      ? `${recommendation.artist} · ${recommendation.channelTitle}`
      : recommendation.artist || recommendation.channelTitle;
    meta.append(title, artist);
    const add = document.createElement('button');
    add.type = 'button';
    add.textContent = 'ADD TO PLAYLIST';
    const track = recommendationTrack(recommendation);
    add.disabled = !track;
    add.addEventListener('click', () => { if (track) send({ type: MESSAGE.coreEdit, change: { kind: 'add', track: playlistTrackFor(track) } }); });
    card.append(image, meta, add);
    return card;
  }));
}

function connect() {
  try {
    const port = chrome.runtime.connect({ name: PORT.panel });
    currentPort = port;
    port.onMessage.addListener((message: unknown) => {
      if (isCoreStateMessage(message)) { coreState = message.state; persistBridgeMetadata(); renderDesign(coreState.settings); renderPlayer(); return; }
      if (isAiStateMessage(message)) {
        aiState = message.state;
        if (pendingRecommendations && aiState.configured) {
          pendingRecommendations = false;
          if (snapshot.track) send({ type: MESSAGE_AI.recommend, current: snapshot.track, refresh: hasRecommendations });
        }
        return;
      }
      if (isAiRecommendationsMessage(message)) { hasRecommendations = true; aiPicksMessage.textContent = ''; renderRecommendations(message.recommendations); return; }
      if (isAiRecommendationErrorMessage(message)) {
        aiPicksMessage.textContent = ({ NO_TRACK: 'OPEN A VIDEO FIRST.', NO_CANDIDATES: 'NO PICKS FOUND.', INVALID_SELECTION: 'PICKS COULD NOT BE READ.', AUTH_ERROR: 'OPENAI AUTHENTICATION FAILED.', RATE_LIMIT: 'OPENAI RATE LIMIT REACHED.', USAGE_ERROR: 'OPENAI USAGE LIMIT REACHED.', OPENAI_REQUEST_FAILED: 'OPENAI REQUEST FAILED.', FAILED: 'AI PICKS FAILED.' } as Record<string, string>)[message.code] ?? 'AI PICKS FAILED.';
        return;
      }
      if (message && typeof message === 'object' && 'type' in message && message.type === MESSAGE_AI.result) {
        const result = 'result' in message && typeof message.result === 'string' ? message.result : 'failed';
        if (result === 'saved') {
          aiMessage.textContent = '';
          aiSettings.open = false;
          if (pendingRecommendations && snapshot.track) {
            pendingRecommendations = false;
            send({ type: MESSAGE_AI.recommend, current: snapshot.track, refresh: hasRecommendations });
          }
        } else if (result !== 'cleared') aiMessage.textContent = 'OPENAI COULD NOT CONNECT.';
        return;
      }
      if (message && typeof message === 'object' && 'type' in message && message.type === MESSAGE.coreError) videoMessage.textContent = 'CHANGE COULD NOT BE SAVED.';
    });
    port.onDisconnect.addListener(() => {
      void chrome.runtime.lastError;
      currentPort = undefined;
      videoMessage.textContent = 'RECONNECTING...';
      window.setTimeout(connect, 1000);
    });
    port.postMessage({ type: MESSAGE.probe });
    port.postMessage({ type: MESSAGE_AI.status });
  } catch { videoMessage.textContent = 'RELOAD EXTENSION.'; }
}

function openVideoFromInput() {
  const id = videoIdFromUrl(videoUrl.value.trim());
  if (!id) { videoMessage.textContent = 'INVALID LINK.'; return; }
  const track = trackFromVideoId(id);
  videoMessage.textContent = '';
  videoUrl.value = '';
  loadTrack(track, true, true);
}

function connectAi() {
  const key = aiKey.value.trim();
  if (!key) return;
  void chrome.permissions.request({ origins: [OPENAI_ORIGIN] }).then(async (granted) => {
    if (!granted) { aiMessage.textContent = 'OPENAI COULD NOT CONNECT.'; return; }
    try {
      await chrome.storage.session.set({ [OPENAI_API_KEY]: key });
      aiKey.value = '';
      send({ type: MESSAGE_AI.save, persist: false });
    } catch { aiMessage.textContent = 'OPENAI COULD NOT CONNECT.'; }
  }).catch(() => { aiMessage.textContent = 'OPENAI COULD NOT CONNECT.'; });
}

for (const control of [discStyle, background, accent]) control.addEventListener('input', previewDesign);
saveDesign.addEventListener('click', () => send({ type: MESSAGE.coreEdit, change: { kind: 'design', settings: draftSettings } }));
addVideo.addEventListener('click', openVideoFromInput);
videoUrl.addEventListener('keydown', (event) => { if (event.key === 'Enter') openVideoFromInput(); });
aiConnect.addEventListener('click', connectAi);
aiPicks.addEventListener('click', () => {
  if (!snapshot.track) return;
  if (!aiState.configured) { pendingRecommendations = true; aiSettings.open = true; aiKey.focus(); return; }
  send({ type: MESSAGE_AI.recommend, current: snapshot.track, refresh: hasRecommendations });
});
openPipButton.addEventListener('click', () => {
  if (!snapshot.track) return;
  void openPip(document, handlePlayerAction, snapshot, coreState.settings).then((controller) => { pip?.close(); pip = controller; }).catch(() => { videoMessage.textContent = 'PIP IS UNAVAILABLE.'; });
});
window.addEventListener('beforeunload', () => pip?.close());

renderDesign(coreState.settings);
renderPlayer();
connect();
