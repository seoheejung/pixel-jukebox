import { excludedTracks, MIN_RECOMMENDATIONS, MAX_RECOMMENDATIONS, parseDiscovery, parseSelection } from '../shared/recommendation';
import type { Candidate, Recommendation } from '../shared/recommendation';
import type { AiService } from './ai';
import type { RecommendationProgressStage } from '../shared/ai';
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
}

export interface RecommendationRunOptions {
  refresh?: boolean;
  progress?: (stage: RecommendationProgressStage) => void;
}

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

export function createRecommendationService(ai: Pick<AiService, 'response'>, request: typeof fetch = fetch) {
  const cache = new Map<string, RecommendationResult>();
  let recentRecommendations: Recommendation[] = [];

  return {
    async run(context: RecommendationContext, options: RecommendationRunOptions = {}): Promise<RecommendationResult> {
      const key = cacheKey(context);
      if (!options.refresh) {
        const cached = cache.get(key);
        if (cached) return { candidates: [...cached.candidates], recommendations: [...cached.recommendations] };
      }
      const recent = [...context.recent, ...recentRecommendations];
      const discoveryContext = { ...context, recent };
      options.progress?.('discovery');
      const research = outputText(await ai.response(discoveryResearchBody(discoveryContext), 'discovery')).trim();
      if (!research) throw new AiDiagnosticError('NO_CANDIDATES', { stage: 'discovery' });
      const extracted = outputText(await ai.response(discoveryExtractionBody(discoveryContext, research), 'discovery'));
      const candidates = parseDiscovery(extracted, excludedTracks(context.current, context.playlist, recent));
      if (candidates.length === 0) throw new AiDiagnosticError('NO_CANDIDATES', { stage: 'discovery' });
      const selection = selectionBody(discoveryContext, candidates);
      options.progress?.('selection');
      let selectionFailure = '';
      const recordFailure = (reason: string) => { selectionFailure = reason; };
      let selected = parseSelection(outputText(await ai.response(selection, 'selection')), candidates, recordFailure);
      if (!selected || selected.length === 0) {
        const retry = selectionBody(discoveryContext, candidates, selectionFailure || 'The selection was empty. Select eligible candidates when supported.');
        selected = parseSelection(outputText(await ai.response(retry, 'selection')), candidates, recordFailure);
      }
      if (!selected) throw new AiDiagnosticError('INVALID_SELECTION', { stage: 'selection', message: selectionFailure });
      if (selected.length === 0) throw new AiDiagnosticError('NO_CANDIDATES', { stage: 'selection' });
      const targetCount = Math.min(MAX_RECOMMENDATIONS, Math.max(MIN_RECOMMENDATIONS, selected.length));
      const selectedCandidates = new Set(selected.map((item) => item.candidateId));
      let sawYouTubeSource = false;
      let metadataFailure: AiDiagnosticError | undefined;
      let supplementalFailure: unknown;
      const resolve = async (items: Candidate[], individual = false): Promise<Recommendation[]> => {
        options.progress?.('youtube-search');
        const sources = parseYouTubeResults(await ai.response(youtubeResolverBody(items, individual), 'youtube-search'), items, individual);
        if (sources.length === 0) return [];
        sawYouTubeSource = true;
        options.progress?.('metadata');
        try { return await resolveRecommendations(items, sources, request); }
        catch (error) {
          if (error instanceof AiDiagnosticError && error.message === 'YOUTUBE_METADATA_FAILED') { metadataFailure = error; return []; }
          throw error;
        }
      };
      const excludedIds = new Set([context.current?.videoId, ...context.playlist.map((track) => track.videoId), ...recent.map((track) => track.videoId)]);
      const initiallyResolved = await resolve(selected);
      const recommendations = initiallyResolved.filter((track) => !excludedIds.has(track.videoId));
      const resolvedCandidates = new Set(initiallyResolved.map((item) => item.candidateId));
      const resolvedVideos = new Set(recommendations.map((item) => item.videoId));
      for (const missing of selected.filter((item) => !resolvedCandidates.has(item.candidateId)).slice(0, MAX_RECOMMENDATIONS)) {
        let resolved: Recommendation | undefined;
        try { [resolved] = await resolve([missing], true); }
        catch (error) { supplementalFailure ??= error; }
        if (resolved && !excludedIds.has(resolved.videoId) && !resolvedVideos.has(resolved.videoId)) {
          recommendations.push(resolved); resolvedCandidates.add(resolved.candidateId); resolvedVideos.add(resolved.videoId);
        }
      }
      if (recommendations.length < targetCount) {
        const reserve = candidates.filter((item) => !selectedCandidates.has(item.candidateId));
        for (let offset = 0; offset < reserve.length && recommendations.length < targetCount; offset += 5) {
          let replenished: Recommendation[] = [];
          try { replenished = await resolve(reserve.slice(offset, offset + 5)); }
          catch (error) { supplementalFailure ??= error; }
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
      const result = { candidates, recommendations };
      cache.set(key, result);
      recentRecommendations = [...recommendations, ...recentRecommendations].slice(0, 20);
      return { candidates: [...candidates], recommendations: [...recommendations] };
    },
  };
}

export type { RecommendationContext };
