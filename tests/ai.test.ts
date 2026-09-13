import { describe, expect, it } from 'vitest';
import { AiDiagnosticError, createAiService } from '../src/background/ai';
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
    expect(await ai.testConnection()).toEqual({ result: 'ok' });
  });

  it('does not request OpenAI while permission or configuration is inactive', async () => {
    let requests = 0;
    const ai = createAiService({
      session: area(), local: area(), containsPermission: async () => false, requestPermission: async () => false,
      request: async () => { requests += 1; return new Response(null, { status: 200 }); },
    });
    await expect(ai.response({})).rejects.toThrow('PERMISSION_DENIED');
    await expect(ai.response({}, 'selection')).rejects.toMatchObject({ message: 'PERMISSION_DENIED', details: { stage: 'selection' } });
    expect(requests).toBe(0);
  });

  it.each([[401, 'AUTH_ERROR'], [429, 'RATE_LIMIT'], [402, 'USAGE_ERROR']] as const)('classifies OpenAI status %i as %s', async (status, code) => {
    const ai = createAiService({
      session: area({ [OPENAI_API_KEY]: 'session-secret' }), local: area(), containsPermission: async () => true, requestPermission: async () => true,
      request: async () => new Response(null, { status }),
    });
    await expect(ai.response({})).rejects.toThrow(code);
  });

  it('reports sanitized 400 details without exposing the API key', async () => {
    const key = 'sk-project-super-secret';
    const ai = createAiService({
      session: area({ [OPENAI_API_KEY]: key }), local: area(), containsPermission: async () => true, requestPermission: async () => true,
      request: async () => new Response(JSON.stringify({ error: { code: 'invalid_value', type: 'invalid_request_error', param: 'tools', message: `Bad ${key} Bearer ${key}` } }), { status: 400, headers: { 'x-request-id': 'req_123' } }),
    });
    const error = await ai.response({}, 'selection').catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(AiDiagnosticError);
    expect(error).toMatchObject({ message: 'BAD_REQUEST', details: { stage: 'selection', status: 400, apiCode: 'invalid_value', apiType: 'invalid_request_error', param: 'tools', requestId: 'req_123' } });
    expect(JSON.stringify((error as AiDiagnosticError).details)).not.toContain(key);
    expect(JSON.stringify((error as AiDiagnosticError).details)).not.toMatch(/sk-project|Bearer\s+sk-/);
  });

  it('distinguishes quota exhaustion from request rate limiting', async () => {
    const ai = createAiService({
      session: area({ [OPENAI_API_KEY]: 'secret' }), local: area(), containsPermission: async () => true, requestPermission: async () => true,
      request: async () => new Response(JSON.stringify({ error: { type: 'insufficient_quota', code: 'credit_balance_exhausted' } }), { status: 429 }),
    });
    await expect(ai.response({}, 'discovery')).rejects.toMatchObject({ message: 'USAGE_ERROR', details: { stage: 'discovery', status: 429 } });
  });

  it.each([[404, 'NOT_FOUND'], [500, 'SERVER_ERROR']] as const)('classifies HTTP %i with stage details', async (status, code) => {
    const ai = createAiService({
      session: area({ [OPENAI_API_KEY]: 'secret' }), local: area(), containsPermission: async () => true, requestPermission: async () => true,
      request: async () => new Response(null, { status }),
    });
    await expect(ai.response({}, 'youtube-search')).rejects.toMatchObject({ message: code, details: { stage: 'youtube-search', status } });
  });

  it('classifies timeouts and invalid JSON without forwarding raw errors', async () => {
    const base = { session: area({ [OPENAI_API_KEY]: 'secret' }), local: area(), containsPermission: async () => true, requestPermission: async () => true };
    const timeout = createAiService({ ...base, request: async () => { throw new DOMException('raw network secret', 'TimeoutError'); } });
    await expect(timeout.response({}, 'selection')).rejects.toMatchObject({ message: 'NETWORK_ERROR', details: { stage: 'selection', message: '요청 시간이 초과되었습니다.' } });
    const invalid = createAiService({ ...base, request: async () => new Response('not-json') });
    await expect(invalid.response({}, 'discovery')).rejects.toMatchObject({ message: 'INVALID_RESPONSE', details: { stage: 'discovery', status: 200 } });
  });

  it('keeps sanitized diagnostics from HTTP 200 failed and incomplete responses', async () => {
    const key = 'sk-live-hidden-value';
    const base = { session: area({ [OPENAI_API_KEY]: key }), local: area(), containsPermission: async () => true, requestPermission: async () => true };
    const failed = createAiService({ ...base, request: async () => new Response(JSON.stringify({ status: 'failed', error: { code: 'tool_error', type: 'response_error', message: `Failed for ${key}` } }), { headers: { 'x-request-id': 'req_failed' } }) });
    const failure = await failed.response({}, 'youtube-search').catch((cause: unknown) => cause) as AiDiagnosticError;
    expect(failure).toMatchObject({ message: 'INVALID_RESPONSE', details: { stage: 'youtube-search', apiCode: 'tool_error', apiType: 'response_error', requestId: 'req_failed' } });
    expect(JSON.stringify(failure.details)).not.toContain(key);
    const incomplete = createAiService({ ...base, request: async () => new Response(JSON.stringify({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }), { headers: { 'x-request-id': 'req_incomplete' } }) });
    await expect(incomplete.response({}, 'selection')).rejects.toMatchObject({ message: 'INVALID_RESPONSE', details: { stage: 'selection', message: 'max_output_tokens', requestId: 'req_incomplete' } });
  });

  it('rejects key-bearing runtime payloads', () => {
    expect(isAiMessage({ type: MESSAGE_AI.save, persist: true })).toBe(true);
    expect(isAiMessage({ type: MESSAGE_AI.save, persist: true, key: 'blocked' })).toBe(false);
  });
});
