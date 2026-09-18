import { describe, expect, it, vi } from 'vitest';
import { openOrFocusPlayerWindow } from '../src/background/player-window';

const playerUrl = 'chrome-extension://extension-id/sidepanel.html?window=1';

describe('standalone player window', () => {
  it('focuses the existing player window instead of creating another one', async () => {
    const windows = {
      getAll: vi.fn().mockResolvedValue([{ id: 17, tabs: [{ url: playerUrl }] }]),
      update: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue(undefined),
    };

    await openOrFocusPlayerWindow(windows, playerUrl);

    expect(windows.update).toHaveBeenCalledWith(17, { focused: true });
    expect(windows.create).not.toHaveBeenCalled();
  });

  it('creates a dedicated player window when none exists', async () => {
    const windows = {
      getAll: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue(undefined),
    };

    await openOrFocusPlayerWindow(windows, playerUrl);

    expect(windows.create).toHaveBeenCalledWith({ url: playerUrl, type: 'popup', width: 430, height: 720 });
  });
});
