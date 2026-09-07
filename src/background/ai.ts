import { OPENAI_API_KEY, OPENAI_ORIGIN } from '../shared/ai';
import type { AiState } from '../shared/ai';

interface KeyArea {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
  setAccessLevel?(details: { accessLevel: 'TRUSTED_CONTEXTS' }): Promise<void>;
}

interface AiServicesOptions {
  session: KeyArea;
  local: KeyArea;
  containsPermission(): Promise<boolean>;
  requestPermission(): Promise<boolean>;
  request(input: string, init: RequestInit): Promise<Response>;
}

export function createAiService(options: AiServicesOptions) {
  let sessionTrusted = false;
  let localTrusted = false;
  let initialized: Promise<boolean> | undefined;

  async function restrictAccess(area: KeyArea, kind: 'session' | 'local'): Promise<boolean> {
    if (kind === 'session' ? sessionTrusted : localTrusted) return true;
    if (!area.setAccessLevel) return false;
    try {
      await area.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
      if (kind === 'session') sessionTrusted = true;
      else localTrusted = true;
      return true;
    } catch {
      return false;
    }
  }

  async function initialize(): Promise<boolean> {
    if (!initialized) {
      initialized = (async () => {
        const sessionRestricted = await restrictAccess(options.session, 'session');
        if (!sessionRestricted || !(await restrictAccess(options.local, 'local'))) return false;
        const stored = await options.local.get([OPENAI_API_KEY]);
        const key = stored[OPENAI_API_KEY];
        if (typeof key === 'string' && key.length > 0) await options.session.set({ [OPENAI_API_KEY]: key });
        return true;
      })().catch(() => false);
    }
    return initialized;
  }

  async function sessionKey(): Promise<string | null> {
    const stored = await options.session.get([OPENAI_API_KEY]);
    if (typeof stored[OPENAI_API_KEY] === 'string' && stored[OPENAI_API_KEY].length > 0) return stored[OPENAI_API_KEY] as string;
    if (!await restrictAccess(options.local, 'local')) return null;
    const persistent = await options.local.get([OPENAI_API_KEY]);
    const key = persistent[OPENAI_API_KEY];
    if (typeof key !== 'string' || key.length === 0) return null;
    await options.session.set({ [OPENAI_API_KEY]: key });
    return key;
  }

  async function status(): Promise<AiState> {
    await initialize();
    const permission = await options.containsPermission();
    const key = await sessionKey();
    let persisted = false;
    if (localTrusted) {
      const local = await options.local.get([OPENAI_API_KEY]);
      persisted = typeof local[OPENAI_API_KEY] === 'string' && local[OPENAI_API_KEY].length > 0;
    }
    return { configured: Boolean(key), persisted, permission, trustedContexts: localTrusted };
  }

  return {
    initialize,
    async requestPermission() { return options.requestPermission(); },
    async save(persist: boolean): Promise<boolean> {
      if (!persist) {
        if (localTrusted) await options.local.remove([OPENAI_API_KEY]);
        return true;
      }
      if (!await restrictAccess(options.local, 'local')) return false;
      const key = await sessionKey();
      if (!key) return false;
      try { await options.local.set({ [OPENAI_API_KEY]: key }); return true; }
      catch { return false; }
    },
    async clear(): Promise<boolean> {
      try { await options.session.remove([OPENAI_API_KEY]); } catch { return false; }
      if (await restrictAccess(options.local, 'local')) {
        try { await options.local.remove([OPENAI_API_KEY]); } catch { return false; }
      }
      return localTrusted;
    },
    status,
    async testConnection(): Promise<'ok' | 'not-configured' | 'permission-denied' | 'failed'> {
      if (!await options.containsPermission()) return 'permission-denied';
      const key = await sessionKey();
      if (!key) return 'not-configured';
      try {
        const response = await options.request('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } });
        return response.ok ? 'ok' : 'failed';
      } catch { return 'failed'; }
    },
  };
}

export type AiService = ReturnType<typeof createAiService>;
