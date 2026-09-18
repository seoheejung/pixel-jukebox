import { describe, expect, it, vi } from 'vitest';
import { openStandalonePlayerWindow } from '../src/background/player-window';

describe('standalone player window', () => {
  it('closes the current Side Panel before opening the optional window', async () => {
    const host = {
      tabs: { query: vi.fn().mockResolvedValue([{ id: 17 }]) },
      sidePanel: { setOptions: vi.fn().mockResolvedValue(undefined) },
      windows: { create: vi.fn().mockResolvedValue({ id: 23 }) },
    };

    await openStandalonePlayerWindow(host, 'chrome-extension://extension-id/sidepanel.html?window=1');

    expect(host.tabs.query).toHaveBeenCalledWith({ active: true, lastFocusedWindow: true });
    expect(host.sidePanel.setOptions).toHaveBeenNthCalledWith(1, { enabled: false });
    expect(host.sidePanel.setOptions).toHaveBeenNthCalledWith(2, { tabId: 17, enabled: false });
    expect(host.windows.create).toHaveBeenCalledWith({ url: 'chrome-extension://extension-id/sidepanel.html?window=1', type: 'popup', width: 520, height: 760 });
    const closeOrder = host.sidePanel.setOptions.mock.invocationCallOrder[1] ?? 0;
    const openOrder = host.windows.create.mock.invocationCallOrder[0] ?? 0;
    expect(closeOrder).toBeLessThan(openOrder);
  });
});
