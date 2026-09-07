import type { DesignSettings } from '../shared/settings';
import type { PlayerAction, PlayerSnapshot } from '../shared/track';

interface PictureInPictureWindow extends Window {
  documentPictureInPicture?: {
    requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
  };
}

export interface PipController {
  update(snapshot: PlayerSnapshot, settings: DesignSettings): void;
  close(): void;
}

function copyStyles(source: Document, target: Document) {
  for (const style of source.querySelectorAll('style, link[rel="stylesheet"]')) target.head.append(style.cloneNode(true));
}

export async function openPip(
  source: Document,
  onCommand: (action: PlayerAction) => void,
  snapshot: PlayerSnapshot,
  settings: DesignSettings,
): Promise<PipController> {
  const api = (window as PictureInPictureWindow).documentPictureInPicture;
  if (!api) throw new Error('PIP_UNSUPPORTED');
  const pipWindow = await api.requestWindow({ width: 320, height: 420 });
  copyStyles(source, pipWindow.document);
  const root = pipWindow.document.createElement('main');
  root.className = 'pip-player';
  root.innerHTML = `
    <div class="pip-disc" data-playing="false" data-style="lp"><div class="pip-hole"></div></div>
    <p class="pip-title"></p><p class="pip-channel"></p>
    <div class="pip-controls">
      <button type="button" data-action="previous" aria-label="Previous">◀</button>
      <button type="button" data-action="toggle" aria-label="Play or pause">▶</button>
      <button type="button" data-action="next" aria-label="Next">▶</button>
    </div>`;
  pipWindow.document.body.replaceChildren(root);
  const style = pipWindow.document.createElement('style');
  style.textContent = `
    :root { color-scheme: light; font: 12px monospace; }
    body { margin: 0; background: var(--pip-bg, #fff4d8); color: var(--pip-text, #28172f); }
    .pip-player { padding: 16px; text-align: center; }
    .pip-disc { width: 180px; height: 180px; margin: 8px auto 20px; border: 4px solid #28172f; border-radius: 50%; background: #28172f; box-shadow: inset 0 0 0 12px #4b3b50, inset 0 0 0 20px #28172f; animation: spin 12s linear infinite; animation-play-state: paused; }
    .pip-disc[data-style="cd"] { background: #d8d6e5; }
    .pip-disc[data-playing="true"] { animation-play-state: running; }
    .pip-hole { width: 12px; height: 12px; margin: 80px auto; border: 2px solid #28172f; border-radius: 50%; background: var(--pip-panel, #fff9ea); }
    .pip-title { min-height: 36px; font-weight: 700; }
    .pip-channel { min-height: 20px; }
    .pip-controls { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    button { min-height: 44px; border: 2px solid #28172f; background: var(--pip-panel, #fff9ea); color: #28172f; font: inherit; box-shadow: 2px 2px 0 #28172f; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `;
  pipWindow.document.head.append(style);
  const disc = root.querySelector<HTMLElement>('.pip-disc')!;
  const title = root.querySelector<HTMLElement>('.pip-title')!;
  const channel = root.querySelector<HTMLElement>('.pip-channel')!;
  const toggle = root.querySelector<HTMLButtonElement>('[data-action="toggle"]')!;
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-action]')) {
    button.addEventListener('click', () => onCommand(button.dataset.action as PlayerAction));
  }
  const update = (next: PlayerSnapshot, nextSettings: DesignSettings) => {
    const track = next.track;
    const playing = track?.playbackState === 'playing';
    disc.dataset.playing = String(playing);
    disc.dataset.style = nextSettings.discStyle;
    title.textContent = track?.videoTitle ?? 'No YouTube track';
    channel.textContent = track?.channelTitle ?? '';
    toggle.textContent = playing ? 'Ⅱ' : '▶';
    root.style.setProperty('--pip-bg', nextSettings.background);
    root.style.setProperty('--pip-panel', nextSettings.panel);
    root.style.setProperty('--pip-text', nextSettings.text);
  };
  pipWindow.addEventListener('pagehide', () => root.remove());
  update(snapshot, settings);
  return { update, close: () => { if (!pipWindow.closed) pipWindow.close(); } };
}
