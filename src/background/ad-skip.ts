const REQUEST = 'PIXEL_JUKEBOX_SKIP_AD';
const MARKER = 'data-pixel-jukebox-skip';
const YOUTUBE = 'https://www.youtube.com';
const BRIDGE = 'https://seoheejung.github.io';

export function isSkipRequest(message: unknown, sender: chrome.runtime.MessageSender): message is { type: string; token: string } {
  if (!message || typeof message !== 'object') return false;
  const data = message as Record<string, unknown>;
  if (data.type !== REQUEST || typeof data.token !== 'string' || !/^[a-f0-9-]{36}$/.test(data.token)) return false;
  if (sender.id !== chrome.runtime.id || sender.origin !== YOUTUBE) return false;
  if (sender.documentId !== undefined && !sender.documentId) return false;
  // 팝업에서 누락되는 문서·프레임 ID는 대상 ancestry와 토큰으로 검증
  if (sender.frameId !== undefined && (!Number.isInteger(sender.frameId) || sender.frameId <= 0)) return false;
  if (sender.tab && (sender.frameId === undefined || !sender.documentId)) return false;
  try {
    const url = new URL(sender.url ?? '');
    return url.origin === YOUTUBE && url.pathname.startsWith('/embed/');
  } catch { return false; }
}

function buttonPosition(token: string): string {
  return `(() => {
    const ancestors = [...location.ancestorOrigins];
    if (location.origin !== ${JSON.stringify(YOUTUBE)} || ancestors.length !== 2 ||
        ancestors[0] !== ${JSON.stringify(BRIDGE)} || ancestors[1] !== ${JSON.stringify(`chrome-extension://${chrome.runtime.id}`)}) return null;
    const button = document.querySelector('[${MARKER}="${token}"]');
    if (!(button instanceof HTMLElement) || !button.matches('button, [role="button"], .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .ytp-skip-ad-button-modern') ||
        button.matches(':disabled') || button.closest('[disabled], [aria-disabled="true"], [hidden], [inert]') ||
        getComputedStyle(button).visibility !== 'visible') return null;
    for (let node = button; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || Number(style.opacity) === 0) return null;
    }
    const rect = button.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    if (!hit || !button.contains(hit)) return null;
    return { x, y };
  })()`;
}

export function registerAdSkip() {
  let busy = false;
  async function click(token: string, url: string) {
    if (busy) return { ok: false, reason: 'busy' };
    busy = true;
    try {
      const targets = await chrome.debugger.getTargets();
      let reason = 'no-target';
      for (const target of targets.filter((item) => item.url === url)) {
        const debuggee = { targetId: target.id };
        let attached = false;
        reason = 'attach-failed';
        try {
          await chrome.debugger.attach(debuggee, '1.3');
          attached = true;
          reason = 'button-unavailable';
          const result = await chrome.debugger.sendCommand(debuggee, 'Runtime.evaluate', {
            expression: buttonPosition(token), returnByValue: true,
          }) as { result?: { value?: { x?: unknown; y?: unknown } } };
          const point = result.result?.value;
          if (!point || typeof point.x !== 'number' || typeof point.y !== 'number' || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
          const position = { x: point.x, y: point.y, button: 'left', clickCount: 1 };
          reason = 'input-failed';
          await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', { ...position, type: 'mousePressed', buttons: 1 });
          await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', { ...position, type: 'mouseReleased', buttons: 0 });
          return { ok: true };
        } catch { /* 프레임 종료 또는 디버거 연결 실패 */ }
        finally {
          if (attached) {
            try { await chrome.debugger.detach(debuggee); } catch { /* 이미 종료된 프레임 */ }
          }
        }
      }
      return { ok: false, reason };
    } finally { busy = false; }
  }
  chrome.runtime.onMessage.addListener((message: unknown, sender, reply) => {
    if (!isSkipRequest(message, sender)) return false;
    void click(message.token, sender.url!).then(reply, () => reply({ ok: false, reason: 'unavailable' }));
    return true;
  });
}
