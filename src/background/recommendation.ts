import { excludedTracks, MIN_RECOMMENDATIONS, MAX_RECOMMENDATIONS, parseDiscovery, parseSelection } from '../shared/recommendation';
import type { Candidate, Recommendation } from '../shared/recommendation';
import type { AiService } from './ai';
import type { RecommendationDropMeasurement, RecommendationLiveMeasurement, RecommendationMeasurement, RecommendationProgressStage, RecommendationRequestKind, RecommendationRequestMeasurement, RecommendationResolverDiagnostics, RecommendationStage } from '../shared/ai';
import { parseYouTubeResults, resolveRecommendations } from './youtube-resolver';
import { AiDiagnosticError } from './ai';
import { discoveryExtractionBody, discoveryResearchBody } from '../ai/prompts/discovery';
import type { RecommendationPromptContext } from '../ai/prompts/discovery';
import { selectionBody } from '../ai/prompts/selection';
import { youtubeResolverBody } from '../ai/prompts/youtube-resolver';

type RecommendationContext = RecommendationPromptContext;

export interface RecommendationResult {
  candidates: Candidate[];
  recommendations: Recommendation[];
  measurement?: RecommendationMeasurement;
}

export interface RecommendationRunOptions {
  refresh?: boolean;
  progress?: (stage: RecommendationProgressStage, measurement?: RecommendationLiveMeasurement) => void;
}

const EMPTY_STAGE_COUNTS: RecommendationDropMeasurement[] = [
  { stage: 'discovery', inputCount: 0, outputCount: 0, dropCount: 0, attempts: 0 },
  { stage: 'selection', inputCount: 0, outputCount: 0, dropCount: 0, attempts: 0 },
  { stage: 'resolver', inputCount: 0, outputCount: 0, dropCount: 0, attempts: 0 },
  { stage: 'oembed', inputCount: 0, outputCount: 0, dropCount: 0, attempts: 0 },
];
const EMPTY_RESOLVER_DIAGNOSTICS: RecommendationResolverDiagnostics = {
  searchSourceEmpty: 0, urlExtractionFailure: 0, candidateMismatch: 0, videoTypeExcluded: 0,
  validationFailure: 0, supplementalSearchFailure: 0,
};

function cacheKey(context: RecommendationContext): string {
  return `${context.current?.videoId ?? 'none'}|${context.playlist.map((track) => track.videoId).join(',')}`;
}

