(() => {
  // 콘텐츠 스크립트 등록 버전 분리
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
  let pendingButton = null;
  let attempts = 0;
  let lastResult = 'none';
  let lastReport = 0;
  let diagnostic = { build: 'debugger-v3', state: 'settings-paused', enabled: false, candidates: 0, blocked: {}, attempts: 0, lastResult: 'none' };
  const report = (state, candidates = 0, blocked = {}) => {
    diagnostic = { build: 'debugger-v3', state, enabled: autoSkip, candidates, blocked, attempts, lastResult };
    if (Date.now() - lastReport < 1000) return;
    lastReport = Date.now();
    send('skip-diagnostics', { diagnostic });
  };
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
    if (!autoSkip) pendingButton?.removeAttribute('data-pixel-jukebox-skip');
    applyAudio();
    scan();
  });
  function scan() {
    const player = document.querySelector('#movie_player');
    if (player?.querySelector('video')) {
      if (Date.now() - lastReady >= 1000) { lastReady = Date.now(); send('ready', { contentBuild: 'debugger-v3', diagnostic }); }
      applyAudio();
    }
    if (!autoSkip || pendingButton) { report(autoSkip ? 'request-pending' : 'settings-paused'); return; }
    // 플레이어 밖으로 분리된 광고 컨트롤 포함
    const candidates = new Set(document.querySelectorAll(skipSelectors));
    for (const button of document.querySelectorAll('button, [role="button"]')) {
      if (isLabeledSkip(button)) candidates.add(button);
    }
    const blocked = {};
    const exclude = (reason) => { blocked[reason] = (blocked[reason] ?? 0) + 1; };
    for (const candidate of candidates) {
      const button = candidate.matches('button, [role="button"]') ? candidate : candidate.querySelector('button, [role="button"]') ?? candidate;
      // aria-hidden은 접근성 상태이며 실제 표시·클릭 가능 여부와 별개
      if (!(button instanceof HTMLElement)) { exclude('not-element'); continue; }
      if (button.matches(':disabled') || button.closest('[disabled], [aria-disabled="true"]')) { exclude('disabled'); continue; }
      if (button.closest('[hidden], [inert]')) { exclude('hidden-or-inert'); continue; }
      const bounds = button.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) { exclude('zero-size'); continue; }
      // 자식의 visibility 재정의를 반영한 최종 표시 상태
      if (getComputedStyle(button).visibility !== 'visible') { exclude('visibility'); continue; }
      let visible = true;
      for (let element = button; element; element = element.parentElement) {
        const style = getComputedStyle(element);
        if (style.display === 'none' || Number(style.opacity) === 0) { visible = false; break; }
      }
      if (!visible) { exclude('display-or-opacity'); continue; }
      if (Date.now() - (clicked.get(button) ?? 0) < 1500) { exclude('cooldown'); continue; }
      clicked.set(button, Date.now());
      const token = crypto.randomUUID();
      pendingButton = button;
      attempts++;
      lastResult = 'pending';
      button.setAttribute('data-pixel-jukebox-skip', token);
      chrome.runtime.sendMessage({ type: 'PIXEL_JUKEBOX_SKIP_AD', token }).then((result) => {
        lastResult = result?.ok === true ? 'input-sent' : (['busy', 'no-target', 'attach-failed', 'button-unavailable', 'input-failed', 'unavailable'].includes(result?.reason) ? result.reason : 'request-rejected');
        send('skip-status', { ok: result?.ok === true });
      }).catch(() => { lastResult = 'message-failed'; send('skip-status', { ok: false }); }).finally(() => {
        button.removeAttribute('data-pixel-jukebox-skip');
        pendingButton = null;
      });
      break;
    }
    report(pendingButton ? 'request-pending' : (candidates.size ? 'candidates-filtered' : 'no-button'), candidates.size, blocked);
  }
  const observer = new MutationObserver(scan);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'disabled', 'aria-disabled', 'aria-hidden', 'aria-label', 'role', 'inert'] });
  const timer = setInterval(scan, 500);
  window.addEventListener('pagehide', () => { observer.disconnect(); clearInterval(timer); }, { once: true });
  scan();
})();
