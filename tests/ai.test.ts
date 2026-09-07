import { describe, expect, it } from 'vitest';
import { createAiService } from '../src/background/ai';
import { OPENAI_API_KEY } from '../src/shared/ai';
import { isAiMessage, MESSAGE_AI } from '../src/shared/messages';

function area(initial: Record<string, unknown> = {}, access = true) {
  const values = { ...initial };
  return {
    values,
    get: async (keys: string[]) => Object.fromEntries(keys.filter((key) => key in values).map((key) => [key, values[key]])),
    set: async (next: Record<string, unknown>) => { Object.assign(values, next); },
    remove: async (keys: string[]) => keys.forEach((key) => delete values[key]),
    setAccessLevel: async () => { if (!access) throw new Error('ACCESS_DENIED'); },
  };
}

function service(session = area(), local = area(), permission = true) {
  return createAiService({
    session, local,
    containsPermission: async () => permission,
    requestPermission: async () => true,
    request: async (_input, init) => new Response(null, { status: init.headers && new Headers(init.headers).get('Authorization') ? 200 : 401 }),
  });
}

describe('Phase 3 API key boundary', () => {
  it('keeps the default key in session and persists only on explicit request', async () => {
    const session = area({ [OPENAI_API_KEY]: 'session-secret' });
    const local = area();
    const ai = service(session, local);
    await ai.initialize();
    expect(await ai.save(false)).toBe(true);
    expect(local.values[OPENAI_API_KEY]).toBeUndefined();
    expect((await ai.status()).configured).toBe(true);
    expect((await ai.status()).persisted).toBe(false);
    expect(await ai.save(true)).toBe(true);
    expect(local.values[OPENAI_API_KEY]).toBe('session-secret');
    expect((await ai.status()).persisted).toBe(true);
  });

  it('restores a persistent key to session without exposing it in state', async () => {
    const session = area();
    const local = area({ [OPENAI_API_KEY]: 'persistent-secret' });
    const ai = service(session, local);
    await ai.initialize();
    expect(session.values[OPENAI_API_KEY]).toBe('persistent-secret');
    expect(await ai.status()).toMatchObject({ configured: true, persisted: true });
  });

  it('blocks persistent storage when trusted-context setup fails', async () => {
    const session = area({ [OPENAI_API_KEY]: 'session-secret' });
    const local = area({}, false);
    const ai = service(session, local);
    await ai.initialize();
    expect(await ai.save(true)).toBe(false);
    expect(local.values[OPENAI_API_KEY]).toBeUndefined();
  });

  it('uses the key only inside the service worker request boundary', async () => {
    const session = area({ [OPENAI_API_KEY]: 'session-secret' });
    const ai = service(session);
    await ai.initialize();
    expect(await ai.testConnection()).toBe('ok');
  });

  it('rejects key-bearing runtime payloads', () => {
    expect(isAiMessage({ type: MESSAGE_AI.save, persist: true })).toBe(true);
    expect(isAiMessage({ type: MESSAGE_AI.save, persist: true, key: 'blocked' })).toBe(false);
  });
});
