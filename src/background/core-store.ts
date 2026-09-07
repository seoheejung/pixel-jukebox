import { defaultSettings, isDesignSettings } from '../shared/settings';
import { isCoreState, STORAGE } from '../shared/storage';
import type { CoreState, StorageArea } from '../shared/storage';

export function createCoreStore(area: StorageArea) {
  let state: CoreState | undefined;
  let loading: Promise<CoreState> | undefined;
  let queue: Promise<unknown> = Promise.resolve();

  async function load(): Promise<CoreState> {
    if (state) return state;
    if (!loading) {
      loading = area.get([STORAGE.playlist, STORAGE.settings]).then((stored) => {
        const storedSettings = stored[STORAGE.settings];
        const settings = isDesignSettings(storedSettings)
          ? { discStyle: storedSettings.discStyle, background: storedSettings.background, accent: storedSettings.accent }
          : defaultSettings;
        const next = { playlist: stored[STORAGE.playlist] ?? [], settings };
        if (!isCoreState(next)) throw new Error('INVALID_STORAGE');
        state = structuredClone(next);
        return state;
      }).catch((error: unknown) => { loading = undefined; throw error; });
    }
    return loading;
  }

  return {
    async get(): Promise<CoreState> { return structuredClone(await load()); },
    update(change: (current: CoreState) => CoreState): Promise<CoreState> {
      const operation = queue.then(async () => {
        const next = change(structuredClone(await load()));
        if (!isCoreState(next)) throw new Error('INVALID_SETTINGS');
        await area.set({ [STORAGE.playlist]: next.playlist, [STORAGE.settings]: next.settings });
        state = structuredClone(next);
        return structuredClone(state);
      });
      // 저장 실패 후에도 다음 명시적 편집 허용
      queue = operation.catch(() => undefined);
      return operation;
    },
  };
}

export type CoreStore = ReturnType<typeof createCoreStore>;
