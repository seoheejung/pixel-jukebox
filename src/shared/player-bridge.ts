import { isRecord, isVideoId } from './track';
import type { PlaybackState } from './track';

export const PLAYER_BRIDGE_URL = 'https://seoheejung.github.io/pixel-jukebox/player.html';
export const PLAYER_BRIDGE_ORIGIN = new URL(PLAYER_BRIDGE_URL).origin;
export const PLAYER_BRIDGE_VERSION = 1;
export const PLAYER_BRIDGE_CLIENT = 'pixel-jukebox-sidepanel';
export const PLAYER_BRIDGE_SERVER = 'pixel-jukebox-player-bridge';

export type PlayerBridgeCommand =
  | {
      source: typeof PLAYER_BRIDGE_CLIENT;
      version: typeof PLAYER_BRIDGE_VERSION;
      type: 'init';
    }
  | {
      source: typeof PLAYER_BRIDGE_CLIENT;
      version: typeof PLAYER_BRIDGE_VERSION;
      type: 'load';
      videoId: string;
      autoplay: boolean;
      startSeconds?: number;
    }
  | {
      source: typeof PLAYER_BRIDGE_CLIENT;
      version: typeof PLAYER_BRIDGE_VERSION;
      type: 'command';
      action: 'play' | 'pause';
    };

export type PlayerBridgeEvent =
  | {
      source: typeof PLAYER_BRIDGE_SERVER;
      version: typeof PLAYER_BRIDGE_VERSION;
      type: 'ready';
    }
  | {
      source: typeof PLAYER_BRIDGE_SERVER;
      version: typeof PLAYER_BRIDGE_VERSION;
      type: 'state';
      state: PlaybackState;
      videoId?: string;
      currentTime?: number;
    }
  | {
      source: typeof PLAYER_BRIDGE_SERVER;
      version: typeof PLAYER_BRIDGE_VERSION;
      type: 'metadata';
      videoId: string;
      videoTitle: string;
      channelTitle: string;
    }
  | {
      source: typeof PLAYER_BRIDGE_SERVER;
      version: typeof PLAYER_BRIDGE_VERSION;
      type: 'error';
      code: number;
      videoId?: string;
    };

export function isPlayerBridgeEvent(value: unknown): value is PlayerBridgeEvent {
  if (!isRecord(value) || value.source !== PLAYER_BRIDGE_SERVER || value.version !== PLAYER_BRIDGE_VERSION) return false;
  if (value.type === 'ready') return Object.keys(value).length === 3;
  if (value.type === 'state') {
    return typeof value.state === 'string' && ['playing', 'paused', 'buffering', 'ended', 'error'].includes(value.state) &&
      (value.videoId === undefined || isVideoId(value.videoId)) &&
      (value.currentTime === undefined || (typeof value.currentTime === 'number' && Number.isFinite(value.currentTime) && value.currentTime >= 0 && value.currentTime <= 86400));
  }
  if (value.type === 'metadata') {
    return isVideoId(value.videoId) && typeof value.videoTitle === 'string' && value.videoTitle.trim().length > 0 && value.videoTitle.length <= 500 &&
      typeof value.channelTitle === 'string' && value.channelTitle.length <= 200;
  }
  return value.type === 'error' && typeof value.code === 'number' && (value.videoId === undefined || isVideoId(value.videoId));
}

export function playerBridgeInit(): PlayerBridgeCommand {
  return { source: PLAYER_BRIDGE_CLIENT, version: PLAYER_BRIDGE_VERSION, type: 'init' };
}

export function playerBridgeLoad(videoId: string, autoplay: boolean, startSeconds = 0): PlayerBridgeCommand | null {
  if (!isVideoId(videoId) || !Number.isFinite(startSeconds) || startSeconds < 0 || startSeconds > 86400) return null;
  return { source: PLAYER_BRIDGE_CLIENT, version: PLAYER_BRIDGE_VERSION, type: 'load', videoId, autoplay, ...(startSeconds > 0 ? { startSeconds } : {}) };
}

export function playerBridgeCommand(action: 'play' | 'pause'): PlayerBridgeCommand {
  return { source: PLAYER_BRIDGE_CLIENT, version: PLAYER_BRIDGE_VERSION, type: 'command', action };
}