function outputText(response: unknown): string {
  if (typeof response === 'object' && response !== null && 'output_text' in response && typeof response.output_text === 'string') return response.output_text;
  if (typeof response !== 'object' || response === null || !('output' in response) || !Array.isArray(response.output)) return '';
  return response.output.flatMap((item) => typeof item === 'object' && item !== null && 'content' in item && Array.isArray(item.content) ? item.content : [])
    .filter((item) => typeof item === 'object' && item !== null && item.type === 'output_text' && typeof item.text === 'string')
    .map((item) => item.text as string).join('\n');
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function count(value: unknown): number {
  return Number.isInteger(value) && (value as number) >= 0 ? value as number : 0;
}

function responseMeasurement(response: unknown, body: Record<string, unknown>, kind: RecommendationRequestKind, stage: RecommendationProgressStage, durationMs: number): RecommendationRequestMeasurement {
  const payload = record(response);
  const usage = record(payload?.usage);
  const inputDetails = record(usage?.input_tokens_details);
  const output = Array.isArray(payload?.output) ? payload.output : [];
  const serviceTier = typeof payload?.service_tier === 'string' ? payload.service_tier.slice(0, 100) : undefined;
  return {
    kind,
    stage,
    model: (typeof payload?.model === 'string' ? payload.model : typeof body.model === 'string' ? body.model : 'unknown').slice(0, 100),
    ...(serviceTier ? { serviceTier } : {}),
    durationMs: Math.max(0, Math.round(durationMs)),
    inputTokens: count(usage?.input_tokens),
    cachedInputTokens: count(inputDetails?.cached_tokens),
    outputTokens: count(usage?.output_tokens),
    totalTokens: count(usage?.total_tokens),
    webSearchCalls: output.filter((item) => record(item)?.type === 'web_search_call').length,
  };
}

export function createRecommendationService(ai: Pick<AiService, 'response'>, request: typeof fetch = fetch) {
  const cache = new Map<string, RecommendationResult>();
  let recentRecommendations: Recommendation[] = [];

  return {
    async run(context: RecommendationContext, options: RecommendationRunOptions = {}): Promise<RecommendationResult> {
      const startedAt = performance.now();
      const key = cacheKey(context);
      if (!options.refresh) {
        const cached = cache.get(key);
        if (cached) return {
          candidates: [...cached.candidates], recommendations: [...cached.recommendations],
          measurement: {
            cacheHit: true,
            totalDurationMs: Math.max(0, Math.round(performance.now() - startedAt)),
            candidateCount: cached.candidates.length,
            selectedCount: 0,
            youtubeSourceCount: 0,
            recommendationCount: cached.recommendations.length,
            stageCounts: cached.measurement?.stageCounts ?? EMPTY_STAGE_COUNTS,
            resolverDiagnostics: cached.measurement?.resolverDiagnostics ?? EMPTY_RESOLVER_DIAGNOSTICS,
            requests: [],
          },
        };
      }
      const measurements: RecommendationRequestMeasurement[] = [];
      const live: RecommendationLiveMeasurement = {
        startedAt: Date.now(), updatedAt: Date.now(), currentStage: null, lastCompletedStage: null,
        stageCounts: [], stageTimings: [], requests: measurements,
        resolver: { targetCount: 0, processedCount: 0, successCount: 0, failedCount: 0, supplementalSearches: 0, currentCandidateIndex: null },
      };
      const emitLive = (stage: RecommendationProgressStage, completed = false) => {
        live.currentStage = stage;
        if (completed) live.lastCompletedStage = stage;
        const timing = live.stageTimings.find((item) => item.stage === stage && item.completedAt === undefined) ?? (() => { const item: RecommendationLiveMeasurement['stageTimings'][number] = { stage, startedAt: Date.now(), elapsedMs: 0 }; live.stageTimings.push(item); return item; })();
        timing.elapsedMs = Math.max(0, Date.now() - timing.startedAt);
        if (completed) timing.completedAt = Date.now();
        live.updatedAt = Date.now();
        live.stageCounts = Object.values(stageCounts).map((item) => ({ ...item }));
        options.progress?.(stage, structuredClone(live));
      };
      const stageCounts: Record<RecommendationDropMeasurement['stage'], RecommendationDropMeasurement> = {
        discovery: { stage: 'discovery', inputCount: 0, outputCount: 0, dropCount: 0, attempts: 0 },
        selection: { stage: 'selection', inputCount: 0, outputCount: 0, dropCount: 0, attempts: 0 },
        resolver: { stage: 'resolver', inputCount: 0, outputCount: 0, dropCount: 0, attempts: 0 },
        oembed: { stage: 'oembed', inputCount: 0, outputCount: 0, dropCount: 0, attempts: 0 },
      };
      const resolverDiagnostics: RecommendationResolverDiagnostics = { ...EMPTY_RESOLVER_DIAGNOSTICS };
      const recordStage = (stage: RecommendationDropMeasurement['stage'], inputCount: number, outputCount: number) => {
        const item = stageCounts[stage];
        item.inputCount += inputCount;
        item.outputCount += outputCount;
        item.dropCount += Math.max(0, inputCount - outputCount);
        item.attempts += 1;
        live.stageCounts = Object.values(stageCounts).map((entry) => ({ ...entry }));
      };
      const requestAi = async (body: Record<string, unknown>, stage: Exclude<RecommendationStage, 'connection' | 'metadata'>, kind: RecommendationRequestKind) => {
        const requestStartedAt = performance.now();
        const startedAt = Date.now();
        const attempt = measurements.filter((item) => item.stage === stage).length + 1;
        live.activeRequest = { stage, kind, attempt, startedAt };
        emitLive(stage);
        try {
          const response = await ai.response(body, stage);
          const request = responseMeasurement(response, body, kind, stage, performance.now() - requestStartedAt);
          Object.assign(request, { startedAt, completedAt: Date.now(), success: true, timeout: false });
          measurements.push(request);
          delete live.activeRequest;
          emitLive(stage);
          return response;
        } catch (error) {
          const diagnostic = error instanceof AiDiagnosticError ? error.details : undefined;
          const timedOut = error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name);
          measurements.push({ kind, stage, model: typeof body.model === 'string' ? body.model.slice(0, 100) : 'unknown', durationMs: Math.max(0, Math.round(performance.now() - requestStartedAt)), inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, totalTokens: 0, webSearchCalls: 0, startedAt, completedAt: Date.now(), success: false, timeout: timedOut, ...(diagnostic?.status === undefined ? {} : { httpStatus: diagnostic.status }), errorKind: timedOut ? 'timeout' : error instanceof Error ? error.name.slice(0, 100) : 'unknown' });
          delete live.activeRequest;
          emitLive(stage);
          throw error;
        }
      };
      const recent = [...context.recent];
      const excludedRecent = [...context.recent, ...recentRecommendations];
      const discoveryContext = { ...context, recent };
      emitLive('discovery');
      const research = outputText(await requestAi(discoveryResearchBody(discoveryContext), 'discovery', 'discovery-research')).trim();
      if (!research) throw new AiDiagnosticError('NO_CANDIDATES', { stage: 'discovery' });
      const extracted = outputText(await requestAi(discoveryExtractionBody(discoveryContext, research), 'discovery', 'candidate-extraction'));
      const candidates = parseDiscovery(extracted, excludedTracks(context.current, context.playlist, excludedRecent));
      recordStage('discovery', 0, candidates.length);
      emitLive('discovery', true);
      if (candidates.length === 0) throw new AiDiagnosticError('NO_CANDIDATES', { stage: 'discovery' });
      const selection = selectionBody(discoveryContext, candidates);
      emitLive('selection');
      let selectionFailure = '';
      const recordFailure = (reason: string) => { selectionFailure = reason; };
      let selected = parseSelection(outputText(await requestAi(selection, 'selection', 'selection')), candidates, recordFailure);
      if (!selected || selected.length === 0) {
        const retry = selectionBody(discoveryContext, candidates, selectionFailure || 'The selection was empty. Select eligible candidates when supported.');
        selected = parseSelection(outputText(await requestAi(retry, 'selection', 'selection-retry')), candidates, recordFailure);
      }
      if (!selected) throw new AiDiagnosticError('INVALID_SELECTION', { stage: 'selection', message: selectionFailure });
      if (selected.length === 0) throw new AiDiagnosticError('NO_CANDIDATES', { stage: 'selection' });
      recordStage('selection', candidates.length, selected.length);
      emitLive('selection', true);
      const targetCount = Math.min(MAX_RECOMMENDATIONS, Math.max(MIN_RECOMMENDATIONS, selected.length));
      const selectedCandidates = new Set(selected.map((item) => item.candidateId));
      let sawYouTubeSource = false;
      let metadataFailure: AiDiagnosticError | undefined;
      let supplementalFailure: unknown;
      const youtubeSourceCandidates = new Set<string>();
      const resolve = async (items: Candidate[], individual = false, reserve = false): Promise<Recommendation[]> => {
        live.resolver.targetCount += items.length;
        if (individual || reserve) live.resolver.supplementalSearches += 1;
        emitLive('youtube-search');
        const kind = individual ? 'youtube-search-individual' : reserve ? 'youtube-search-reserve' : 'youtube-search';
        const sources = parseYouTubeResults(await requestAi(youtubeResolverBody(items, individual), 'youtube-search', kind), items, individual, resolverDiagnostics);
        recordStage('resolver', items.length, sources.length);
        if (sources.length === 0) { resolverDiagnostics.searchSourceEmpty += 1; live.resolver.failedCount += items.length; live.resolver.processedCount += items.length; emitLive('youtube-search', true); return []; }
        sawYouTubeSource = true;
        sources.forEach((source) => youtubeSourceCandidates.add(source.candidateId));
        emitLive('youtube-search', true);
        options.progress?.('metadata');
        try {
          emitLive('metadata');
          const resolved = await resolveRecommendations(items, sources, request);
          live.resolver.successCount += resolved.length;
          live.resolver.failedCount += Math.max(0, items.length - resolved.length);
          live.resolver.processedCount += items.length;
          recordStage('oembed', sources.length, resolved.length);
          emitLive('metadata', true);
          return resolved;
        }
        catch (error) {
          if (error instanceof AiDiagnosticError && error.message === 'YOUTUBE_METADATA_FAILED') {
            recordStage('oembed', sources.length, 0);
            live.resolver.failedCount += items.length;
            live.resolver.processedCount += items.length;
            emitLive('metadata', true);
            metadataFailure = error;
            return [];
          }
          throw error;
        }
      };
      const excludedIds = new Set([context.current?.videoId, ...context.playlist.map((track) => track.videoId), ...excludedRecent.map((track) => track.videoId)]);
      const initiallyResolved = await resolve(selected);
      const recommendations = initiallyResolved.filter((track) => !excludedIds.has(track.videoId));
      const resolvedCandidates = new Set(initiallyResolved.map((item) => item.candidateId));
      const resolvedVideos = new Set(recommendations.map((item) => item.videoId));
      for (const missing of selected.filter((item) => !resolvedCandidates.has(item.candidateId)).slice(0, MAX_RECOMMENDATIONS)) {
        let resolved: Recommendation | undefined;
        try { [resolved] = await resolve([missing], true); }
        catch (error) { resolverDiagnostics.supplementalSearchFailure += 1; supplementalFailure ??= error; }
        if (resolved && !excludedIds.has(resolved.videoId) && !resolvedVideos.has(resolved.videoId)) {
          recommendations.push(resolved); resolvedCandidates.add(resolved.candidateId); resolvedVideos.add(resolved.videoId);
        }
      }
      if (recommendations.length < targetCount) {
        const reserve = candidates.filter((item) => !selectedCandidates.has(item.candidateId));
        for (let offset = 0; offset < reserve.length && recommendations.length < targetCount; offset += 5) {
          let replenished: Recommendation[] = [];
          try { replenished = await resolve(reserve.slice(offset, offset + 5), false, true); }
          catch (error) { resolverDiagnostics.supplementalSearchFailure += 1; supplementalFailure ??= error; }
          for (const item of replenished) {
            if (recommendations.length === targetCount) break;
            if (!excludedIds.has(item.videoId) && !resolvedVideos.has(item.videoId)) { recommendations.push(item); resolvedVideos.add(item.videoId); }
          }
        }
      }
      if (recommendations.length === 0) {
        if (supplementalFailure) throw supplementalFailure;
        if (!sawYouTubeSource) throw new AiDiagnosticError('YOUTUBE_SOURCE_EMPTY', { stage: 'youtube-search' });
        if (metadataFailure) throw metadataFailure;
        throw new AiDiagnosticError('NO_CANDIDATES', { stage: 'metadata' });
      }
      const sequence = new Map([...selected, ...candidates.filter((item) => !selectedCandidates.has(item.candidateId))].map((item, index) => [item.candidateId, index]));
      recommendations.sort((first, second) => sequence.get(first.candidateId)! - sequence.get(second.candidateId)!);
      const measurement: RecommendationMeasurement = {
        cacheHit: false,
        totalDurationMs: Math.max(0, Math.round(performance.now() - startedAt)),
        candidateCount: candidates.length,
        selectedCount: selected.length,
        youtubeSourceCount: youtubeSourceCandidates.size,
        recommendationCount: recommendations.length,
        stageCounts: Object.values(stageCounts),
        resolverDiagnostics,
        requests: measurements,
      };
      const result = { candidates, recommendations, measurement };
      cache.set(key, result);
      recentRecommendations = [...recommendations, ...recentRecommendations].slice(0, 20);
      return {
        candidates: [...candidates], recommendations: [...recommendations],
        measurement,
      };
    },
  };
}

export type { RecommendationContext };
