import { isCoreStateMessage, MESSAGE, MESSAGE_AI, PORT } from '../shared/messages';
import { isAiErrorDetails, isAiProgressMessage, isAiRecommendationErrorMessage, isAiRecommendationsMessage, isAiStateMessage, OPENAI_API_KEY, OPENAI_ORIGIN, YOUTUBE_METADATA_ORIGIN } from '../shared/ai';
import type { AiErrorDetails, RecommendationErrorCode } from '../shared/ai';
import type { RecommendationProgressStage } from '../shared/ai';
import type { AiState } from '../shared/ai';
import { recommendationTrack, MIN_RECOMMENDATIONS } from '../shared/recommendation';
import type { Recommendation } from '../shared/recommendation';
import { adjacentTrack, playlistTrack, trackAfterEnded } from '../shared/playlist';
import { applyDesign, defaultSettings, isDesignSettings } from '../shared/settings';
import type { DesignSettings } from '../shared/settings';
import { emptySnapshot, trackFromVideoId, videoIdFromUrl } from '../shared/track';
import type { PlayerAction, PlayerSnapshot, Track } from '../shared/track';
import type { CoreState } from '../shared/storage';
import { createPlayer } from './player';
import { backScreen, clampSelection, homeScreen, initialScreenState, moveSelection, openScreen } from './screen-navigation';
import type { ScreenId, ScreenState } from './screen-navigation';
import './style.css';
import { storeLiveMeasurement } from './live-measurement';

declare global {
  interface Window {
    __pixelJukeboxE2E?: boolean;
    __pixelJukeboxLiveMeasurement?: import('../shared/ai').RecommendationLiveMeasurement;
    __pixelJukeboxMeasurement?: import('../shared/ai').RecommendationMeasurement;
    __pixelJukeboxRecommendations?: Recommendation[];
  }
}

const videoUrl = document.querySelector<HTMLInputElement>('#video-url')!;
const addVideo = document.querySelector<HTMLButtonElement>('#add-video')!;
const videoMessage = document.querySelector<HTMLParagraphElement>('#video-message')!;
const playlistList = document.querySelector<HTMLDivElement>('#playlist-list')!;
const playlistEmpty = document.querySelector<HTMLParagraphElement>('#playlist-empty')!;
const powerLight = document.querySelector<HTMLElement>('.power-light')!;
const shellTone = document.querySelector<HTMLInputElement>('#shell-tone')!;
const screenTone = document.querySelector<HTMLInputElement>('#screen-tone')!;
const buttonTone = document.querySelector<HTMLInputElement>('#button-tone')!;
const saveDesign = document.querySelector<HTMLButtonElement>('#save-design')!;
const aiKey = document.querySelector<HTMLInputElement>('#ai-key')!;
const aiConnect = document.querySelector<HTMLButtonElement>('#ai-connect')!;
const aiMessage = document.querySelector<HTMLParagraphElement>('#ai-message')!;
const similarVibesConnect = document.querySelector<HTMLElement>('#similar-vibes-connect')!;
const similarVibesKey = document.querySelector<HTMLInputElement>('#similar-vibes-key')!;
const similarVibesConnectButton = document.querySelector<HTMLButtonElement>('#similar-vibes-connect-button')!;
const similarVibesConnectMessage = document.querySelector<HTMLParagraphElement>('#similar-vibes-connect-message')!;
const similarVibesSourceTrigger = document.querySelector<HTMLButtonElement>('#similar-vibes-source-trigger')!;
const similarVibesSourceList = document.querySelector<HTMLElement>('#similar-vibes-source-list')!;
const similarVibesEmpty = document.querySelector<HTMLParagraphElement>('#similar-vibes-empty')!;
const similarVibesOpenPlaylist = document.querySelector<HTMLButtonElement>('#similar-vibes-open-playlist')!;
let aiPicks: HTMLButtonElement;
const aiPicksMessage = document.querySelector<HTMLParagraphElement>('#ai-picks-message')!;
const aiPicksList = document.querySelector<HTMLDivElement>('#ai-picks-list')!;
const aiPicksSource = document.querySelector<HTMLParagraphElement>('#ai-picks-source')!;
const aiPicksLoading = document.querySelector<HTMLElement>('#ai-picks-loading')!;
const aiPicksProgress = document.querySelector<HTMLElement>('#ai-picks-progress')!;
const aiPicksRetry = document.querySelector<HTMLButtonElement>('#ai-picks-retry')!;
const menuView = document.querySelector<HTMLElement>('#menu-view')!;
const playerRoot = document.querySelector<HTMLElement>('#player')!;
const openWindowButton = document.querySelector<HTMLButtonElement>('#open-window');
const standaloneWindow = new URLSearchParams(location.search).get('window') === '1';
document.documentElement.classList.toggle('standalone-window', standaloneWindow);
function resizeStandaloneWindow() {
  if (!document.documentElement.classList.contains('standalone-window')) return;
  const shell = document.querySelector<HTMLElement>('.game-boy');
  if (!shell) return;
  const scale = Math.max(1, Math.min(window.innerWidth / 640, window.innerHeight / (shell.offsetHeight + 16)));
  document.documentElement.style.setProperty('--window-scale', String(scale));
}
window.addEventListener('resize', resizeStandaloneWindow);
const windowShell = document.querySelector<HTMLElement>('.game-boy');
if (windowShell) {
  new ResizeObserver(() => requestAnimationFrame(resizeStandaloneWindow)).observe(windowShell);
}
resizeStandaloneWindow();
if (standaloneWindow) {
  openWindowButton?.remove();
  const lifecycleCopy = document.querySelector<HTMLElement>('.game-boy header p');
  if (lifecycleCopy) lifecycleCopy.textContent = 'WINDOW PLAYER · STAYS OPEN';
}

