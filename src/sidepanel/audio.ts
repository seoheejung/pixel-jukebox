const ORIGIN = 'https://www.youtube.com';
const SOURCE = 'pixel-jukebox-youtube-controls';
const STORAGE_KEY = 'pixel-jukebox-audio';

export function createAudioControls(root: HTMLElement, iframe: HTMLIFrameElement, reconnect: () => void) {
  const slider = root.querySelector<HTMLInputElement>('#player-volume')!;
  const output = root.querySelector<HTMLOutputElement>('#player-volume-value')!;
  const mute = root.querySelector<HTMLButtonElement>('#player-mute')!;
  const skip = document.querySelector<HTMLButtonElement>('#auto-skip-ads')!;
  const connection = root.querySelector<HTMLElement>('.audio-connection')!;
  const connectionMessage = root.querySelector<HTMLElement>('#audio-connection-message')!;
  const connect = root.querySelector<HTMLButtonElement>('#audio-connect')!;
  let volume = 100;
  let muted = false;
  let autoSkip = true;
  let target: Window | null = null;
  let connecting = false;
  const registered = () => typeof chrome.runtime.getManifest !== 'function' || Boolean(chrome.runtime.getManifest().content_scripts?.some(script => script.js?.includes('youtube-controls.js')));
  function connectionState() {
    connection.hidden = Boolean(target) || !root.dataset.videoId;
    if (connection.hidden || connecting) return;
    connectionMessage.textContent = registered() ? 'Player controls are not connected.' : 'Reload the extension to enable controls.';
    connect.textContent = registered() ? 'CONNECT' : 'RELOAD';
  }
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (saved && typeof saved === 'object') {
      if ('volume' in saved && typeof saved.volume === 'number' && Number.isFinite(saved.volume) && saved.volume >= 0 && saved.volume <= 100) volume = saved.volume;
      if ('muted' in saved && typeof saved.muted === 'boolean') muted = saved.muted;
      if ('autoSkip' in saved && typeof saved.autoSkip === 'boolean') autoSkip = saved.autoSkip;
    }
  } catch { /* Optional local preferences */ }
  function update(save = false) {
    slider.value = String(volume);
    output.value = String(muted ? 0 : volume);
    slider.setAttribute('aria-valuetext', muted ? 'Muted' : `${volume}%`);
    mute.textContent = muted ? 'UNMUTE' : 'MUTE';
    mute.setAttribute('aria-label', muted ? 'Unmute audio' : 'Mute audio');
    mute.setAttribute('aria-pressed', String(muted));
    skip.setAttribute('aria-pressed', String(autoSkip));
    skip.querySelector('small')!.textContent = autoSkip ? 'ON' : 'OFF';
    if (save) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ volume, muted, autoSkip })); } catch { /* Keep session controls available */ }
    }
    target?.postMessage({ source: SOURCE, version: 1, type: 'settings', volume, muted, autoSkip }, ORIGIN);
  }
  slider.addEventListener('input', () => { volume = Number(slider.value); muted = volume === 0; update(true); });
  mute.addEventListener('click', () => { muted = !muted; if (!muted && volume === 0) volume = 50; update(true); });
  skip.addEventListener('click', () => { autoSkip = !autoSkip; update(true); });
  connect.addEventListener('click', async () => {
    if (!registered()) { chrome.runtime.reload(); return; }
    connecting = true;
    connect.disabled = true;
    try {
      const granted = await chrome.permissions.request({ origins: [`${ORIGIN}/*`] });
      if (granted) {
        connectionMessage.textContent = 'Connecting player controls…';
        reconnect();
      } else connectionMessage.textContent = 'Allow YouTube access to connect controls.';
    } catch { connectionMessage.textContent = 'Could not connect. Reload the extension and try again.'; }
    finally { connecting = false; connect.disabled = false; }
  });
  iframe.addEventListener('load', () => { target = null; slider.disabled = true; mute.disabled = true; });
  window.addEventListener('message', (event) => {
    if (event.origin !== ORIGIN || event.data?.source !== SOURCE || event.data.version !== 1 || event.data.type !== 'ready') return;
    let child: Window | undefined;
    try { child = iframe.contentWindow?.frames[0]; } catch { return; }
    if (!child || event.source !== child) return;
    target = child;
    slider.disabled = false;
    mute.disabled = false;
    connection.hidden = true;
    update();
  });
  const timer = window.setInterval(connectionState, 1500);
  window.addEventListener('pagehide', () => window.clearInterval(timer), { once: true });
  update();
}
