import { isDesignSettings } from './settings';
import type { DesignSettings } from './settings';
import { MESSAGE_AI } from './ai';
import { isCoreState } from './storage';
import type { CoreState } from './storage';
import { isPlayerSnapshot, isRecord, isTabPlayer, isVideoId } from './track';
import type { PlayerAction, PlayerSnapshot, TabPlayer } from './track';

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
  coreState: 'CORE_STATE',
  coreEdit: 'CORE_EDIT',
  coreError: 'CORE_ERROR',
  playlistPlay: 'PLAYLIST_PLAY',
  restart: 'PLAYER_RESTART',
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

export type CoreChange =
  | { kind: 'add'; tabId: number; videoId: string }
  | { kind: 'remove'; videoId: string }
  | { kind: 'move'; videoId: string; beforeId: string | null }
  | { kind: 'design'; settings: DesignSettings };

export function isCoreEdit(value: unknown): value is { type: typeof MESSAGE.coreEdit; change: CoreChange } {
  if (!isRecord(value) || value.type !== MESSAGE.coreEdit || !isRecord(value.change)) return false;
  const change = value.change;
  if (change.kind === 'design') return isDesignSettings(change.settings);
  if (!isVideoId(change.videoId)) return false;
  if (change.kind === 'add') return typeof change.tabId === 'number' && Number.isSafeInteger(change.tabId) && change.tabId >= 0;
  return change.kind === 'remove' || (change.kind === 'move' && (change.beforeId === null || isVideoId(change.beforeId)));
}

export function isCoreStateMessage(value: unknown): value is { type: typeof MESSAGE.coreState; state: CoreState } {
  return isRecord(value) && value.type === MESSAGE.coreState && isCoreState(value.state);
}

export function isPlaylistPlay(value: unknown): value is { type: typeof MESSAGE.playlistPlay; tabId: number | null; videoId: string } {
  return isRecord(value) && value.type === MESSAGE.playlistPlay && isVideoId(value.videoId) &&
    (value.tabId === null || (typeof value.tabId === 'number' && Number.isSafeInteger(value.tabId) && value.tabId >= 0));
}

export const CORE_ERRORS = {
  LOAD_FAILED: '저장된 Playlist와 설정을 불러오지 못했습니다. 연결 다시 확인을 눌러주세요.',
  SAVE_FAILED: '변경을 저장하지 못했습니다. 기존 Playlist와 설정을 유지합니다.',
  INVALID_SETTINGS: '본문과 배경·패널 색상의 대비가 부족합니다. 다른 색상을 선택해주세요.',
  NAVIGATION_FAILED: 'YouTube 영상을 열지 못했습니다. 탭 연결을 확인해주세요.',
  TRACK_CHANGED: '영상이 변경되어 추가하지 못했습니다. 현재 영상을 다시 확인해주세요.',
} as const;

export function isCoreError(value: unknown): value is { type: typeof MESSAGE.coreError; code: keyof typeof CORE_ERRORS } {
  return isRecord(value) && value.type === MESSAGE.coreError && typeof value.code === 'string' && Object.hasOwn(CORE_ERRORS, value.code);
}

export function isRestart(value: unknown): value is { type: typeof MESSAGE.restart; videoId: string } {
  return isRecord(value) && value.type === MESSAGE.restart && isVideoId(value.videoId);
}

export { MESSAGE_AI } from './ai';

export function isAiMessage(value: unknown): value is { type: string; persist?: boolean } {
  if (!isRecord(value) || Object.keys(value).some((key) => ['key', 'apiKey', 'token'].includes(key))) return false;
  if ([MESSAGE_AI.status, MESSAGE_AI.clear, MESSAGE_AI.test].includes(value.type as typeof MESSAGE_AI.status)) return Object.keys(value).length === 1;
  return value.type === MESSAGE_AI.save && Object.keys(value).length === 2 && typeof value.persist === 'boolean';
}