let currentPort: chrome.runtime.Port | undefined;
let snapshot: PlayerSnapshot = emptySnapshot();
let coreState: CoreState = { playlist: [], settings: { ...defaultSettings } };
let draftSettings: DesignSettings = { ...defaultSettings };
let aiState: AiState = { configured: false, persisted: false, permission: false, trustedContexts: false };
let hasRecommendations = false;
let continueDrawerOpen = false;
let continueSelected = 0;
let currentRecommendations: Recommendation[] = [];
let recommendationLoading = false;
let recommendationStage: RecommendationProgressStage = 'discovery';
let recommendationSource: Track | undefined;
let recommendationSourceId = '';
let sourcePickerOpen = false;
let repeatOne = false;
let nowPlayingQueueOpen = false;
let nowPlayingQueueSelected = 0;
let bridgeMetadataTrack: Track | undefined;
let aiConnectSurface: 'settings' | 'similar-vibes' | undefined;
let aiConnectInput: HTMLInputElement | undefined;
let focusPicksAfterConnect = false;
let navigation: ScreenState = initialScreenState();

const errorMessages: Record<RecommendationErrorCode, string> = {
  NO_TRACK: 'Choose an available Playlist track.', NO_CANDIDATES: 'No matching tracks found. Try again.', INVALID_SELECTION: 'The recommendation format was invalid.',
  PERMISSION_DENIED: 'Allow OpenAI access, then try again.', NOT_CONFIGURED: 'Connect an OpenAI API key, then try again.',
  AUTH_ERROR: 'OpenAI authentication failed. Check your API key.', RATE_LIMIT: 'Too many requests. Try again shortly.',
  USAGE_ERROR: 'Check your OpenAI usage limit or billing status.', BAD_REQUEST: 'Check the OpenAI request settings.', NOT_FOUND: 'The requested OpenAI resource was not found.',
  SERVER_ERROR: 'OpenAI returned a server error. Try again shortly.', NETWORK_ERROR: 'Check your network connection or request timeout.',
  INVALID_RESPONSE: 'Could not read the OpenAI response. Try again.', YOUTUBE_SOURCE_EMPTY: 'No YouTube search results were found.',
  YOUTUBE_METADATA_FAILED: 'Could not verify the YouTube video details.', OPENAI_REQUEST_FAILED: 'The OpenAI request failed.', FAILED: 'Could not create recommendations.',
};

function errorText(code: RecommendationErrorCode, details?: AiErrorDetails): string {
  const stageNames = { connection: 'connection', discovery: 'discovery', selection: 'selection', 'youtube-search': 'YouTube search', metadata: 'video verification' };
  const stage = details?.stage ? `Stage: ${stageNames[details.stage]}` : '';
  const status = details?.status ? `HTTP ${details.status}` : '';
  const api = [details?.apiCode, details?.apiType, details?.param ? `Field: ${details.param}` : ''].filter(Boolean).join(' / ');
  const trace = details?.requestId ? `Request ID: ${details.requestId}` : '';
  return [errorMessages[code], stage, status, api, details?.message, trace].filter(Boolean).join(' · ');
}

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
  const count = document.querySelector<HTMLElement>('#playlist-count');
  if (count) count.textContent = `${coreState.playlist.length} tracks`;
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
    const name = document.createElement('span');
    name.className = 'playlist-name';
    name.textContent = `${snapshot.track?.videoId === track.videoId ? '▶ ' : ''}${String(index + 1).padStart(2, '0')}  ${track.videoTitle}`;
    const channel = document.createElement('span');
    channel.className = 'playlist-channel';
    channel.textContent = track.channelTitle;
    play.append(name, channel);
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
  renderNowPlayingQueue();
  if (typeof renderScreen === 'function') renderScreen();
}

function renderDesign(settings: DesignSettings) {
  draftSettings = { ...settings };
  shellTone.value = settings.shell;
  screenTone.value = settings.screen;
  buttonTone.value = settings.button;
  applyDesign(document, settings);
}

function selectedRecommendationTrack(): Track | undefined {
  const source = coreState.playlist.find((track) => track.videoId === recommendationSourceId);
  return source ? trackFromVideoId(source.videoId, source) : undefined;
}

function setSourcePicker(open: boolean) {
  sourcePickerOpen = open && !recommendationLoading && coreState.playlist.length > 0;
  similarVibesSourceList.hidden = !sourcePickerOpen;
  similarVibesSourceTrigger.setAttribute('aria-expanded', String(sourcePickerOpen));
  if (sourcePickerOpen) queueMicrotask(() => focusSourceOption(0, true));
}

