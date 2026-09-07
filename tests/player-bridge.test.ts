import { describe, expect, it } from 'vitest';
import {
  isPlayerBridgeEvent,
  PLAYER_BRIDGE_CLIENT,
  PLAYER_BRIDGE_SERVER,
  PLAYER_BRIDGE_VERSION,
  playerBridgeCommand,
  playerBridgeInit,
  playerBridgeLoad,
} from '../src/shared/player-bridge';

describe('player bridge protocol', () => {
  it('creates a versioned handshake', () => {
    expect(playerBridgeInit()).toEqual({
      source: PLAYER_BRIDGE_CLIENT,
      version: PLAYER_BRIDGE_VERSION,
      type: 'init',
    });
  });

  it('creates only validated load commands', () => {
    expect(playerBridgeLoad('dQw4w9WgXcQ', true)).toEqual({
      source: PLAYER_BRIDGE_CLIENT,
      version: PLAYER_BRIDGE_VERSION,
      type: 'load',
      videoId: 'dQw4w9WgXcQ',
      autoplay: true,
    });
    expect(playerBridgeLoad('invalid', true)).toBeNull();
  });

  it('creates allowlisted player commands', () => {
    expect(playerBridgeCommand('pause')).toEqual({
      source: PLAYER_BRIDGE_CLIENT,
      version: PLAYER_BRIDGE_VERSION,
      type: 'command',
      action: 'pause',
    });
  });

  it('accepts bridge events and rejects forged messages', () => {
    expect(isPlayerBridgeEvent({ source: PLAYER_BRIDGE_SERVER, version: 1, type: 'ready' })).toBe(true);
    expect(isPlayerBridgeEvent({ source: PLAYER_BRIDGE_SERVER, version: 1, type: 'state', state: 'playing' })).toBe(true);
    expect(isPlayerBridgeEvent({
      source: PLAYER_BRIDGE_SERVER,
      version: 1,
      type: 'metadata',
      videoId: 'dQw4w9WgXcQ',
      videoTitle: 'Never Gonna Give You Up',
      channelTitle: 'Rick Astley',
    })).toBe(true);
    expect(isPlayerBridgeEvent({ source: 'other', version: 1, type: 'state', state: 'playing' })).toBe(false);
    expect(isPlayerBridgeEvent({ source: PLAYER_BRIDGE_SERVER, version: 1, type: 'state', state: 'unknown' })).toBe(false);
  });
});
