import { hasType, MESSAGE, PORT } from '../shared/messages';

function connect() {
  try {
    if (!chrome.runtime.id) return;
    const port = chrome.runtime.connect({ name: PORT.content });
    port.onMessage.addListener((message: unknown) => {
      if (hasType(message, MESSAGE.probe)) port.postMessage({ type: MESSAGE.ready });
    });
    port.onDisconnect.addListener(() => {
      void chrome.runtime.lastError;
      window.setTimeout(connect, 1000);
    });
    port.postMessage({ type: MESSAGE.ready });
  } catch {
    // Extension 갱신 후 무효화된 Content Script
  }
}

connect();