function focusSourceOption(delta: number, selected = false) {
  const options = [...similarVibesSourceList.querySelectorAll<HTMLButtonElement>('[role="option"]')];
  const index = options.findIndex((option) => selected ? option.getAttribute('aria-selected') === 'true' : option === document.activeElement);
  const next = options[(Math.max(index, 0) + delta + options.length) % options.length];
  options.forEach((option) => { option.tabIndex = option === next ? 0 : -1; });
  next?.focus({ preventScroll: true });
  if (next) similarVibesSourceList.scrollTop = Math.max(0, next.offsetTop - similarVibesSourceList.offsetTop - similarVibesSourceList.clientHeight / 2);
}

function selectRecommendationSource(videoId: string) {
  if (recommendationLoading || !coreState.playlist.some((track) => track.videoId === videoId)) return;
  recommendationSourceId = videoId;
  currentRecommendations = [];
  hasRecommendations = false;
  recommendationSource = undefined;
  aiPicksList.replaceChildren();
  aiPicksMessage.textContent = '';
  setSourcePicker(false);
  renderPlayer();
  similarVibesSourceTrigger.focus({ preventScroll: true });
}

function syncRecommendationSource() {
  const playlist = coreState.playlist;
  const selectedExists = playlist.some((track) => track.videoId === recommendationSourceId);
  const playingInPlaylist = playlist.find((track) => track.videoId === snapshot.track?.videoId);
  const lockedSource = recommendationLoading ? recommendationSource : undefined;
  const nextId = lockedSource?.videoId ?? (selectedExists ? recommendationSourceId : playingInPlaylist?.videoId ?? playlist[0]?.videoId ?? '');
  if (!recommendationLoading && recommendationSourceId && nextId !== recommendationSourceId) {
    currentRecommendations = [];
    hasRecommendations = false;
    recommendationSource = undefined;
    aiPicksList.replaceChildren();
    aiPicksMessage.textContent = '';
  }
  recommendationSourceId = nextId;
  const options = [...playlist];
  if (lockedSource && !options.some((track) => track.videoId === lockedSource.videoId)) options.unshift(lockedSource);
  const focusedId = similarVibesSourceList.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.videoId : undefined;
  similarVibesSourceList.replaceChildren(...options.map((track) => {
    const option = document.createElement('button');
    const label = `${track.videoTitle} — ${track.channelTitle}`;
    option.type = 'button';
    option.className = 'similar-vibes-source-option';
    option.dataset.videoId = track.videoId;
    option.tabIndex = track.videoId === recommendationSourceId ? 0 : -1;
    option.title = label;
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', String(track.videoId === recommendationSourceId));
    option.setAttribute('aria-label', label);
    option.textContent = label;
    option.addEventListener('click', () => selectRecommendationSource(track.videoId));
    return option;
  }));
  const selected = options.find((track) => track.videoId === recommendationSourceId);
  const selectedLabel = selected ? `${selected.videoTitle} — ${selected.channelTitle}` : 'NO PLAYLIST TRACKS';
  similarVibesSourceTrigger.textContent = selectedLabel;
  similarVibesSourceTrigger.dataset.videoId = recommendationSourceId;
  similarVibesSourceTrigger.title = selectedLabel;
  similarVibesSourceTrigger.setAttribute('aria-label', `Reference track: ${selectedLabel}`);
  similarVibesSourceTrigger.disabled = recommendationLoading || options.length === 0;
  if (recommendationLoading || !options.length) setSourcePicker(false);
  else if (focusedId) similarVibesSourceList.querySelector<HTMLButtonElement>(`[data-video-id="${focusedId}"]`)?.focus({ preventScroll: true });
  similarVibesEmpty.hidden = playlist.length > 0;
  similarVibesOpenPlaylist.hidden = playlist.length > 0;
}

function renderPlayer() {
  const inPlaylist = Boolean(snapshot.track && coreState.playlist.some((track) => track.videoId === snapshot.track?.videoId));
  player.render(snapshot, draftSettings, { previous: inPlaylist && coreState.playlist.length > 1, next: inPlaylist && coreState.playlist.length > 1, repeatOne });
  const isPlaying = snapshot.track?.playbackState === 'playing';
  powerLight.classList.toggle('is-playing', isPlaying);
  powerLight.setAttribute('aria-label', isPlaying ? 'Music playing' : 'Playback stopped');
  const needsAiKey = !aiState.configured;
  syncRecommendationSource();
  similarVibesConnect.hidden = !needsAiKey;
  aiPicks.hidden = needsAiKey;
  aiPicks.disabled = !selectedRecommendationTrack() || recommendationLoading;
  aiPicks.textContent = recommendationLoading ? 'CURATING' : hasRecommendations ? 'MORE LIKE THIS' : 'KEEP THIS VIBE';
  aiPicks.setAttribute('aria-label', recommendationLoading ? 'Curating the next tracks' : hasRecommendations ? 'Find more tracks that keep this vibe' : 'Keep this vibe going');
  renderRecommendationStatus();
  renderPlaylist();
  if (typeof renderScreen === 'function') renderScreen();
}

const progressText: Record<RecommendationProgressStage, string> = {
  discovery: 'Finding tracks that match the mood…', selection: 'Arranging a smooth sequence…',
  'youtube-search': 'Finding YouTube videos…', metadata: 'Verifying video details…',
};

