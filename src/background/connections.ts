import { isAiMessage, isCoreEdit, hasType, MESSAGE, MESSAGE_AI, PORT } from '../shared/messages';
import { isAiRecommendationMessage, type AiErrorDetails, type RecommendationErrorCode, type RecommendationProgressStage } from '../shared/ai';
import type { CoreChange } from '../shared/messages';
import { addTrack, moveTrack, removeTrack, updateTrack } from '../shared/playlist';
import { trackFromVideoId } from '../shared/track';
import type { CoreState } from '../shared/storage';
import type { CoreStore } from './core-store';
import type { AiService } from './ai';
import type { RecommendationResult } from './recommendation';
import { AiDiagnosticError } from './ai';

interface CoreServices {
  store: CoreStore;
  ai: AiService;
  recommendations: { run(context: { current: import('../shared/track').Track | null; playlist: import('../shared/playlist').PlaylistTrack[]; recent: import('../shared/recommendation').Recommendation[] }, options?: { refresh?: boolean; progress?: (stage: RecommendationProgressStage) => void }): Promise<RecommendationResult> };
}

export function isPanelSender(panelUrl: string, senderUrl: string | undefined): boolean {
  if (!senderUrl) return false;
  try {
    const panel = new URL(panelUrl);
    const sender = new URL(senderUrl);
    return sender.origin === panel.origin && sender.pathname === panel.pathname && sender.hash === '' &&
      (sender.search === '' || sender.search === '?window=1');
  } catch { return false; }
}

type CoreErrorCode = 'LOAD_FAILED' | 'SAVE_FAILED' | 'INVALID_SETTINGS';

