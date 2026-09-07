import { CORE_ERRORS, isConnectionStatus, isCoreError, isCoreStateMessage, isPlayerState, MESSAGE, PORT } from '../shared/messages';
import { applyDesign, defaultSettings, isDesignSettings } from '../shared/settings';
import type { DesignSettings } from '../shared/settings';
import { emptySnapshot } from '../shared/track';
import type { CoreState } from '../shared/storage';
import type { TabPlayer } from '../shared/track';
import { canvasBlob, downloadBlob, exportGif, renderPlayerCanvas } from './export';
import { openPip } from './pip';
import { createPlayer } from './player';
import './style.css';

const status = document.querySelector<HTMLParagraphElement>('#connection-status')!;
const recheck = document.querySelector<HTMLButtonElement>('#recheck')!;
const selector = document.querySelector<HTMLSelectElement>('#tab-select')!;
const playlistList = document.querySelector<HTMLDivElement>('#playlist-list')!;
const playlistEmpty = document.querySelector<HTMLParagraphElement>('#playlist-empty')!;
const addTrack = document.querySelector<HTMLButtonElement>('#add-track')!;
const exportStatus = document.querySelector<HTMLParagraphElement>('#export-status')!;
const exportPngButton = document.querySelector<HTMLButtonElement>('#export-png')!;
const exportGifButton = document.querySelector<HTMLButtonElement>('#export-gif')!;
const openPipButton = document.querySelector<HTMLButtonElement>('#open-pip')!;
const discStyle = document.querySelector<HTMLSelectElement>('#disc-style')!;
const artwork = document.querySelector<HTMLInputElement>('#artwork')!;
const background = document.querySelector<HTMLInputElement>('#background')!;
const panelColor = document.querySelector<HTMLInputElement>('#panel-color')!;
const accent = document.querySelector<HTMLInputElement>('#accent')!;
const textColor = document.querySelector<HTMLInputElement>('#text-color')!;
const resetDesign = document.querySelector<HTMLButtonElement>('#reset-design')!;

let currentPort: chrome.runtime.Port | undefined;
let tabs: TabPlayer[] = [];
let selected: number | undefined;
let coreState: CoreState = { playlist: [], settings: { ...defaultSettings } };
let pip: { update(snapshot: TabPlayer['snapshot'], settings: DesignSettings): void; close(): void } | undefined;

function currentTab() { return tabs.find((tab) => tab.tabId === selected); }

function send(message: object) {
  try { currentPort?.postMessage(message); }
  catch { status.textContent = 'Connection lost. Reconnect and try again.'; }
}