function renderRecommendationStatus() {
  const requested = recommendationLoading || currentRecommendations.length > 0 || Boolean(aiPicksMessage.textContent);
  const source = requested ? recommendationSource : selectedRecommendationTrack();
  aiPicksSource.hidden = !source;
  aiPicksSource.textContent = source ? `${requested ? 'Based on' : 'Selected'} · ${source.channelTitle} — ${source.videoTitle}` : '';
  aiPicksLoading.hidden = !recommendationLoading;
  aiPicksProgress.textContent = progressText[recommendationStage];
  aiPicksRetry.hidden = recommendationLoading || !aiPicksMessage.textContent;
  document.querySelector<HTMLElement>('[data-view="ai-picks"]')?.setAttribute('aria-busy', String(recommendationLoading));
}

function handlePlayerAction(action: PlayerAction) {
  const track = snapshot.track;
  if (!track) return;
  if (action === 'toggle') {
    player.command(track.playbackState === 'playing' || track.playbackState === 'buffering' ? 'pause' : 'play');
    return;
  }
  if (action === 'repeat-one') {
    repeatOne = !repeatOne;
    renderPlayer();
    return;
  }
  const next = adjacentTrack(coreState.playlist, track.videoId, action === 'next' ? 1 : -1);
  if (next) loadTrack(trackFromVideoId(next.videoId, next), true);
}

const player = createPlayer(playerRoot, handlePlayerAction, (event) => {
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
  if (event.type === 'error') {
    if (event.videoId && event.videoId !== current.videoId) return;
    snapshot = { ...snapshot, error: true, track: { ...current, playbackState: 'error' } };
    renderPlayer();
    return;
  }
  const { state } = event;
  if (event.videoId && event.videoId !== current.videoId) return;
  snapshot = { ...snapshot, error: false, track: { ...current, playbackState: state } };
  if (state === 'ended') {
    const next = trackAfterEnded(coreState.playlist, current, repeatOne);
    const playerVisible = navigation.screen === 'now-playing';
    if (next) loadTrack(trackFromVideoId(next.videoId, next), playerVisible, false, playerVisible);
    else renderPlayer();
  } else renderPlayer();
}, () => {
  if (continueDrawerOpen) { setContinueDrawer(false); return; }
  setContinueDrawer(true);
  const playing = snapshot.track;
  if (recommendationLoading || !playing) return;
  if (!coreState.playlist.some(track => track.videoId === playing.videoId)) {
    aiPicksMessage.textContent = 'Add the playing track to Playlist first.';
    renderRecommendationStatus();
    return;
  }
  if (recommendationSourceId !== playing.videoId) selectRecommendationSource(playing.videoId);
  if (!hasRecommendations || recommendationSource?.videoId !== playing.videoId) requestRecommendations();
});
aiPicks = document.querySelector<HTMLButtonElement>('#ai-picks')!;
document.querySelector('#lcd-screen')?.append(menuView);
const videoView = playerRoot.querySelector<HTMLElement>('#video-view')!;
const playlistCount = menuView.querySelector<HTMLElement>('#playlist-count')!;
const nowPlayingQueue = playerRoot.querySelector<HTMLElement>('.now-playing-queue')!;
const nowPlayingQueueList = playerRoot.querySelector<HTMLElement>('.now-playing-queue-list')!;
const nowPlayingQueueToggle = playerRoot.querySelector<HTMLButtonElement>('.track-queue')!;
const nowPlayingQueueClose = playerRoot.querySelector<HTMLButtonElement>('.now-playing-queue-close')!;
const continueDrawer = playerRoot.querySelector<HTMLElement>('#continue-drawer')!;
const continuePage = menuView.querySelector<HTMLElement>('[data-view="ai-picks"]')!;
const continueContent = continuePage.querySelector<HTMLElement>('.lcd-content')!;
const continueClose = continuePage.querySelector<HTMLButtonElement>('#continue-close')!;
const continueToggle = playerRoot.querySelector<HTMLButtonElement>('.mini-disc')!;

function continueItems(): HTMLButtonElement[] {
  return [...continuePage.querySelectorAll<HTMLButtonElement>('#similar-vibes-source-trigger, #similar-vibes-open-playlist, #ai-picks, #ai-picks-retry, .ai-pick-add')]
    .filter((button) => !button.disabled && !button.closest('[hidden], [inert]'));
}

function renderContinueSelection() {
  const items = continueItems();
  continueSelected = Math.max(0, Math.min(continueSelected, items.length - 1));
  items.forEach((button, index) => button.classList.toggle('is-selected', continueDrawerOpen && index === continueSelected));
}

function setContinueDrawer(open: boolean) {
  if (!open) setSourcePicker(false);
  const restoreFocus = !open && continueDrawer.contains(document.activeElement);
  continueDrawerOpen = open;
  if (open) {
    if (nowPlayingQueueOpen) setNowPlayingQueue(false);
    continueDrawer.append(continuePage);
    continuePage.hidden = false;
    continueClose.hidden = false;
  }
  continueDrawer.classList.toggle('is-open', open);
  continueDrawer.toggleAttribute('inert', !open);
  continueDrawer.setAttribute('aria-hidden', String(!open));
  continueToggle.setAttribute('aria-expanded', String(open));
  renderContinueSelection();
  if (restoreFocus) continueToggle.focus();
}

