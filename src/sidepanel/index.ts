import { isConnectionStatus, isPlayerState, MESSAGE, PORT } from '../shared/messages';
import { emptySnapshot } from '../shared/track';
import type { TabPlayer } from '../shared/track';
import { createPlayer } from './player';
import './style.css';

const status = document.querySelector<HTMLParagraphElement>('#connection-status')!;
const recheck = document.querySelector<HTMLButtonElement>('#recheck')!;
let currentPort: chrome.runtime.Port | undefined;
const selector = document.querySelector<HTMLSelectElement>('#tab-select')!;
let tabs: TabPlayer[] = [];
let selected: number | undefined;
const player = createPlayer(document.querySelector<HTMLElement>('#player')!, (action) => {
  const current = tabs.find((tab) => tab.tabId === selected);
  if (!current?.snapshot.track) return;
  try { currentPort?.postMessage({ type: MESSAGE.control, tabId: current.tabId, videoId: current.snapshot.track.videoId, action }); }
  catch { status.textContent = '연결 복구 중…'; }
});

function renderPlayer() {
  if (!tabs.some((tab) => tab.tabId === selected)) selected = tabs.find((tab) => tab.active && tab.snapshot.track)?.tabId ?? tabs.find((tab) => tab.snapshot.track)?.tabId ?? tabs[0]?.tabId;
  selector.replaceChildren(...tabs.map((tab, index) => {
    const option = document.createElement('option');
    option.value = String(tab.tabId);
    option.textContent = `탭 ${index + 1} · ${tab.snapshot.track?.videoTitle ?? '영상 없음'}`;
    return option;
  }));
  if (selected !== undefined) selector.value = String(selected);
  selector.disabled = tabs.length === 0;
  player.render(tabs.find((tab) => tab.tabId === selected)?.snapshot ?? emptySnapshot());
}

selector.addEventListener('change', () => { selected = Number(selector.value); renderPlayer(); });

function connect() {
  try {
    const port = chrome.runtime.connect({ name: PORT.panel });
    currentPort = port;
    port.onMessage.addListener((message: unknown) => {
      if (isPlayerState(message)) { tabs = message.tabs; renderPlayer(); return; }
      if (!isConnectionStatus(message)) return;
      status.textContent = message.connectedTabs > 0
        ? `연결됨 · YouTube 탭 ${message.connectedTabs}개`
        : 'YouTube 연결 대기 중';
      recheck.disabled = false;
    });
    port.onDisconnect.addListener(() => {
      void chrome.runtime.lastError;
      currentPort = undefined;
      tabs = [];
      renderPlayer();
      recheck.disabled = true;
      status.textContent = '연결 복구 중…';
      window.setTimeout(connect, 1000);
    });
    port.postMessage({ type: MESSAGE.probe });
  } catch {
    recheck.disabled = true;
    status.textContent = '확장 프로그램을 다시 로드한 후 패널을 열어주세요.';
  }
}

recheck.addEventListener('click', () => {
  try {
    currentPort?.postMessage({ type: MESSAGE.probe });
  } catch {
    status.textContent = '연결 복구 중…';
  }
});

connect();
