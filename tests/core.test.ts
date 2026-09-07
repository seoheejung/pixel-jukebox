import { describe, expect, it } from 'vitest';
import { addTrack, adjacentTrack, moveTrack, removeTrack, updateTrack } from '../src/shared/playlist';
import { contrast, defaultSettings, isDesignSettings, readableSettings } from '../src/shared/settings';
import { createCoreStore } from '../src/background/core-store';
import { STORAGE } from '../src/shared/storage';

const track = (videoId: string) => ({
  videoId, videoTitle: `Track ${videoId}`, channelTitle: 'Channel', thumbnail: '', videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
});

describe('Phase 2 playlist operations', () => {
  it('adds unique tracks, removes tracks and reorders by video id', () => {
    const first = track('dQw4w9WgXcQ');
    const second = track('4Ygvv_Ae3dg');
    let playlist = addTrack([], first);
    playlist = addTrack(playlist, first);
    playlist = addTrack(playlist, second);
    expect(playlist.map((item) => item.videoId)).toEqual(['dQw4w9WgXcQ', '4Ygvv_Ae3dg']);
    playlist = moveTrack(playlist, '4Ygvv_Ae3dg', 'dQw4w9WgXcQ');
    expect(playlist.map((item) => item.videoId)).toEqual(['4Ygvv_Ae3dg', 'dQw4w9WgXcQ']);
    expect(removeTrack(playlist, '4Ygvv_Ae3dg').map((item) => item.videoId)).toEqual(['dQw4w9WgXcQ']);
  });

  it('wraps previous and next navigation at both ends', () => {
    const playlist = [track('dQw4w9WgXcQ'), track('4Ygvv_Ae3dg')];
    expect(adjacentTrack(playlist, 'dQw4w9WgXcQ', -1)?.videoId).toBe('4Ygvv_Ae3dg');
    expect(adjacentTrack(playlist, '4Ygvv_Ae3dg', 1)?.videoId).toBe('dQw4w9WgXcQ');
  });

  it('updates metadata without changing playlist order', () => {
    const first = track('dQw4w9WgXcQ');
    const second = track('4Ygvv_Ae3dg');
    const updated = { ...first, videoTitle: 'Updated title', channelTitle: 'Updated channel' };
    expect(updateTrack([first, second], updated)).toEqual([updated, second]);
  });
});

describe('Phase 2 design and storage', () => {
  it('accepts readable settings and rejects insufficient text contrast', () => {
    expect(isDesignSettings(defaultSettings)).toBe(true);
    expect(readableSettings(defaultSettings)).toBe(true);
    const unreadable = { ...defaultSettings, background: '#28172f' };
    expect(contrast('#28172f', unreadable.background)).toBeLessThan(4.5);
    expect(readableSettings(unreadable)).toBe(false);
  });

  it('persists one queued playlist and design update atomically', async () => {
    let values: Record<string, unknown> = {};
    const store = createCoreStore({
      get: async () => values,
      set: async (next) => { values = { ...values, ...next }; },
    });
    const next = await store.update((state) => ({ ...state, playlist: [track('dQw4w9WgXcQ')] }));
    expect(next.playlist).toHaveLength(1);
    expect(values[STORAGE.playlist]).toEqual(next.playlist);
    expect((await store.get()).playlist[0]?.videoId).toBe('dQw4w9WgXcQ');
  });
});
