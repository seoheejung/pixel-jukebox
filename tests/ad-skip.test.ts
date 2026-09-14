import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSkipRequest, registerAdSkip } from '../src/background/ad-skip';

const id = 'a'.repeat(32);
const request = { type: 'PIXEL_JUKEBOX_SKIP_AD', token: '12345678-1234-1234-1234-123456789abc' };
const sender = { id, origin: 'https://www.youtube.com', url: 'https://www.youtube.com/embed/abcdefghijk', documentId: 'document', frameId: 2 };
afterEach(() => vi.unstubAllGlobals());

describe('ad skip request boundary', () => {
  it('accepts only this extension content script in a YouTube embed document', () => {
    vi.stubGlobal('chrome', { runtime: { id } });
    expect(isSkipRequest(request, sender)).toBe(true);
    const { frameId: _frameId, documentId: _documentId, ...popupSender } = sender;
    expect(isSkipRequest(request, popupSender)).toBe(true);
    expect(isSkipRequest(request, { ...popupSender, tab: { id: 1 } as chrome.tabs.Tab })).toBe(false);
    for (const changed of [
      { id: 'b'.repeat(32) }, { origin: 'https://example.com' },
      { url: 'https://www.youtube.com/watch?v=abcdefghijk' },
      { url: 'https://www.youtube.com.evil.test/embed/abcdefghijk' },
      { documentId: '' }, { frameId: 0 },
    ]) expect(isSkipRequest(request, { ...sender, ...changed })).toBe(false);
  });

  it('rejects arbitrary expressions, coordinates and invalid token requests', () => {
    vi.stubGlobal('chrome', { runtime: { id } });
    for (const value of [null, {}, { type: request.type, x: 1, y: 2 }, { ...request, token: '\"];alert(1)' }, { ...request, type: 'OTHER' }]) {
      expect(isSkipRequest(value, sender)).toBe(false);
    }
  });

  it.each(['missing-button', 'input-error'])('detaches and reports failure for %s', async (failure) => {
    const addListener = vi.fn();
    const detach = vi.fn().mockResolvedValue(undefined);
    const sendCommand = vi.fn().mockImplementation(async (_target: unknown, method: string) => {
      if (method === 'Runtime.evaluate') return { result: { value: failure === 'missing-button' ? null : { x: 10, y: 10 } } };
      throw new Error('Frame closed');
    });
    vi.stubGlobal('chrome', {
      runtime: { id, onMessage: { addListener } },
      debugger: {
        getTargets: vi.fn().mockResolvedValue([{ id: 'youtube-frame', url: sender.url }]),
        attach: vi.fn().mockResolvedValue(undefined), detach, sendCommand,
      },
    });
    registerAdSkip();
    const listener = addListener.mock.calls[0]![0] as (message: unknown, source: chrome.runtime.MessageSender, reply: (value: unknown) => void) => boolean;
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await new Promise((resolve) => { expect(listener(request, sender, resolve)).toBe(true); });
      expect(result).toEqual({ ok: false, reason: failure === 'missing-button' ? 'button-unavailable' : 'input-failed' });
    }
    expect(detach).toHaveBeenCalledTimes(2);
    if (failure === 'missing-button') expect(sendCommand.mock.calls.every((call) => call[1] === 'Runtime.evaluate')).toBe(true);
  });
});
