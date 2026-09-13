(() => {
  'use strict';
  const extensionOrigin = `chrome-extension://${chrome.runtime.id}`;
  const ancestors = [...location.ancestorOrigins];
  if (ancestors.length !== 2 || ancestors[0] !== 'https://seoheejung.github.io' || ancestors[1] !== extensionOrigin) return;
  const source = 'pixel-jukebox-youtube-controls';
  let volume = null;
  let muted = false;
  let autoSkip = false;
  let lastReady = 0;
  const clicked = new WeakMap();
  const skipSelectors = '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .ytp-skip-ad-button-modern, .ytp-ad-skip-button-container button, .ytp-ad-skip-button-container [role="button"]';
  const skipLabel = /^(?:skip\s+ads?|광고\s*건너뛰기|건너뛰기)$/i;
  const isLabeledSkip = (button) => {
    const label = button.getAttribute('aria-label')?.replace(/\s+/g, ' ').trim() ?? '';
    const text = button.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    return (label ? skipLabel.test(label) : skipLabel.test(text)) && (!text || skipLabel.test(text));
  };
  const send = (type, detail = {}) => window.top.postMessage({ source, version: 1, type, ...detail }, extensionOrigin);
  const applyAudio = () => {
    if (volume === null) return;
    for (const video of document.querySelectorAll('#movie_player video')) {
      if (video.volume !== volume / 100) video.volume = volume / 100;
      if (video.muted !== muted) video.muted = muted;
    }
  };
  window.addEventListener('message', (event) => {
    if (event.source !== window.top || event.origin !== extensionOrigin) return;
    const data = event.data;
    if (!data || data.source !== source || data.version !== 1 || data.type !== 'settings' || typeof data.volume !== 'number' || !Number.isFinite(data.volume) || data.volume < 0 || data.volume > 100 || typeof data.muted !== 'boolean' || typeof data.autoSkip !== 'boolean') return;
    volume = data.volume;
    muted = data.muted;
    autoSkip = data.autoSkip;
    applyAudio();
    scan();
  });
  function scan() {
    const player = document.querySelector('#movie_player');
    if (!player) return;
    if (player.querySelector('video')) {
      if (Date.now() - lastReady >= 1000) { lastReady = Date.now(); send('ready'); }
      applyAudio();
    }
    if (!autoSkip) return;
    const candidates = new Set(player.querySelectorAll(skipSelectors));
    for (const button of player.querySelectorAll('button, [role="button"]')) {
      if (isLabeledSkip(button)) candidates.add(button);
    }
    for (const candidate of candidates) {
      const button = candidate.matches('button, [role="button"]') ? candidate : candidate.querySelector('button, [role="button"]') ?? candidate;
      if (!(button instanceof HTMLElement) || button.matches(':disabled') || button.closest('[disabled], [aria-disabled="true"], [hidden], [inert], [aria-hidden="true"]')) continue;
      const bounds = button.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) continue;
      let visible = true;
      for (let element = button; element; element = element.parentElement) {
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0) { visible = false; break; }
      }
      if (!visible) continue;
      if (Date.now() - (clicked.get(button) ?? 0) < 1500) continue;
      clicked.set(button, Date.now());
      button.click();
      break;
    }
  }
  const observer = new MutationObserver(scan);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'disabled', 'aria-disabled', 'aria-hidden', 'aria-label', 'role', 'inert'] });
  const timer = setInterval(scan, 500);
  window.addEventListener('pagehide', () => { observer.disconnect(); clearInterval(timer); }, { once: true });
  scan();
})();
