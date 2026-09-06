import { hasType, isYouTubeSender, MESSAGE, PORT } from '../shared/messages';

export function createConnections(panelUrl: string) {
  const contents = new Map<number, chrome.runtime.Port>();
  const panels = new Set<chrome.runtime.Port>();

  function send(port: chrome.runtime.Port, message: object) {
    try {
      port.postMessage(message);
    } catch {
      // 종료된 문서의 Port 전송 경합
      panels.delete(port);
      for (const [id, content] of contents) {
        if (content === port) contents.delete(id);
      }
    }
  }

  function broadcast() {
    for (const panel of panels) {
      send(panel, { type: MESSAGE.status, connectedTabs: contents.size });
    }
  }

  return function connect(port: chrome.runtime.Port) {
    if (port.name === PORT.content && isYouTubeSender(port.sender)) {
      const tabId = port.sender!.tab!.id!;
      port.onMessage.addListener((message: unknown) => {
        if (!hasType(message, MESSAGE.ready)) return;
        contents.set(tabId, port);
        send(port, { type: MESSAGE.ack });
        broadcast();
      });
      port.onDisconnect.addListener(() => {
        if (contents.get(tabId) === port) contents.delete(tabId);
        broadcast();
      });
      return;
    }

    if (port.name === PORT.panel && port.sender?.url === panelUrl && !port.sender.tab) {
      panels.add(port);
      port.onMessage.addListener((message: unknown) => {
        if (!hasType(message, MESSAGE.probe)) return;
        for (const content of contents.values()) send(content, { type: MESSAGE.probe });
        broadcast();
      });
      port.onDisconnect.addListener(() => panels.delete(port));
      broadcast();
      return;
    }

    port.disconnect();
  };
}
