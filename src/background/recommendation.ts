import { excludedTracks, parseDiscovery, parseSelection } from '../shared/recommendation';
import type { Candidate, Recommendation } from '../shared/recommendation';
import type { PlaylistTrack } from '../shared/playlist';
import type { Track } from '../shared/track';
import type { AiService } from './ai';

interface RecommendationContext {
  current: Track | null;
  playlist: PlaylistTrack[];
  recent: Recommendation[];
}

export interface RecommendationResult {
  candidates: Candidate[];
  recommendations: Recommendation[];
}

export interface RecommendationRunOptions {
  refresh?: boolean;
}

function cacheKey(context: RecommendationContext): string {
  return `${context.current?.videoId ?? 'none'}|${context.playlist.map((track) => track.videoId).join(',')}`;
}

function outputText(response: unknown): string {
  if (typeof response === 'object' && response !== null && 'output_text' in response && typeof response.output_text === 'string') return response.output_text;
  if (typeof response !== 'object' || response === null || !('output' in response) || !Array.isArray(response.output)) return '';
  return response.output.flatMap((item) => typeof item === 'object' && item !== null && 'content' in item && Array.isArray(item.content) ? item.content : [])
    .filter((item) => typeof item === 'object' && item !== null && item.type === 'output_text' && typeof item.text === 'string')
    .map((item) => item.text as string).join('');
}

function contextPrompt(context: RecommendationContext): string {
  const current = context.current ? `${context.current.channelTitle} — ${context.current.videoTitle}` : 'No current track';
  const playlist = context.playlist.map((track) => `${track.channelTitle} — ${track.videoTitle}`).join('\n') || 'Empty';
  const recent = context.recent.map((item) => `${item.artist} — ${item.title}`).join('\n') || 'Empty';
  return `Current track:\n${current}\n\nPlaylist:\n${playlist}\n\nRecent recommendations:\n${recent}`;
}

function discoveryBody(context: RecommendationContext): Record<string, unknown> {
  return {
    model: 'gpt-4.1-mini',
    store: false,
    tools: [{ type: 'web_search' }],
    input: [
      { role: 'developer', content: 'Find real music candidates using web search. Return only lines in CANDIDATE|C01|Artist|Track format. Return at most 10 candidates. Do not return JSON, explanations, URLs, or video IDs.' },
      { role: 'user', content: contextPrompt(context) },
    ],
  };
}

function selectionBody(candidates: Candidate[]): Record<string, unknown> {
  return {
    model: 'gpt-4.1-mini',
    store: false,
    input: [
      { role: 'developer', content: 'Select only from the supplied candidate IDs. Do not create or modify artist or track names. Return Korean reasons and one to three music tags.' },
      { role: 'user', content: JSON.stringify(candidates) },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'music_recommendations',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            recommendations: {
              type: 'array',
              maxItems: 5,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  candidateId: { type: 'string' },
                  reason: { type: 'string' },
                  tags: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string' } },
                },
                required: ['candidateId', 'reason', 'tags'],
              },
            },
          },
          required: ['recommendations'],
        },
      },
    },
  };
}

export function createRecommendationService(ai: Pick<AiService, 'response'>) {
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
      const candidates = parseDiscovery(outputText(await ai.response(discoveryBody(discoveryContext))), excludedTracks(discoveryContext.current, discoveryContext.playlist, discoveryContext.recent));
      if (candidates.length === 0) throw new Error('NO_CANDIDATES');
      const selection = selectionBody(candidates);
      let recommendations = parseSelection(outputText(await ai.response(selection)), candidates);
      if (!recommendations) recommendations = parseSelection(outputText(await ai.response(selection)), candidates);
      if (!recommendations) throw new Error('INVALID_SELECTION');
      const result = { candidates, recommendations };
      cache.set(key, result);
      recentRecommendations = [...recommendations, ...recentRecommendations].slice(0, 20);
      return { candidates: [...candidates], recommendations: [...recommendations] };
    },
  };
}

export type { RecommendationContext };