function restoreContinuePage() {
  setContinueDrawer(false);
  continueClose.hidden = true;
  if (continuePage.parentElement !== menuView) menuView.append(continuePage);
}

function renderNowPlayingQueue() {
  nowPlayingQueueSelected = Math.min(Math.max(0, nowPlayingQueueSelected), Math.max(0, coreState.playlist.length - 1));
  nowPlayingQueueList.replaceChildren(...coreState.playlist.map((track, index) => {
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'now-playing-queue-track';
    play.dataset.videoId = track.videoId;
    play.classList.toggle('is-selected', index === nowPlayingQueueSelected);
    play.classList.toggle('current', track.videoId === snapshot.track?.videoId);
    const title = document.createElement('span');
    title.textContent = `${track.videoId === snapshot.track?.videoId ? '▶ ' : ''}${String(index + 1).padStart(2, '0')}  ${track.videoTitle}`;
    const channel = document.createElement('small');
    channel.textContent = track.channelTitle;
    play.append(title, channel);
    play.addEventListener('click', () => {
      nowPlayingQueueSelected = index;
      loadTrack(trackFromVideoId(track.videoId, track), true, false, false);
      setNowPlayingQueue(false);
      nowPlayingQueueToggle.focus();
    });
    return play;
  }));
}

function setNowPlayingQueue(open: boolean) {
  if (open && continueDrawerOpen) setContinueDrawer(false);
  const restoreFocus = !open && nowPlayingQueue.contains(document.activeElement);
  nowPlayingQueueOpen = open;
  if (open) {
    const currentIndex = coreState.playlist.findIndex((track) => track.videoId === snapshot.track?.videoId);
    if (currentIndex >= 0) nowPlayingQueueSelected = currentIndex;
  }
  nowPlayingQueue.classList.toggle('is-open', open);
  nowPlayingQueue.toggleAttribute('inert', !open);
  nowPlayingQueue.setAttribute('aria-hidden', String(!open));
  nowPlayingQueueToggle.setAttribute('aria-expanded', String(open));
  renderNowPlayingQueue();
  if (restoreFocus) nowPlayingQueueToggle.focus();
}

function moveNowPlayingQueue(delta: number) {
  if (coreState.playlist.length === 0) return;
  nowPlayingQueueSelected = (nowPlayingQueueSelected + delta + coreState.playlist.length) % coreState.playlist.length;
  renderNowPlayingQueue();
  nowPlayingQueueList.querySelector<HTMLElement>('.is-selected')?.scrollIntoView({ block: 'nearest' });
}

function activeMenuItems(): HTMLElement[] {
  const page = menuView.querySelector<HTMLElement>(`[data-view="${navigation.screen}"]`);
  if (!page) return [];
  return [...page.querySelectorAll<HTMLElement>('button, input')]
    .filter((item) => !item.hidden && !item.closest('[hidden], [inert]') && (!(item instanceof HTMLButtonElement) || !item.disabled))
    .filter((item) => navigation.screen !== 'playlist' || item.classList.contains('playlist-play'));
}

function discardAppearancePreview() {
  if (navigation.screen !== 'appearance') return;
  renderDesign(coreState.settings);
}

function renderScreen() {
  const isPlayer = navigation.screen === 'now-playing';
  videoView.hidden = !isPlayer;
  menuView.hidden = isPlayer;
  menuView.dataset.screen = navigation.screen;
  for (const page of menuView.querySelectorAll<HTMLElement>('[data-view]')) page.hidden = page.dataset.view !== navigation.screen;
  const items = activeMenuItems();
  navigation = clampSelection(navigation, items.length);
  items.forEach((item, index) => {
    item.classList.toggle('is-selected', index === navigation.selected);
    item.dataset.menuIndex = String(index);
  });
  if (continueDrawerOpen) renderContinueSelection();
}

function showScreen(screen: ScreenId) {
  setSourcePicker(false);
  if (screen !== 'now-playing' && navigation.screen === 'now-playing' && (snapshot.track?.playbackState === 'playing' || snapshot.track?.playbackState === 'buffering')) player.command('pause');
  discardAppearancePreview();
  if (screen !== 'now-playing' && nowPlayingQueueOpen) setNowPlayingQueue(false);
  if (screen !== 'now-playing') restoreContinuePage();
  navigation = screen === 'home' ? homeScreen() : openScreen(navigation, screen);
  renderScreen();
}

function goBack() {
  if (sourcePickerOpen) { setSourcePicker(false); similarVibesSourceTrigger.focus({ preventScroll: true }); return; }
  if (navigation.screen === 'now-playing' && continueDrawerOpen) { setContinueDrawer(false); continueToggle.focus(); return; }
  if (navigation.screen === 'now-playing' && nowPlayingQueueOpen) { setNowPlayingQueue(false); nowPlayingQueueToggle.focus(); return; }
  if (navigation.screen === 'now-playing' && (snapshot.track?.playbackState === 'playing' || snapshot.track?.playbackState === 'buffering')) player.command('pause');
  discardAppearancePreview();
  navigation = backScreen(navigation);
  renderScreen();
}

