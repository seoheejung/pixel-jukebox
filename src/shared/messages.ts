export const PORT = {
  content: 'pixel-jukebox:youtube',
  panel: 'pixel-jukebox:panel',
} as const;

export const MESSAGE = {
  ready: 'CONTENT_READY',
  ack: 'CONTENT_ACK',
  probe: 'CONNECTION_PROBE',
  status: 'CONNECTION_STATUS',
} as const;

export interface ConnectionStatus {
  type: typeof MESSAGE.status;
  connectedTabs: number;
}

export function hasType(value: unknown, type: string): boolean {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === type;
}

export function isConnectionStatus(value: unknown): value is ConnectionStatus {
  return hasType(value, MESSAGE.status) && typeof value === 'object' && value !== null &&
    'connectedTabs' in value && typeof value.connectedTabs === 'number' &&
    Number.isSafeInteger(value.connectedTabs) && value.connectedTabs >= 0;
}

export function isYouTubeSender(sender: chrome.runtime.MessageSender | undefined): boolean {
  if (sender?.tab?.id === undefined || sender.frameId !== 0 || !sender.url) return false;
  try {
    return new URL(sender.url).origin === 'https://www.youtube.com';
  } catch {
    return false;
  }
}
