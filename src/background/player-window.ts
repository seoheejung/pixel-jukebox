interface PlayerWindow {
  id?: number | undefined;
  tabs?: Array<{ url?: string | undefined }> | undefined;
}

export interface PlayerWindowHost {
  getAll(info: { populate: boolean }): Promise<PlayerWindow[]>;
  update(windowId: number, updateInfo: { focused: boolean }): Promise<unknown>;
  create(createData: { url: string; type: 'popup'; width: number; height: number }): Promise<unknown>;
}

export async function openOrFocusPlayerWindow(windows: PlayerWindowHost, playerUrl: string): Promise<void> {
  const existing = (await windows.getAll({ populate: true }))
    .find((window) => window.tabs?.some((tab) => tab.url === playerUrl));
  if (existing?.id !== undefined) {
    await windows.update(existing.id, { focused: true });
    return;
  }
  await windows.create({ url: playerUrl, type: 'popup', width: 430, height: 720 });
}