function moveMenu(delta: number) {
  if (sourcePickerOpen) { focusSourceOption(delta); return; }
  if (navigation.screen === 'now-playing' && continueDrawerOpen) {
    const items = continueItems();
    if (!items.length) return;
    continueSelected = (continueSelected + delta + items.length) % items.length;
    renderContinueSelection();
    items[continueSelected]?.scrollIntoView({ block: 'nearest' });
    return;
  }
  if (navigation.screen === 'now-playing' && nowPlayingQueueOpen) { moveNowPlayingQueue(delta); return; }
  const items = activeMenuItems();
  navigation = moveSelection(navigation, delta, items.length);
  renderScreen();
  items[navigation.selected]?.scrollIntoView({ block: 'nearest' });
}

function confirmSelection() {
  if (sourcePickerOpen) { similarVibesSourceList.querySelector<HTMLButtonElement>('[tabindex="0"]')?.click(); return; }
  if (navigation.screen === 'now-playing') {
    if (continueDrawerOpen) continueItems()[continueSelected]?.click();
    else if (nowPlayingQueueOpen) nowPlayingQueueList.querySelectorAll<HTMLButtonElement>('.now-playing-queue-track')[nowPlayingQueueSelected]?.click();
    else handlePlayerAction('toggle');
    return;
  }
  if (navigation.screen === 'appearance') { saveDesign.click(); return; }
  if (navigation.screen === 'openai') { aiConnect.click(); return; }
  activeMenuItems()[navigation.selected]?.click();
}

for (const item of menuView.querySelectorAll<HTMLElement>('[data-open]')) item.addEventListener('click', () => showScreen(item.dataset.open as ScreenId));
menuView.addEventListener('focusin', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const index = activeMenuItems().indexOf(target);
  if (index >= 0) { navigation = { ...navigation, selected: index }; renderScreen(); }
});
document.querySelector('#dpad-up')?.addEventListener('click', () => moveMenu(-1));
document.querySelector('#dpad-down')?.addEventListener('click', () => moveMenu(1));
document.querySelector('#dpad-left')?.addEventListener('click', () => { if (navigation.screen === 'now-playing') handlePlayerAction('previous'); });
document.querySelector('#dpad-right')?.addEventListener('click', () => { if (navigation.screen === 'now-playing') handlePlayerAction('next'); });
document.querySelector('#button-a')?.addEventListener('click', confirmSelection);
document.querySelector('#button-b')?.addEventListener('click', goBack);
document.querySelector('#button-select')?.addEventListener('click', () => showScreen('home'));
document.querySelector('#button-start')?.addEventListener('click', () => showScreen('settings'));
nowPlayingQueueToggle.addEventListener('click', () => setNowPlayingQueue(!nowPlayingQueueOpen));
nowPlayingQueueClose.addEventListener('click', () => { setNowPlayingQueue(false); nowPlayingQueueToggle.focus(); });
continueClose.addEventListener('click', () => { setContinueDrawer(false); continueToggle.focus(); });
continuePage.addEventListener('focusin', (event) => {
  const index = continueItems().indexOf(event.target as HTMLButtonElement);
  if (continueDrawerOpen && index >= 0) { continueSelected = index; renderContinueSelection(); }
});
nowPlayingQueueList.addEventListener('focusin', (event) => {
  const track = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('.now-playing-queue-track') : null;
  if (!track) return;
  const tracks = [...nowPlayingQueueList.querySelectorAll<HTMLButtonElement>('.now-playing-queue-track')];
  const index = tracks.indexOf(track);
  if (index < 0) return;
  nowPlayingQueueSelected = index;
  tracks.forEach((item, itemIndex) => item.classList.toggle('is-selected', itemIndex === index));
});
playerRoot.tabIndex = -1;
function handleNavigationKey(event: KeyboardEvent) {
  const target = event.target as Element | null;
  if (target instanceof HTMLInputElement && target.type === 'range') return;
  if (target?.tagName === 'INPUT') {
    if (event.key === 'Enter') { event.preventDefault(); if (target === videoUrl) addVideo.click(); else if (target === similarVibesKey) similarVibesConnectButton.click(); else confirmSelection(); }
    if (event.key === 'Escape') { event.preventDefault(); goBack(); }
    return;
  }
  if ((event.key === 'Enter' || event.key === ' ') && target?.tagName === 'BUTTON') return;
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); moveMenu(event.key === 'ArrowUp' ? -1 : 1); }
  if (event.key === 'ArrowLeft' && navigation.screen === 'now-playing') { event.preventDefault(); handlePlayerAction('previous'); }
  if (event.key === 'ArrowRight' && navigation.screen === 'now-playing') { event.preventDefault(); handlePlayerAction('next'); }
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); confirmSelection(); }
  if (event.key === 'Escape' || event.key === 'Backspace') { event.preventDefault(); goBack(); }
  if (event.key === 'Home') { event.preventDefault(); showScreen('home'); }
}
playerRoot.addEventListener('keydown', handleNavigationKey);
document.addEventListener('keydown', (event) => {
  if (!playerRoot.contains(event.target as Node | null)) handleNavigationKey(event);
});

function loadTrack(track: Track, autoplay: boolean, add = false, revealPlayer = true) {
  snapshot = { track: { ...track, playbackState: autoplay ? 'buffering' : 'paused' }, previous: false, next: false, error: false };
  player.load(track, autoplay);
  renderPlayer();
  if (add) send({ type: MESSAGE.coreEdit, change: { kind: 'add', track: playlistTrackFor(track) } });
  if (revealPlayer) showScreen('now-playing');
}

