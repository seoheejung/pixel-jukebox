import { describe, expect, it } from 'vitest';
import { isAiMessage, isCoreEdit, MESSAGE, MESSAGE_AI } from '../src/shared/messages';
import { trackFromVideoId } from '../src/shared/track';
import { playlistTrack } from '../src/shared/playlist';
import { defaultSettings } from '../src/shared/settings';

describe('Side Panel message boundaries', () => {
  it('accepts embedded-player track additions without a tab ID', () => {
    expect(isCoreEdit({ type: MESSAGE.coreEdit, change: { kind: 'add', track: playlistTrack(trackFromVideoId('dQw4w9WgXcQ')) } })).toBe(true);
    expect(isCoreEdit({ type: MESSAGE.coreEdit, change: { kind: 'add', tabId: 1, videoId: 'dQw4w9WgXcQ' } })).toBe(false);
  });

  it('accepts only the three saved design controls', () => {
    expect(isCoreEdit({ type: MESSAGE.coreEdit, change: { kind: 'design', settings: defaultSettings } })).toBe(true);
    expect(isCoreEdit({ type: MESSAGE.coreEdit, change: { kind: 'design', settings: { ...defaultSettings, panel: '#fff9ea' } } })).toBe(true);
    expect(isCoreEdit({ type: MESSAGE.coreEdit, change: { kind: 'design', settings: { ...defaultSettings, background: 'javascript:alert(1)' } } })).toBe(false);
  });

  it('rejects API keys in runtime payloads', () => {
    expect(isAiMessage({ type: MESSAGE_AI.save, persist: false })).toBe(true);
    expect(isAiMessage({ type: MESSAGE_AI.save, persist: false, key: 'blocked' })).toBe(false);
  });
});
