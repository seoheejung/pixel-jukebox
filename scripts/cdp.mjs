import { setTimeout as delay } from 'node:timers/promises';

export const endpoint = 'http://127.0.0.1:9223';

export async function connectBrowser() {
  const version = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(3000) }).then((response) => response.json());
  const socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  const listeners = new Set();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const item = pending.get(message.id);
      if (!item) return;
      pending.delete(message.id);
      clearTimeout(item.timer);
      if (message.error) item.reject(new Error(`${item.method}: ${message.error.message}`));
      else item.resolve(message.result);
    } else {
      for (const listener of listeners) listener(message);
    }
  });
  return {
    version: version.Browser,
    onEvent(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    send(method, params = {}, sessionId) {
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method}: timeout`)); }, 30000);
        pending.set(id, { resolve, reject, timer, method });
        socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
    },
    close() {
      for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('CDP connection closed')); }
      pending.clear();
      socket.close();
    },
  };
}

export async function until(check, label, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = await check();
    if (result) return result;
    await delay(200);
  }
  throw new Error(`Timed out: ${label}`);
}

export async function attach(browser, targetId) {
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
  return sessionId;
}

export async function evaluate(browser, sessionId, expression, options = {}) {
  const response = await browser.send('Runtime.evaluate', {
    expression, awaitPromise: true, returnByValue: true, ...options,
  }, sessionId);
  if (response.exceptionDetails) throw new Error(`Chrome evaluation failed: ${response.exceptionDetails.exception?.className ?? 'exception'} at line ${response.exceptionDetails.lineNumber} (values omitted)`);
  return response.result.value;
}
