import { applyDesign } from '../shared/settings';
import type { DesignSettings } from '../shared/settings';
import type { PlayerSnapshot } from '../shared/track';

interface PictureInPictureWindow extends Window {
  documentPictureInPicture?: {
    requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
  };
}

export interface PipController {
  update(snapshot: PlayerSnapshot, settings: DesignSettings): void;
  close(): void;
  focus(): void;
  readonly closed: boolean;
}

interface MovablePlayer { moveTo(container: HTMLElement, before?: Node | null): void }
let activeController: PipController | undefined;
let pendingOpen: Promise<PipController> | undefined;

export async function openPip(
  source: Document,
  player: MovablePlayer,
  _snapshot: PlayerSnapshot,
  settings: DesignSettings,
): Promise<PipController> {
  if (activeController && !activeController.closed) { activeController.focus(); return activeController; }
  if (pendingOpen) return pendingOpen;
  const api = (window as PictureInPictureWindow).documentPictureInPicture;
  if (!api) throw new Error('PIP_UNSUPPORTED');
  pendingOpen = (async () => {
    const pipWindow = await api.requestWindow({ width: 380, height: 520 });
    for (const style of source.querySelectorAll('style, link[rel="stylesheet"]')) pipWindow.document.head.append(style.cloneNode(true));
    pipWindow.document.title = 'Pixel Jukebox';
    applyDesign(pipWindow.document, settings);
    pipWindow.document.documentElement.classList.add('standalone-window');
    pipWindow.document.body.className = 'pip-window';
    const root = pipWindow.document.createElement('main');
    root.className = 'pip-player';
    pipWindow.document.body.replaceChildren(root);
    const originalRoot = source.querySelector<HTMLElement>('#player');
    const originalParent = originalRoot?.parentElement;
    const marker = source.createElement('div');
    marker.className = 'pip-placeholder';
    marker.innerHTML = '<strong>PiP에서 재생 중</strong><button type="button">플레이어 돌아오기</button>';
    if (!originalRoot || !originalParent) throw new Error('PIP_PLAYER_MISSING');
    originalParent.insertBefore(marker, originalRoot);
    player.moveTo(root);
    let restored = false;
    const restore = () => {
      if (restored) return;
      restored = true;
      player.moveTo(originalParent, marker);
      marker.remove();
      activeController = undefined;
    };
    marker.querySelector('button')?.addEventListener('click', () => { pipWindow.close(); restore(); });
    pipWindow.addEventListener('pagehide', restore, { once: true });
    const controller: PipController = {
      update(_next, nextSettings) { applyDesign(pipWindow.document, nextSettings); },
      close: () => { if (!pipWindow.closed) pipWindow.close(); restore(); },
      focus: () => pipWindow.focus(),
      get closed() { return pipWindow.closed; },
    };
    activeController = controller;
    return controller;
  })();
  try { return await pendingOpen; }
  finally { pendingOpen = undefined; }
}
