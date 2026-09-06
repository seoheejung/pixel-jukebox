export const PORT = {
  content: 'pixel-jukebox:youtube',
  panel: 'pixel-jukebox:panel',
} as const;

export const MESSAGE = {
  ready: 'CONTENT_READY',
  ack: 'CONTENT_ACK',
  probe: 'CONNECTION_PROBE',
  status: 'CONNECTION_STATUS',
  track: 'TRACK_UPDATE',
  playerState: 'PLAYER_STATE',
  control: 'PLAYER_CONTROL',
} as const;

export interface ConnectionStatus {
  type: typeof MESSAGE.status;
  connectedTabs: number;
}

export interface PlayerCommand {
  type: typeof MESSAGE.control;
  tabId: number;
  videoId: string;
  action: PlayerAction;
}

export function isTrackUpdate(value: unknown): value is { type: typeof MESSAGE.track; snapshot: PlayerSnapshot } {
  return isRecord(value) && value.type === MESSAGE.track && isPlayerSnapshot(value.snapshot);
}

export function isPlayerState(value: unknown): value is { type: typeof MESSAGE.playerState; tabs: TabPlayer[] } {
  return isRecord(value) && value.type === MESSAGE.playerState && Array.isArray(value.tabs) &&
    value.tabs.length <= 100 && value.tabs.every(isTabPlayer);
}

export function isPlayerCommand(value: unknown): value is PlayerCommand {
  return isRecord(value) && value.type === MESSAGE.control &&
    typeof value.tabId === 'number' && Number.isSafeInteger(value.tabId) && value.tabId >= 0 &&
    isVideoId(value.videoId) && typeof value.action === 'string' && ['previous', 'toggle', 'next'].includes(value.action);
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
import { isPlayerSnapshot, isRecord, isTabPlayer, isVideoId } from './track';
import type { PlayerAction, PlayerSnapshot, TabPlayer } from './track';
