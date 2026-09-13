import { describe, expect, it, vi } from 'vitest';
import { isAiMessage, isCoreEdit, MESSAGE, MESSAGE_AI, PORT } from '../src/shared/messages';
import { trackFromVideoId } from '../src/shared/track';
import { playlistTrack } from '../src/shared/playlist';
import { defaultSettings } from '../src/shared/settings';
import { createConnections, isPanelSender } from '../src/background/connections';

describe('Side Panel message boundaries', () => {
  it('accepts only the popup entry and its standalone-window mode', () => {
    const panel = 'chrome-extension://extension-id/sidepanel.html';
    expect(isPanelSender(panel, panel)).toBe(true);
    expect(isPanelSender(panel, `${panel}?window=1`)).toBe(true);
    expect(isPanelSender(panel, `${panel}?window=2`)).toBe(false);
    expect(isPanelSender(panel, 'https://example.com/sidepanel.html?window=1')).toBe(false);
  });

  it('accepts embedded-player track additions without a tab ID', () => {
    expect(isCoreEdit({ type: MESSAGE.coreEdit, change: { kind: 'add', track: playlistTrack(trackFromVideoId('dQw4w9WgXcQ')) } })).toBe(true);
    expect(isCoreEdit({ type: MESSAGE.coreEdit, change: { kind: 'add', tabId: 1, videoId: 'dQw4w9WgXcQ' } })).toBe(false);
  });

  it('accepts only the three saved design controls', () => {
    expect(isCoreEdit({ type: MESSAGE.coreEdit, change: { kind: 'design', settings: defaultSettings } })).toBe(true);
    expect(isCoreEdit({ type: MESSAGE.coreEdit, change: { kind: 'design', settings: { ...defaultSettings, panel: '#fff9ea' } } })).toBe(true);
    expect(isCoreEdit({ type: MESSAGE.coreEdit, change: { kind: 'design', settings: { ...defaultSettings, shell: 'javascript:alert(1)' } } })).toBe(false);
  });

  it('rejects API keys in runtime payloads', () => {
    expect(isAiMessage({ type: MESSAGE_AI.save, persist: false })).toBe(true);
    expect(isAiMessage({ type: MESSAGE_AI.save, persist: false, key: 'blocked' })).toBe(false);
    expect(isAiMessage({ type: MESSAGE_AI.recommend, sourceVideoId: 'dQw4w9WgXcQ' })).toBe(true);
    expect(isAiMessage({ type: MESSAGE_AI.recommend, sourceVideoId: 'dQw4w9WgXcQ', current: trackFromVideoId('dQw4w9WgXcQ') })).toBe(false);
  });

  it('coalesces duplicate recommendation requests from the same panel', async () => {
    let resolveRecommendation: ((value: { candidates: []; recommendations: [] }) => void) | undefined;
    const run = vi.fn((_context?: unknown) => new Promise<{ candidates: []; recommendations: [] }>((resolve) => { resolveRecommendation = resolve; }));
    const messages: unknown[] = [];
    let receive: ((message: unknown) => void) | undefined;
    const port = {
      name: PORT.panel, sender: { url: 'chrome-extension://extension-id/sidepanel.html' },
      postMessage: (message: unknown) => messages.push(message), disconnect: vi.fn(),
      onMessage: { addListener: (listener: (message: unknown) => void) => { receive = listener; } },
      onDisconnect: { addListener: vi.fn() },
    };
    const current = trackFromVideoId('dQw4w9WgXcQ');
    const core = {
      store: { get: vi.fn().mockResolvedValue({ playlist: [playlistTrack(current)], settings: defaultSettings }), update: vi.fn() },
      ai: { status: vi.fn().mockResolvedValue({ configured: true, persisted: false, permission: true, trustedContexts: true }) },
      recommendations: { run },
    };
    createConnections('chrome-extension://extension-id/sidepanel.html', core as never)(port as never);
    receive?.({ type: MESSAGE_AI.recommend, sourceVideoId: current.videoId });
    receive?.({ type: MESSAGE_AI.recommend, sourceVideoId: current.videoId });
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(1);
    resolveRecommendation?.({ candidates: [], recommendations: [] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    receive?.({ type: MESSAGE_AI.recommend, sourceVideoId: current.videoId, refresh: true });
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(2);
    expect(messages).toContainEqual({ type: MESSAGE_AI.recommendations, recommendations: [] });
    const firstContext = run.mock.calls[0]?.[0] as { current: { videoId: string } } | undefined;
    expect(firstContext?.current.videoId).toBe(current.videoId);
    resolveRecommendation?.({ candidates: [], recommendations: [] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    receive?.({ type: MESSAGE_AI.recommend, sourceVideoId: 'M7lc1UVf-VE' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(messages).toContainEqual(expect.objectContaining({ type: MESSAGE_AI.recommendationError, code: 'NO_TRACK' }));
  });
});
