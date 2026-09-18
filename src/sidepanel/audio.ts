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
  const videoView = root.querySelector<HTMLElement>('#video-view')!;
  let volume = 100;
  let muted = false;
  let autoSkip = true;
  let target: Window | null = null;
  let connecting = false;
  let skipUnavailable = false;
  const diagnostics: object[] = [];
  let contentBuild = 'not-connected';
  let legacyReadyCount = 0;
  const copyDiagnostics = document.createElement('button');
  copyDiagnostics.id = 'copy-skip-diagnostics';
  copyDiagnostics.type = 'button';
  copyDiagnostics.hidden = true;
  copyDiagnostics.setAttribute('aria-hidden', 'true');
  copyDiagnostics.textContent = 'Copy skip diagnostics';
  skip.after(copyDiagnostics);
  copyDiagnostics.addEventListener('click', async () => {
    const report = {
      build: 'debugger-v3', contentBuild, connected: Boolean(target), autoSkip,
      legacyReadyCount,
      registeredScripts: chrome.runtime.getManifest().content_scripts?.flatMap((script) => script.js ?? []) ?? [],
      debuggerPermission: chrome.runtime.getManifest().permissions?.includes('debugger') === true,
      playerVisible: !videoView.hidden, pageVisibility: root.ownerDocument.visibilityState,
      history: diagnostics,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      copyDiagnostics.textContent = 'Copied';
    } catch { copyDiagnostics.textContent = 'Copy failed — try again'; }
  });
  const registered = () => typeof chrome.runtime.getManifest !== 'function' || Boolean(chrome.runtime.getManifest().content_scripts?.some(script => script.js?.includes('youtube-controls-v3.js')));
  const needsReload = () => !registered() || contentBuild === 'legacy-or-unknown';
  function connectionState() {
    connection.hidden = Boolean(target) || !root.dataset.videoId;
    if (connection.hidden || connecting) return;
    connectionMessage.textContent = needsReload() ? 'Reload the extension and reopen the player to update controls.' : 'Player controls are not connected.';
    connect.textContent = needsReload() ? 'RELOAD' : 'CONNECT';
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
    skip.querySelector('small')!.textContent = autoSkip ? (skipUnavailable ? 'ON · ERROR' : 'ON') : 'OFF';
    skip.title = autoSkip && skipUnavailable ? 'Automatic ad click unavailable. Close player DevTools and reload the extension if needed.' : 'Automatically click Skip Ad when available in this player';
    if (save) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ volume, muted, autoSkip })); } catch { /* Keep session controls available */ }
    }
    const canSkip = autoSkip && !videoView.hidden && root.ownerDocument.visibilityState === 'visible';
    target?.postMessage({ source: SOURCE, version: 1, type: 'settings', volume, muted, autoSkip: canSkip }, ORIGIN);
  }
  slider.addEventListener('input', () => { volume = Number(slider.value); muted = volume === 0; update(true); });
  mute.addEventListener('click', () => { muted = !muted; if (!muted && volume === 0) volume = 50; update(true); });
  skip.addEventListener('click', () => { autoSkip = !autoSkip; update(true); });
  connect.addEventListener('click', async () => {
    if (needsReload()) { chrome.runtime.reload(); return; }
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
    if (event.origin !== ORIGIN || event.data?.source !== SOURCE || event.data.version !== 1 || !['ready', 'skip-status', 'skip-diagnostics'].includes(event.data.type)) return;
    let child: Window | undefined;
    try { child = iframe.contentWindow?.frames[0]; } catch { return; }
    if (!child || event.source !== child) return;
    if (event.data.type === 'ready') {
      if (event.data.contentBuild !== 'debugger-v3') {
        legacyReadyCount++;
        if (!target) { contentBuild = 'legacy-or-unknown'; skipUnavailable = true; connectionState(); }
        return;
      }
      if (contentBuild !== 'debugger-v3') skipUnavailable = false;
      contentBuild = 'debugger-v3';
      target = child;
      slider.disabled = false;
      mute.disabled = false;
      connection.hidden = true;
      update();
    }
    if (event.data.type === 'skip-diagnostics' || event.data.type === 'ready') {
      const data: unknown = event.data.diagnostic;
      if (!data || typeof data !== 'object') return;
      const item = data as Record<string, unknown>;
      const states = ['request-pending', 'settings-paused', 'candidates-filtered', 'no-button'];
      const results = ['none', 'pending', 'input-sent', 'busy', 'no-target', 'attach-failed', 'button-unavailable', 'input-failed', 'unavailable', 'request-rejected', 'message-failed'];
      if (!['debugger-v2', 'debugger-v3'].includes(String(item.build)) || !states.includes(String(item.state)) || !results.includes(String(item.lastResult)) || typeof item.enabled !== 'boolean') return;
      if (typeof item.attempts !== 'number' || !Number.isSafeInteger(item.attempts) || item.attempts < 0 || typeof item.candidates !== 'number' || !Number.isSafeInteger(item.candidates) || item.candidates < 0) return;
      const blocked: Record<string, number> = {};
      if (item.blocked && typeof item.blocked === 'object') {
        for (const [key, value] of Object.entries(item.blocked)) {
          if (['not-element', 'disabled', 'hidden-or-inert', 'zero-size', 'visibility', 'display-or-opacity', 'cooldown'].includes(key) && typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) blocked[key] = value;
        }
      }
      const entry = { state: item.state, enabled: item.enabled, candidates: item.candidates, blocked, attempts: item.attempts, lastResult: item.lastResult };
      if (JSON.stringify(diagnostics.at(-1)) !== JSON.stringify(entry)) {
        diagnostics.push(entry);
        if (diagnostics.length > 12) diagnostics.shift();
      }
      return;
    }
    if (event.data.type === 'skip-status') {
      if (typeof event.data.ok !== 'boolean') return;
      skipUnavailable = !event.data.ok;
      update();
      return;
    }
  });
  const timer = window.setInterval(connectionState, 1500);
  const visibilityObserver = new MutationObserver(() => update());
  visibilityObserver.observe(videoView, { attributes: true, attributeFilter: ['hidden'] });
  const visibilityChanged = () => update();
  document.addEventListener('visibilitychange', visibilityChanged);
  window.addEventListener('pagehide', () => {
    window.clearInterval(timer);
    visibilityObserver.disconnect();
    document.removeEventListener('visibilitychange', visibilityChanged);
  }, { once: true });
  update();
}