export function createConnections(panelUrl: string, core?: CoreServices) {
  const panels = new Set<chrome.runtime.Port>();
  const runningRecommendations = new WeakSet<chrome.runtime.Port>();

  function send(port: chrome.runtime.Port, message: object) {
    try { port.postMessage(message); } catch { panels.delete(port); }
  }

  function broadcast(message: object) {
    for (const panel of panels) send(panel, message);
  }

  function coreError(code: CoreErrorCode, port?: chrome.runtime.Port) {
    if (port) send(port, { type: MESSAGE.coreError, code });
    else broadcast({ type: MESSAGE.coreError, code });
  }

  function loadCore(port: chrome.runtime.Port) {
    if (core) void core.store.get().then((state) => send(port, { type: MESSAGE.coreState, state })).catch(() => coreError('LOAD_FAILED', port));
  }

  function loadAi(port: chrome.runtime.Port) {
    if (core) void core.ai.status().then((state) => send(port, { type: MESSAGE_AI.state, state })).catch(() => undefined);
  }

  async function handleAi(message: { type: string; persist?: boolean }, port: chrome.runtime.Port) {
    if (!core) return;
    if (message.type === MESSAGE_AI.status) {
      send(port, { type: MESSAGE_AI.state, state: await core.ai.status() });
    } else if (message.type === MESSAGE_AI.save) {
      const connection = await core.ai.testConnection();
      const authenticated = connection.result === 'ok';
      const saved = authenticated && await core.ai.save(Boolean(message.persist));
      if (!authenticated) await core.ai.clear();
      const connectionError = connection.error ?? (connection.result === 'permission-denied' ? new AiDiagnosticError('PERMISSION_DENIED', { stage: 'connection' }) : connection.result === 'not-configured' ? new AiDiagnosticError('NOT_CONFIGURED', { stage: 'connection' }) : undefined);
      send(port, { type: MESSAGE_AI.result, result: saved ? 'saved' : 'save-failed', ...(connectionError ? { code: connectionError.code, details: connectionError.details } : {}) });
      send(port, { type: MESSAGE_AI.state, state: await core.ai.status() });
    } else if (message.type === MESSAGE_AI.clear) {
      const cleared = await core.ai.clear();
      send(port, { type: MESSAGE_AI.result, result: cleared ? 'cleared' : 'clear-failed' });
      send(port, { type: MESSAGE_AI.state, state: await core.ai.status() });
    } else if (message.type === MESSAGE_AI.test) {
      const connection = await core.ai.testConnection();
      const connectionError = connection.error ?? (connection.result === 'permission-denied' ? new AiDiagnosticError('PERMISSION_DENIED', { stage: 'connection' }) : connection.result === 'not-configured' ? new AiDiagnosticError('NOT_CONFIGURED', { stage: 'connection' }) : undefined);
      send(port, { type: MESSAGE_AI.result, result: connection.result === 'ok' ? 'test-ok' : connection.result, ...(connectionError ? { code: connectionError.code, details: connectionError.details } : {}) });
    }
  }

  function recommendationError(error: unknown): { code: RecommendationErrorCode; details?: AiErrorDetails } {
    if (error instanceof AiDiagnosticError) return { code: error.code, details: error.details };
    const code = error instanceof Error ? error.message : '';
    return { code: ['NO_TRACK', 'NO_CANDIDATES', 'INVALID_SELECTION', 'PERMISSION_DENIED', 'NOT_CONFIGURED', 'AUTH_ERROR', 'RATE_LIMIT', 'USAGE_ERROR', 'OPENAI_REQUEST_FAILED', 'YOUTUBE_SOURCE_EMPTY', 'YOUTUBE_METADATA_FAILED'].includes(code) ? code as RecommendationErrorCode : 'FAILED' };
  }

  async function recommend(message: { sourceVideoId: string; refresh?: boolean }, port: chrome.runtime.Port) {
    if (!core) return;
    const { playlist } = await core.store.get();
    const source = playlist.find((track) => track.videoId === message.sourceVideoId);
    if (!source) throw new AiDiagnosticError('NO_TRACK', { stage: 'discovery', message: 'The selected Playlist track is unavailable.' });
    const result = await core.recommendations.run({ current: trackFromVideoId(source.videoId, source), playlist, recent: [] }, {
      ...(message.refresh === undefined ? {} : { refresh: message.refresh }),
      progress: (stage) => send(port, { type: MESSAGE_AI.progress, stage }),
    });
    send(port, { type: MESSAGE_AI.recommendations, recommendations: result.recommendations });
  }

  function editCore(change: CoreChange, port: chrome.runtime.Port) {
    if (!core) return;
    void core.store.update((state) => {
      switch (change.kind) {
        case 'add': return { ...state, playlist: addTrack(state.playlist, change.track) };
        case 'update': return { ...state, playlist: updateTrack(state.playlist, change.track) };
        case 'remove': return { ...state, playlist: removeTrack(state.playlist, change.videoId) };
        case 'move': return { ...state, playlist: moveTrack(state.playlist, change.videoId, change.beforeId) };
        case 'design': return { ...state, settings: change.settings };
      }
    }).then((state) => broadcast({ type: MESSAGE.coreState, state })).catch((error: unknown) => {
      coreError(error instanceof Error && error.message === 'INVALID_SETTINGS' ? 'INVALID_SETTINGS' : 'SAVE_FAILED', port);
    });
  }

  function connect(port: chrome.runtime.Port) {
    if (port.name !== PORT.panel || !isPanelSender(panelUrl, port.sender?.url)) { port.disconnect(); return; }
    panels.add(port);
    port.onMessage.addListener((message: unknown) => {
      if (hasType(message, MESSAGE.probe)) { loadCore(port); loadAi(port); return; }
      if (isCoreEdit(message)) { editCore(message.change, port); return; }
      if (isAiRecommendationMessage(message)) {
        if (runningRecommendations.has(port)) return;
        runningRecommendations.add(port);
        void recommend(message, port)
          .catch((error: unknown) => send(port, { type: MESSAGE_AI.recommendationError, ...recommendationError(error) }))
          .finally(() => runningRecommendations.delete(port));
        return;
      }
      if (isAiMessage(message)) void handleAi(message, port).catch(() => send(port, { type: MESSAGE_AI.result, result: 'failed' }));
    });
    port.onDisconnect.addListener(() => panels.delete(port));
    loadCore(port);
    loadAi(port);
  }

  return connect;
}
