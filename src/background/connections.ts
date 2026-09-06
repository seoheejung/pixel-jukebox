import { hasType, isPlayerCommand, isTrackUpdate, isYouTubeSender, MESSAGE, PORT } from '../shared/messages';
import { emptySnapshot } from '../shared/track';
import type { TabPlayer } from '../shared/track';

export function createConnections(panelUrl: string) {
  const contents = new Map<number, chrome.runtime.Port>();
  const panels = new Set<chrome.runtime.Port>();
  const states = new Map<number, TabPlayer>();

  function send(port: chrome.runtime.Port, message: object) {
    try {
      port.postMessage(message);
    } catch {
      // 종료된 문서의 Port 전송 경합
      panels.delete(port);
      for (const [id, content] of contents) {
        if (content === port) { contents.delete(id); states.delete(id); }
      }
    }
  }

  function broadcast() {
    for (const panel of panels) {
      send(panel, { type: MESSAGE.playerState, tabs: [...states.values()] });
      send(panel, { type: MESSAGE.status, connectedTabs: contents.size });
    }
  }

  return function connect(port: chrome.runtime.Port) {
    if (port.name === PORT.content && isYouTubeSender(port.sender)) {
      const tabId = port.sender!.tab!.id!;
      port.onMessage.addListener((message: unknown) => {
        if (hasType(message, MESSAGE.ready)) {
          contents.set(tabId, port);
          if (!states.has(tabId)) states.set(tabId, { tabId, active: Boolean(port.sender?.tab?.active), snapshot: emptySnapshot() });
          send(port, { type: MESSAGE.ack });
          broadcast();
        } else if (isTrackUpdate(message) && contents.get(tabId) === port) {
          states.set(tabId, { tabId, active: Boolean(port.sender?.tab?.active), snapshot: message.snapshot });
          broadcast();
        }
      });
      port.onDisconnect.addListener(() => {
        if (contents.get(tabId) === port) { contents.delete(tabId); states.delete(tabId); }
        broadcast();
      });
      return;
    }

    if (port.name === PORT.panel && port.sender?.url === panelUrl && !port.sender.tab) {
      panels.add(port);
      port.onMessage.addListener((message: unknown) => {
        if (hasType(message, MESSAGE.probe)) {
          for (const content of contents.values()) send(content, { type: MESSAGE.probe });
          broadcast();
        } else if (isPlayerCommand(message)) {
          const content = contents.get(message.tabId);
          if (content && states.get(message.tabId)?.snapshot.track?.videoId === message.videoId) send(content, message);
          else broadcast();
        }
      });
      port.onDisconnect.addListener(() => panels.delete(port));
      broadcast();
      return;
    }

    port.disconnect();
  };
}
