import { isDesignSettings } from './settings';
import type { DesignSettings } from './settings';
import { isAiRecommendationMessage, MESSAGE_AI } from './ai';
import { isCoreState } from './storage';
import type { CoreState } from './storage';
import { isPlaylistTrack } from './playlist';
import { isRecord, isVideoId } from './track';
import type { PlaylistTrack } from './playlist';

export const PORT = { panel: 'pixel-jukebox:panel' } as const;

export const MESSAGE = {
  probe: 'PANEL_PROBE',
  coreState: 'CORE_STATE',
  coreEdit: 'CORE_EDIT',
  coreError: 'CORE_ERROR',
} as const;

export type CoreChange =
  | { kind: 'add'; track: PlaylistTrack }
  | { kind: 'update'; track: PlaylistTrack }
  | { kind: 'remove'; videoId: string }
  | { kind: 'move'; videoId: string; beforeId: string | null }
  | { kind: 'design'; settings: DesignSettings };

export function isCoreEdit(value: unknown): value is { type: typeof MESSAGE.coreEdit; change: CoreChange } {
  if (!isRecord(value) || value.type !== MESSAGE.coreEdit || !isRecord(value.change)) return false;
  const change = value.change;
  if (change.kind === 'add' || change.kind === 'update') return isPlaylistTrack(change.track);
  if (change.kind === 'design') return isDesignSettings(change.settings);
  if (!isVideoId(change.videoId)) return false;
  return change.kind === 'remove' || (change.kind === 'move' && (change.beforeId === null || isVideoId(change.beforeId)));
}

export function isCoreStateMessage(value: unknown): value is { type: typeof MESSAGE.coreState; state: CoreState } {
  return isRecord(value) && value.type === MESSAGE.coreState && isCoreState(value.state);
}

export function hasType(value: unknown, type: string): boolean {
  return isRecord(value) && value.type === type;
}

export function isAiMessage(value: unknown): value is { type: string; persist?: boolean } {
  if (!isRecord(value) || Object.keys(value).some((key) => ['key', 'apiKey', 'token'].includes(key))) return false;
  if (value.type === MESSAGE_AI.recommend) return isAiRecommendationMessage(value);
  if ([MESSAGE_AI.status, MESSAGE_AI.clear, MESSAGE_AI.test].includes(value.type as typeof MESSAGE_AI.status)) return Object.keys(value).length === 1;
  return value.type === MESSAGE_AI.save && Object.keys(value).length === 2 && typeof value.persist === 'boolean';
}

export { MESSAGE_AI } from './ai';