function previewDesign() {
  const next = { shell: shellTone.value, screen: screenTone.value, button: buttonTone.value };
  if (!isDesignSettings(next)) return;
  draftSettings = next;
  applyDesign(document, next);
  player.render(snapshot, next, { previous: false, next: false });
}

function renderRecommendations(recommendations: Recommendation[]) {
  aiPicksList.replaceChildren(...recommendations.map((recommendation) => {
    const card = document.createElement('article');
    card.className = 'ai-pick-card';
    const inner = document.createElement('div');
    inner.className = 'ai-pick-inner';
    const front = document.createElement('div');
    front.className = 'ai-pick-face ai-pick-front';
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
    const videoType = document.createElement('p');
    videoType.className = 'ai-pick-type';
    videoType.textContent = recommendation.videoType;
    meta.append(title, artist, videoType);
    const track = recommendationTrack(recommendation);
    const added = Boolean(track && coreState.playlist.some((item) => item.videoId === track.videoId));
    const makeAdd = () => {
      const add = document.createElement('button');
      add.type = 'button'; add.className = 'ai-pick-add'; add.textContent = added ? '✓' : '+'; add.disabled = !track || added;
      add.setAttribute('aria-label', `Add ${recommendation.title} to playlist`);
      add.addEventListener('click', () => { if (track) loadTrack(track, true, true); });
      return add;
    };
    front.append(image, meta, makeAdd());
    inner.append(front); card.append(inner);
    return card;
  }));
  renderScreen();
}

