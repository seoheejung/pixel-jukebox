import { isPlaylist } from './playlist';
import type { PlaylistTrack } from './playlist';
import { isDesignSettings, readableSettings } from './settings';
import type { DesignSettings } from './settings';
import { isRecord } from './track';

export const STORAGE = { playlist: 'playlist', settings: 'settings' } as const;

export interface CoreState {
  playlist: PlaylistTrack[];
  settings: DesignSettings;
}

export interface StorageArea {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
}

export function isCoreState(value: unknown): value is CoreState {
  return isRecord(value) && isPlaylist(value.playlist) && isDesignSettings(value.settings) && readableSettings(value.settings);
}
