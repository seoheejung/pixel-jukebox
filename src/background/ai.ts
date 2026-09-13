import { OPENAI_API_KEY, OPENAI_ORIGIN } from '../shared/ai';
import type { AiErrorDetails, AiState, RecommendationErrorCode, RecommendationStage } from '../shared/ai';

export class AiDiagnosticError extends Error {
  constructor(public readonly code: RecommendationErrorCode, public readonly details: AiErrorDetails) {
    super(code);
    this.name = 'AiDiagnosticError';
  }
}

function safeText(value: unknown, key: string): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return value.replace(new RegExp(escaped, 'g'), '[REDACTED]').replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]').replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]').replace(/[\r\n\t]+/g, ' ').slice(0, 300);
}

async function failure(response: Response, key: string, stage: RecommendationStage): Promise<AiDiagnosticError> {
  let payload: unknown;
  try { payload = await response.json(); } catch { payload = undefined; }
  const error = payload && typeof payload === 'object' && 'error' in payload && payload.error && typeof payload.error === 'object' ? payload.error as Record<string, unknown> : {};
  const apiCode = safeText(error.code, key);
  const apiType = safeText(error.type, key);
  const usageCodes = ['insufficient_quota', 'credit_balance_exhausted', 'organization_spend_limit_exceeded', 'project_spend_limit_exceeded', 'organization_usage_limit_exceeded'];
  const code: RecommendationErrorCode = response.status === 401 || response.status === 403 ? 'AUTH_ERROR'
    : response.status === 429 && (usageCodes.includes(apiCode ?? '') || usageCodes.includes(apiType ?? '')) ? 'USAGE_ERROR'
    : response.status === 429 ? 'RATE_LIMIT' : response.status === 402 ? 'USAGE_ERROR'
    : response.status === 400 ? 'BAD_REQUEST' : response.status === 404 ? 'NOT_FOUND'
    : response.status >= 500 ? 'SERVER_ERROR' : 'OPENAI_REQUEST_FAILED';
  const optional = { apiCode, apiType, param: safeText(error.param, key), message: safeText(error.message, key), requestId: safeText(response.headers.get('x-request-id'), key) };
  return new AiDiagnosticError(code, { stage, status: response.status, ...Object.fromEntries(Object.entries(optional).filter((entry): entry is [string, string] => entry[1] !== undefined)) });
}

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
    async testConnection(): Promise<{ result: 'ok' | 'not-configured' | 'permission-denied' | 'failed'; error?: AiDiagnosticError }> {
      if (!await options.containsPermission()) return { result: 'permission-denied' };
      const key = await sessionKey();
      if (!key) return { result: 'not-configured' };
      try {
        const response = await options.request('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) });
        return response.ok ? { result: 'ok' } : { result: 'failed', error: await failure(response, key, 'connection') };
      } catch (cause) {
        const message = cause instanceof Error && cause.name === 'TimeoutError' ? '요청 시간이 초과되었습니다.' : '네트워크 연결을 확인하세요.';
        return { result: 'failed', error: new AiDiagnosticError('NETWORK_ERROR', { stage: 'connection', message }) };
      }
    },
    async response(body: Record<string, unknown>, stage: RecommendationStage = 'discovery'): Promise<unknown> {
      if (!await options.containsPermission()) throw new AiDiagnosticError('PERMISSION_DENIED', { stage });
      const key = await sessionKey();
      if (!key) throw new AiDiagnosticError('NOT_CONFIGURED', { stage });
      let response: Response;
      try {
        response = await options.request('https://api.openai.com/v1/responses', {
          method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000),
        });
      } catch (cause) {
        const message = cause instanceof Error && cause.name === 'TimeoutError' ? '요청 시간이 초과되었습니다.' : '네트워크 연결을 확인하세요.';
        throw new AiDiagnosticError('NETWORK_ERROR', { stage, message });
      }
      if (!response.ok) throw await failure(response, key, stage);
      try {
        const payload: unknown = await response.json();
        if (payload && typeof payload === 'object' && 'status' in payload && (payload.status === 'failed' || payload.status === 'incomplete')) {
          const record = payload as Record<string, unknown>;
          const embedded = record.error && typeof record.error === 'object' ? record.error as Record<string, unknown> : {};
          const incomplete = record.incomplete_details && typeof record.incomplete_details === 'object' ? record.incomplete_details as Record<string, unknown> : {};
          const optional = {
            apiCode: safeText(embedded.code, key), apiType: safeText(embedded.type, key), param: safeText(embedded.param, key),
            message: safeText(payload.status === 'failed' ? embedded.message : incomplete.reason, key), requestId: safeText(response.headers.get('x-request-id'), key),
          };
          throw new AiDiagnosticError('INVALID_RESPONSE', { stage, status: response.status, ...Object.fromEntries(Object.entries(optional).filter((entry): entry is [string, string] => entry[1] !== undefined)) });
        }
        return payload;
      } catch (cause) {
        if (cause instanceof AiDiagnosticError) throw cause;
        const requestId = safeText(response.headers.get('x-request-id'), key);
        throw new AiDiagnosticError('INVALID_RESPONSE', { stage, status: response.status, message: '응답 JSON을 읽을 수 없습니다.', ...(requestId ? { requestId } : {}) });
      }
    },
  };
}

export type AiService = ReturnType<typeof createAiService>;