function connect() {
  try {
    const port = chrome.runtime.connect({ name: PORT.panel });
    currentPort = port;
    port.onMessage.addListener((message: unknown) => {
      if (videoMessage.textContent === 'RECONNECTING...') videoMessage.textContent = '';
      if (isCoreStateMessage(message)) {
        const designChanged = JSON.stringify(coreState.settings) !== JSON.stringify(message.state.settings);
        coreState = message.state;
        persistBridgeMetadata();
        if (designChanged) renderDesign(coreState.settings);
        if (currentRecommendations.length > 0) renderRecommendations(currentRecommendations);
        renderPlayer();
        return;
      }
      if (isAiStateMessage(message)) {
        aiState = message.state;
        document.querySelector('#openai-state')!.textContent = aiState.configured ? 'connected' : 'not connected';
        renderPlayer();
        if (focusPicksAfterConnect && aiState.configured) {
          focusPicksAfterConnect = false;
          aiPicks.focus({ preventScroll: true });
          window.scrollTo(0, 0);
        }
        return;
      }
      if (isAiRecommendationsMessage(message)) {
        recommendationLoading = false;
        hasRecommendations = true;
        currentRecommendations = message.recommendations;
        if (window.__pixelJukeboxE2E) {
          if (message.measurement) window.__pixelJukeboxMeasurement = structuredClone(message.measurement);
          window.__pixelJukeboxRecommendations = structuredClone(message.recommendations);
        }
        aiPicksMessage.textContent = currentRecommendations.length < MIN_RECOMMENDATIONS
          ? `${currentRecommendations.length} verified tracks keep the vibe going. Try More Like This for a new sequence.` : '';
        renderRecommendations(currentRecommendations);
        renderPlayer();
        return;
      }
      if (isAiProgressMessage(message)) {
        storeLiveMeasurement(window, Boolean(window.__pixelJukeboxE2E), message.measurement);
        if (recommendationLoading) { recommendationStage = message.stage; renderRecommendationStatus(); }
        return;
      }
      if (isAiRecommendationErrorMessage(message)) {
        recommendationLoading = false;
        aiPicksMessage.textContent = errorText(message.code, message.details);
        renderRecommendationStatus();
        renderPlayer();
        return;
      }
      if (message && typeof message === 'object' && 'type' in message && message.type === MESSAGE_AI.result) {
        const result = 'result' in message && typeof message.result === 'string' ? message.result : 'failed';
        if (result === 'saved') {
          const surface = aiConnectSurface;
          if (aiConnectInput) aiConnectInput.value = '';
          aiConnectInput = undefined;
          aiConnectSurface = undefined;
          aiMessage.textContent = '';
          similarVibesConnectMessage.textContent = '';
          if (surface === 'settings') showScreen('ai-picks');
          else if (surface === 'similar-vibes') focusPicksAfterConnect = true;
        } else if (result !== 'cleared') {
          const code = 'code' in message && typeof message.code === 'string' && message.code in errorMessages ? message.code as RecommendationErrorCode : 'FAILED';
          const details = 'details' in message && isAiErrorDetails(message.details) ? message.details : undefined;
          const messageTarget = aiConnectSurface === 'similar-vibes' ? similarVibesConnectMessage : aiMessage;
          aiConnectInput = undefined;
          aiConnectSurface = undefined;
          messageTarget.textContent = errorText(code, details);
        }
        return;
      }
      if (message && typeof message === 'object' && 'type' in message && message.type === MESSAGE.coreError) videoMessage.textContent = 'CHANGE COULD NOT BE SAVED.';
    });
    port.onDisconnect.addListener(() => {
      void chrome.runtime.lastError;
      currentPort = undefined;
      recommendationLoading = false;
      recommendationStage = 'discovery';
      videoMessage.textContent = 'RECONNECTING...';
      renderPlayer();
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

function connectAi(input: HTMLInputElement, button: HTMLButtonElement, message: HTMLElement, surface: 'settings' | 'similar-vibes') {
  const key = input.value.trim();
  if (!key) return;
  button.disabled = true;
  message.textContent = 'Connecting…';
  void chrome.permissions.request({ origins: [OPENAI_ORIGIN, YOUTUBE_METADATA_ORIGIN] }).then(async (granted) => {
    if (!granted) { message.textContent = 'OPENAI COULD NOT CONNECT.'; return; }
    try {
      await chrome.storage.session.set({ [OPENAI_API_KEY]: key });
      aiConnectInput = input;
      aiConnectSurface = surface;
      send({ type: MESSAGE_AI.save, persist: false });
    } catch { message.textContent = 'OPENAI COULD NOT CONNECT.'; }
  }).catch(() => { message.textContent = 'OPENAI COULD NOT CONNECT.'; }).finally(() => { button.disabled = false; });
}

function startRecommendation(track: Track) {
  if (recommendationLoading) return;
  const sourceChanged = recommendationSource?.videoId !== track.videoId;
  recommendationSource = { ...track };
  if (sourceChanged) {
    currentRecommendations = [];
    hasRecommendations = false;
    aiPicksList.replaceChildren();
  }
  recommendationLoading = true;
  recommendationStage = 'discovery';
  aiPicksMessage.textContent = '';
  continueContent.scrollTop = 0;
  renderPlayer();
  send({ type: MESSAGE_AI.recommend, sourceVideoId: track.videoId, refresh: hasRecommendations });
}

function requestRecommendations() {
  if (recommendationLoading) return;
  if (!aiState.configured) { renderPlayer(); similarVibesKey.focus(); return; }
  const track = selectedRecommendationTrack();
  if (!track) { aiPicksMessage.textContent = 'Choose a Playlist track first.'; renderPlayer(); return; }
  void chrome.permissions.request({ origins: [YOUTUBE_METADATA_ORIGIN] }).then((granted) => {
    if (!granted) {
      aiPicksMessage.textContent = 'YouTube access is needed to find tracks.';
      renderRecommendationStatus();
      return;
    }
    startRecommendation(track);
  }).catch(() => {
    aiPicksMessage.textContent = 'Could not access YouTube.';
    renderRecommendationStatus();
  });
}

for (const control of [shellTone, screenTone, buttonTone]) control.addEventListener('input', previewDesign);
saveDesign.addEventListener('click', () => send({ type: MESSAGE.coreEdit, change: { kind: 'design', settings: draftSettings } }));
addVideo.addEventListener('click', openVideoFromInput);
aiConnect.addEventListener('click', () => connectAi(aiKey, aiConnect, aiMessage, 'settings'));
similarVibesConnectButton.addEventListener('click', () => connectAi(similarVibesKey, similarVibesConnectButton, similarVibesConnectMessage, 'similar-vibes'));
similarVibesSourceTrigger.addEventListener('click', () => setSourcePicker(!sourcePickerOpen));
similarVibesSourceTrigger.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  event.preventDefault();
  event.stopPropagation();
  setSourcePicker(true);
});
similarVibesSourceList.addEventListener('keydown', (event) => {
  event.stopPropagation();
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    focusSourceOption(event.key === 'ArrowDown' ? 1 : -1);
  } else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault();
    const options = [...similarVibesSourceList.querySelectorAll<HTMLButtonElement>('[role="option"]')];
    const next = event.key === 'Home' ? options[0] : options.at(-1);
    options.forEach((option) => { option.tabIndex = option === next ? 0 : -1; });
    next?.focus({ preventScroll: true });
    similarVibesSourceList.scrollTop = event.key === 'Home' ? 0 : similarVibesSourceList.scrollHeight;
  } else if (event.key === 'Escape') {
    event.preventDefault();
    goBack();
  }
});
document.addEventListener('pointerdown', (event) => {
  if (sourcePickerOpen && event.target instanceof Element && !event.target.closest('.similar-vibes-source, .dpad, .action-buttons')) setSourcePicker(false);
});
similarVibesSourceList.addEventListener('focusout', (event) => {
  if (event.relatedTarget instanceof Node && !similarVibesSourceList.contains(event.relatedTarget) && event.relatedTarget !== similarVibesSourceTrigger && !(event.relatedTarget instanceof Element && event.relatedTarget.closest('.dpad, .action-buttons'))) setSourcePicker(false);
});
similarVibesOpenPlaylist.addEventListener('click', () => showScreen('playlist'));
aiPicks.addEventListener('click', requestRecommendations);
aiPicksRetry.addEventListener('click', requestRecommendations);
openWindowButton?.addEventListener('click', () => {
  void chrome.windows.create({
    url: `${chrome.runtime.getURL('sidepanel.html')}?window=1`,
    type: 'popup',
    width: 380,
    height: 650,
  }).then(() => {
    if (snapshot.track?.playbackState === 'playing' || snapshot.track?.playbackState === 'buffering') player.command('pause');
    window.close();
  }).catch(() => { videoMessage.textContent = 'WINDOW COULD NOT OPEN.'; });
});
renderDesign(coreState.settings);
renderPlayer();
renderScreen();
connect();