function renderPlaylist() {
  playlistEmpty.hidden = coreState.playlist.length > 0;
  playlistList.replaceChildren(...coreState.playlist.map((track, index) => {
    const row = document.createElement('div');
    row.className = 'playlist-row';
    row.draggable = true;
    row.dataset.videoId = track.videoId;
    row.setAttribute('role', 'listitem');
    if (currentTab()?.snapshot.track?.videoId === track.videoId) row.classList.add('current');
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
    play.addEventListener('click', () => send({ type: MESSAGE.playlistPlay, tabId: selected ?? null, videoId: track.videoId }));
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
  discStyle.value = settings.discStyle;
  artwork.checked = settings.artwork;
  background.value = settings.background;
  panelColor.value = settings.panel;
  accent.value = settings.accent;
  textColor.value = settings.text;
  applyDesign(document, settings);
}

function renderPlayer() {
  if (!tabs.some((tab) => tab.tabId === selected)) selected = tabs.find((tab) => tab.active && tab.snapshot.track)?.tabId ?? tabs.find((tab) => tab.snapshot.track)?.tabId ?? tabs[0]?.tabId;
  selector.replaceChildren(...tabs.map((tab, index) => {
    const option = document.createElement('option');
    option.value = String(tab.tabId);
    option.textContent = `TAB ${index + 1} · ${tab.snapshot.track?.videoTitle ?? 'No video'}`;
    return option;
  }));
  if (selected !== undefined) selector.value = String(selected);
  selector.disabled = tabs.length === 0;
  const snapshot = currentTab()?.snapshot ?? emptySnapshot();
  const hasTrack = Boolean(snapshot.track);
  const inPlaylist = snapshot.track ? coreState.playlist.some((track) => track.videoId === snapshot.track?.videoId) : false;
  player.render(snapshot, coreState.settings, { previous: inPlaylist && coreState.playlist.length > 1, next: inPlaylist && coreState.playlist.length > 1 });
  addTrack.disabled = !hasTrack || inPlaylist;
  exportPngButton.disabled = !hasTrack;
  exportGifButton.disabled = !hasTrack;
  openPipButton.disabled = !hasTrack;
  renderPlaylist();
  pip?.update(snapshot, coreState.settings);
}

const player = createPlayer(document.querySelector<HTMLElement>('#player')!, (action) => {
  const current = currentTab();
  if (!current?.snapshot.track) return;
  send({ type: MESSAGE.control, tabId: current.tabId, videoId: current.snapshot.track.videoId, action });
});

function updateDesign() {
  const settings = { discStyle: discStyle.value, artwork: artwork.checked, background: background.value, panel: panelColor.value, accent: accent.value, text: textColor.value };
  if (isDesignSettings(settings)) send({ type: MESSAGE.coreEdit, change: { kind: 'design', settings } });
}

function withExportStatus(action: () => Promise<void>) {
  exportStatus.textContent = 'RENDERING...';
  void action().then(() => { exportStatus.textContent = 'EXPORT COMPLETE'; }).catch(() => { exportStatus.textContent = 'EXPORT FAILED'; });
}

selector.addEventListener('change', () => { selected = Number(selector.value); renderPlayer(); });
addTrack.addEventListener('click', () => {
  const track = currentTab()?.snapshot.track;
  if (track) send({ type: MESSAGE.coreEdit, change: { kind: 'add', tabId: selected!, videoId: track.videoId } });
});
for (const control of [discStyle, artwork, background, panelColor, accent, textColor]) control.addEventListener('change', updateDesign);
resetDesign.addEventListener('click', () => send({ type: MESSAGE.coreEdit, change: { kind: 'design', settings: { ...defaultSettings } } }));
exportPngButton.addEventListener('click', () => withExportStatus(async () => {
  const canvas = await renderPlayerCanvas(currentTab()?.snapshot ?? emptySnapshot(), coreState.settings);
  downloadBlob(await canvasBlob(canvas, 'image/png'), 'pixel-jukebox.png');
}));
exportGifButton.addEventListener('click', () => withExportStatus(async () => {
  downloadBlob(await exportGif(currentTab()?.snapshot ?? emptySnapshot(), coreState.settings), 'pixel-jukebox.gif');
}));
openPipButton.addEventListener('click', () => {
  const snapshot = currentTab()?.snapshot ?? emptySnapshot();
  void openPip(document, (action) => {
    const track = currentTab()?.snapshot.track;
    if (track) send({ type: MESSAGE.control, tabId: selected!, videoId: track.videoId, action });
  }, snapshot, coreState.settings).then((controller) => { pip?.close(); pip = controller; }).catch((error: unknown) => {
    exportStatus.textContent = error instanceof Error && error.message === 'PIP_UNSUPPORTED' ? 'Document PiP is not supported.' : 'PiP could not be opened.';
  });
});

function connect() {
  try {
    const port = chrome.runtime.connect({ name: PORT.panel });
    currentPort = port;
    port.onMessage.addListener((message: unknown) => {
      if (isPlayerState(message)) { tabs = message.tabs; renderPlayer(); return; }
      if (isCoreStateMessage(message)) { coreState = message.state; renderDesign(coreState.settings); renderPlayer(); return; }
      if (isCoreError(message)) { status.textContent = CORE_ERRORS[message.code]; return; }
      if (!isConnectionStatus(message)) return;
      status.textContent = message.connectedTabs > 0 ? `CONNECTED · YouTube tabs: ${message.connectedTabs}` : 'Waiting for a YouTube connection.';
      recheck.disabled = false;
    });
    port.onDisconnect.addListener(() => {
      void chrome.runtime.lastError;
      currentPort = undefined;
      tabs = [];
      renderPlayer();
      recheck.disabled = true;
      status.textContent = 'Connection recovering...';
      window.setTimeout(connect, 1000);
    });
    port.postMessage({ type: MESSAGE.probe });
  } catch {
    recheck.disabled = true;
    status.textContent = 'Reload the extension and try again.';
  }
}

recheck.addEventListener('click', () => send({ type: MESSAGE.probe }));
window.addEventListener('beforeunload', () => pip?.close());
renderDesign(coreState.settings);
renderPlayer();
connect();
