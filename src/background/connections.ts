import { hasType, isAiMessage, isCoreEdit, isOpenVideo, isPlayerCommand, isPlaylistPlay, isTrackUpdate, isYouTubeSender, MESSAGE, MESSAGE_AI, PORT } from '../shared/messages';
import { isAiRecommendationMessage, type RecommendationErrorCode } from '../shared/ai';
import type { CoreChange, CORE_ERRORS, PlayerCommand } from '../shared/messages';
import { addTrack, adjacentTrack, moveTrack, playlistTrack, removeTrack } from '../shared/playlist';
import type { CoreState } from '../shared/storage';
import { emptySnapshot } from '../shared/track';
import type { TabPlayer } from '../shared/track';
import type { CoreStore } from './core-store';
import type { AiService } from './ai';
import type { RecommendationResult } from './recommendation';

interface CoreServices {
  store: CoreStore;
  navigate(tabId: number | null, videoId: string): Promise<void>;
  ai: AiService;
  recommendations: { run(context: { current: import('../shared/track').Track | null; playlist: import('../shared/playlist').PlaylistTrack[]; recent: import('../shared/recommendation').Recommendation[] }, options?: { refresh?: boolean }): Promise<RecommendationResult> };
}

export function createConnections(panelUrl: string, core?: CoreServices) {
  const contents = new Map<number, chrome.runtime.Port>();
  const panels = new Set<chrome.runtime.Port>();
  const states = new Map<number, TabPlayer>();
  const navigating = new Map<number, { videoId: string; timer: ReturnType<typeof setTimeout> }>();
  const pendingLinks = new Map<string, ReturnType<typeof setTimeout>>();

  function send(port: chrome.runtime.Port, message: object) {
    try {
      port.postMessage(message);
    } catch {
      // 종료된 문서의 Port 전송 경합
      panels.delete(port);
      for (const [id, content] of contents) {
        if (content === port) { contents.delete(id); states.delete(id); }
      }
    }
  }

  function broadcast() {
    for (const panel of panels) {
      send(panel, { type: MESSAGE.playerState, tabs: [...states.values()] });
      send(panel, { type: MESSAGE.status, connectedTabs: contents.size });
    }
  }

  function coreError(code: keyof typeof CORE_ERRORS, port?: chrome.runtime.Port) {
    for (const panel of port ? [port] : panels) send(panel, { type: MESSAGE.coreError, code });
  }

  function sendCore(state: CoreState, port?: chrome.runtime.Port) {
    for (const panel of port ? [port] : panels) send(panel, { type: MESSAGE.coreState, state });
  }

  function loadCore(port: chrome.runtime.Port) {
    if (core) void core.store.get().then((state) => sendCore(state, port)).catch(() => coreError('LOAD_FAILED', port));
  }

  function loadAi(port: chrome.runtime.Port) {
    if (core) void core.ai.status().then((state) => send(port, { type: MESSAGE_AI.state, state })).catch(() => send(port, { type: MESSAGE_AI.result, result: 'failed' }));
  }

  async function handleAi(message: { type: string; persist?: boolean }, port: chrome.runtime.Port) {
    if (!core) return;
    if (message.type === MESSAGE_AI.status) {
      send(port, { type: MESSAGE_AI.state, state: await core.ai.status() });
    } else if (message.type === MESSAGE_AI.save) {
      const saved = await core.ai.save(Boolean(message.persist));
      send(port, { type: MESSAGE_AI.result, result: saved ? 'saved' : 'save-failed' });
      send(port, { type: MESSAGE_AI.state, state: await core.ai.status() });
    } else if (message.type === MESSAGE_AI.clear) {
      const cleared = await core.ai.clear();
      send(port, { type: MESSAGE_AI.result, result: cleared ? 'cleared' : 'clear-failed' });
      send(port, { type: MESSAGE_AI.state, state: await core.ai.status() });
    } else if (message.type === MESSAGE_AI.test) {
      const result = await core.ai.testConnection();
      send(port, { type: MESSAGE_AI.result, result: result === 'ok' ? 'test-ok' : result });
    }
  }

  function recommendationErrorCode(error: unknown): RecommendationErrorCode {
    const code = error instanceof Error ? error.message : '';
    return ['NO_TRACK', 'NO_CANDIDATES', 'INVALID_SELECTION', 'AUTH_ERROR', 'RATE_LIMIT', 'USAGE_ERROR', 'OPENAI_REQUEST_FAILED'].includes(code) ? code as RecommendationErrorCode : 'FAILED';
  }

  async function recommend(tabId: number, port: chrome.runtime.Port, refresh = false) {
    if (!core || !states.has(tabId)) { send(port, { type: MESSAGE_AI.recommendationError, code: 'NO_TRACK' }); return; }
    const current = states.get(tabId)?.snapshot.track ?? null;
    if (!current) { send(port, { type: MESSAGE_AI.recommendationError, code: 'NO_TRACK' }); return; }
    const { playlist } = await core.store.get();
    const result = await core.recommendations.run({ current, playlist, recent: [] }, { refresh });
    send(port, { type: MESSAGE_AI.recommendations, recommendations: result.recommendations });
  }

  async function navigate(tabId: number | null, videoId: string): Promise<boolean> {
    if (!core || (tabId !== null && navigating.has(tabId))) return false;
    const previous = tabId === null ? undefined : states.get(tabId);
    if (tabId !== null && previous?.snapshot.track?.videoId === videoId && contents.has(tabId)) {
      send(contents.get(tabId)!, { type: MESSAGE.restart, videoId });
      return true;
    }
    if (tabId !== null) {
      const timer = setTimeout(() => {
        navigating.delete(tabId);
        coreError('NAVIGATION_FAILED');
      }, 20000);
      navigating.set(tabId, { videoId, timer });
      if (previous) states.set(tabId, { ...previous, snapshot: emptySnapshot() });
      broadcast();
    }
    try { await core.navigate(tabId, videoId); return true; }
    catch {
      if (tabId !== null) {
        clearTimeout(navigating.get(tabId)?.timer);
        navigating.delete(tabId);
        if (previous) states.set(tabId, previous);
        broadcast();
      }
      coreError('NAVIGATION_FAILED');
      return false;
    }
  }

  function rememberLink(videoId: string) {
    clearTimeout(pendingLinks.get(videoId));
    pendingLinks.set(videoId, setTimeout(() => pendingLinks.delete(videoId), 30000));
  }

  function consumeLink(videoId: string): boolean {
    const timer = pendingLinks.get(videoId);
    if (!timer) return false;
    clearTimeout(timer);
    pendingLinks.delete(videoId);
    return true;
  }

  function editCore(change: CoreChange, port: chrome.runtime.Port) {
    if (!core) return;
    const track = change.kind === 'add' ? states.get(change.tabId)?.snapshot.track : null;
    if (change.kind === 'add' && (!track || track.videoId !== change.videoId)) { coreError('TRACK_CHANGED', port); return; }
    void core.store.update((state) => {
      switch (change.kind) {
        case 'add': return { ...state, playlist: addTrack(state.playlist, playlistTrack(track!)) };
        case 'remove': return { ...state, playlist: removeTrack(state.playlist, change.videoId) };
        case 'move': return { ...state, playlist: moveTrack(state.playlist, change.videoId, change.beforeId) };
        case 'design': return { ...state, settings: change.settings };
      }
    }).then((state) => sendCore(state)).catch((error: unknown) => {
      coreError(error instanceof Error && error.message === 'INVALID_SETTINGS' ? 'INVALID_SETTINGS' : 'SAVE_FAILED', port);
    });
  }

  async function control(message: PlayerCommand) {
    const content = contents.get(message.tabId);
    if (!content || states.get(message.tabId)?.snapshot.track?.videoId !== message.videoId) { broadcast(); return; }
    if (core && message.action !== 'toggle') {
      const { playlist } = await core.store.get();
      const next = adjacentTrack(playlist, message.videoId, message.action === 'next' ? 1 : -1);
      if (next) { await navigate(message.tabId, next.videoId); return; }
    }
    if (states.get(message.tabId)?.snapshot.track?.videoId === message.videoId) send(content, message);
  }

  function connect(port: chrome.runtime.Port) {
    if (port.name === PORT.content && isYouTubeSender(port.sender)) {
      const tabId = port.sender!.tab!.id!;
      port.onMessage.addListener((message: unknown) => {
        if (hasType(message, MESSAGE.ready)) {
          contents.set(tabId, port);
          if (!states.has(tabId)) states.set(tabId, { tabId, active: Boolean(port.sender?.tab?.active), snapshot: emptySnapshot() });
          send(port, { type: MESSAGE.ack });
          broadcast();
        } else if (isTrackUpdate(message) && contents.get(tabId) === port) {
          const pending = navigating.get(tabId);
          if (pending && message.snapshot.track?.videoId !== pending.videoId) return;
          if (pending) { clearTimeout(pending.timer); navigating.delete(tabId); }
          const previous = states.get(tabId)?.snapshot.track;
          states.set(tabId, { tabId, active: Boolean(port.sender?.tab?.active), snapshot: message.snapshot });
          broadcast();
          const track = message.snapshot.track;
          if (core && track && consumeLink(track.videoId)) {
            void core.store.update((state) => ({ ...state, playlist: addTrack(state.playlist, playlistTrack(track)) }))
              .then((state) => sendCore(state))
              .catch(() => coreError('SAVE_FAILED'));
          }
          if (core && track?.playbackState === 'ended' && (previous?.videoId !== track.videoId || previous.playbackState !== 'ended')) {
            void core.store.get().then(async ({ playlist }) => {
              if (playlist.some((item) => item.videoId === track.videoId)) {
                const next = adjacentTrack(playlist, track.videoId, 1);
                if (next) await navigate(tabId, next.videoId);
              }
            }).catch(() => coreError('LOAD_FAILED'));
          }
        }
      });
      port.onDisconnect.addListener(() => {
        if (contents.get(tabId) === port) {
          contents.delete(tabId);
          if (!navigating.has(tabId)) states.delete(tabId);
        }
        broadcast();
      });
      return;
    }

    if (port.name === PORT.panel && port.sender?.url === panelUrl) {
      panels.add(port);
      port.onMessage.addListener((message: unknown) => {
        if (hasType(message, MESSAGE.probe)) {
          for (const content of contents.values()) send(content, { type: MESSAGE.probe });
          broadcast();
          loadCore(port);
        } else if (isPlayerCommand(message)) {
          void control(message).catch(() => coreError('LOAD_FAILED', port));
        } else if (isCoreEdit(message)) {
          editCore(message.change, port);
        } else if (isOpenVideo(message) && core) {
          const tabId = message.tabId !== null && states.has(message.tabId)
            ? message.tabId
            : [...states.values()].find((state) => state.active)?.tabId ?? [...states.keys()][0] ?? null;
          rememberLink(message.videoId);
          void navigate(tabId, message.videoId).then((opened) => { if (!opened) consumeLink(message.videoId); });
        } else if (isPlaylistPlay(message) && core) {
          if (message.tabId !== null && !states.has(message.tabId)) { coreError('NAVIGATION_FAILED', port); return; }
          void core.store.get().then(async ({ playlist }) => {
            if (playlist.some((track) => track.videoId === message.videoId)) await navigate(message.tabId, message.videoId);
          }).catch(() => coreError('LOAD_FAILED', port));
        } else if (isAiRecommendationMessage(message)) {
          void recommend(message.tabId, port, message.refresh).catch((error: unknown) => send(port, { type: MESSAGE_AI.recommendationError, code: recommendationErrorCode(error) }));
        } else if (isAiMessage(message)) {
          void handleAi(message, port).catch(() => send(port, { type: MESSAGE_AI.result, result: 'failed' }));
        }
      });
      port.onDisconnect.addListener(() => panels.delete(port));
      broadcast();
      loadCore(port);
      loadAi(port);
      return;
    }

    port.disconnect();
  }

  return Object.assign(connect, {
    removeTab(tabId: number) {
      clearTimeout(navigating.get(tabId)?.timer);
      navigating.delete(tabId);
      contents.delete(tabId);
      states.delete(tabId);
      broadcast();
    },
  });
}
