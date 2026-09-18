export interface PlayerWindowHost {
  tabs: { query(queryInfo: { active: boolean; lastFocusedWindow: boolean }): Promise<Array<{ id?: number | undefined }>> };
  sidePanel: { setOptions(options: { tabId?: number; enabled: boolean }): Promise<void> };
  windows: {
    create(options: { url: string; type: 'popup'; width: number; height: number }): Promise<{ id?: number | undefined } | undefined>;
    update?(windowId: number, updateInfo: { focused: boolean }): Promise<unknown>;
  };
}

export async function focusStandalonePlayerWindow(host: PlayerWindowHost, windowId: number): Promise<void> {
  await host.windows.update?.(windowId, { focused: true });
}

export async function openStandalonePlayerWindow(host: PlayerWindowHost, playerUrl: string): Promise<number | undefined> {
  const [activeTab] = await host.tabs.query({ active: true, lastFocusedWindow: true });
  await host.sidePanel.setOptions({ enabled: false });
  if (activeTab?.id !== undefined) await host.sidePanel.setOptions({ tabId: activeTab.id, enabled: false });
  const created = await host.windows.create({ url: playerUrl, type: 'popup', width: 520, height: 760 });
  return created?.id;
}
