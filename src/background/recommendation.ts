import { excludedTracks, MAX_CANDIDATES, MIN_RECOMMENDATIONS, MAX_RECOMMENDATIONS, parseDiscoveryCandidates, parseSelection } from '../shared/recommendation';
import type { Candidate, Recommendation } from '../shared/recommendation';
import type { PlaylistTrack } from '../shared/playlist';
import type { Track } from '../shared/track';
import type { AiService } from './ai';
import type { RecommendationProgressStage } from '../shared/ai';
import { resolveRecommendations, youtubeSourceIds } from './youtube-resolver';
import { AiDiagnosticError } from './ai';

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

function contextPrompt(context: RecommendationContext): string {
  const current = context.current ? `Supplied title: ${context.current.videoTitle}\nSupplied channel: ${context.current.channelTitle}\nSecondary reference URL: ${context.current.videoUrl}` : 'No selected reference track';
  const playlist = context.playlist.map((track) => `${track.channelTitle} — ${track.videoTitle}`).join('\n') || 'Empty';
  const recent = context.recent.map((item) => `${item.artist} — ${item.title}`).join('\n') || 'Empty';
  const currentIndex = context.playlist.findIndex((track) => track.videoId === context.current?.videoId);
  return `Selected reference track:\n${current}\n\nOrdered playlist (playback order):\n${playlist}\nReference track position: ${currentIndex < 0 ? 'not in playlist' : currentIndex + 1}. Anchor recommendations to the SELECTED REFERENCE TRACK, not automatically to the playing track or playlist tail.\n\nRecent recommendations:\n${recent}`;
}

const artistDiversityPrompt = "Discover other artists rather than more songs from the reference artist's catalogue. Prefer artists other than the identified reference artist while preserving the release-era, genre, and language priorities. Include at most one song per artist across the entire candidate pool and final recommendations; this is a composition constraint, not a tie-breaker. Treat supported Korean/English aliases and spelling variants as the same artist, and use the performing artist rather than the uploader or label. Do not use group-member solo projects, subunits, or collaborations involving the same artist as a shortcut to variety when other suitable artists are supported. If evidence supports too few different artists, return fewer songs instead of filling the count with repeated artists.";

function discoveryResearchBody(context: RecommendationContext, relaxed = false): Record<string, unknown> {
  return {
    model: 'gpt-4.1-mini',
    store: false,
    tools: [{ type: 'web_search' }],
    tool_choice: 'required',
    input: [
      { role: 'developer', content: `Curate recommendations anchored to the SELECTED REFERENCE TRACK using web search. Apply this priority order: first match original release year or era (never upload date), genre, and language; second match the reference track's mood and vocal character; then use energy, groove, tempo feel, texture, instrumentation, and production as supporting criteria. ${artistDiversityPrompt} Consider the ordered playlist as taste context without switching the anchor to its playing track or tail. Identify the selected song from the supplied video title first. A supplied channel may be a label, distributor, broadcaster, or music program rather than the artist. For live or stage videos identify the underlying song where supported. Use the URL only as a secondary disambiguation clue. Build a pool of up to ${MAX_CANDIDATES} supported candidates, aiming for at least 10 different artists so ${MIN_RECOMMENDATIONS}–${MAX_RECOMMENDATIONS} can remain after YouTube verification. Order research notes as a plausible journey from the selected reference track; each next song should also flow from the previous proposed song. Do not invent release facts, BPM, key, mood facts, names, or links. Exclude the selected reference song, playlist tracks, duplicates, remixes, alternate versions, and covers.${relaxed ? ' Earlier recommendations may be reused only when needed. Broaden only as necessary while preserving the stated priority order and evidence requirements.' : ' Exclude recent recommendations.'} Preserve supported Korean/English aliases in parentheses. Return concise research notes with each supported artist and song and evidence for the priority matches. If evidence supports fewer songs, report only those supported.` },
      { role: 'user', content: contextPrompt(context) },
    ],
  };
}

function discoveryExtractionBody(context: RecommendationContext, research: string): Record<string, unknown> {
  return {
    model: 'gpt-4.1-mini',
    store: false,
    input: [
      { role: 'developer', content: `Extract up to ${MAX_CANDIDATES} candidate songs only from the supplied web research, aiming to preserve at least 10 distinct supported artists when available. ${artistDiversityPrompt} Preserve artist and track names from the evidence, including supported Korean/English aliases in parentheses. Do not add, infer, translate, rename, or fabricate candidates. Exclude the selected reference track and excluded tracks. Return an empty candidates array when the research contains no supported candidates.` },
      { role: 'user', content: `${contextPrompt(context)}\n\nWeb research:\n${research}` },
    ],
    text: {
      format: {
        type: 'json_schema', name: 'discovered_music_candidates', strict: true,
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            candidates: {
              type: 'array', maxItems: MAX_CANDIDATES,
              items: {
                type: 'object', additionalProperties: false,
                properties: { artist: { type: 'string' }, title: { type: 'string' } },
                required: ['artist', 'title'],
              },
            },
          },
          required: ['candidates'],
        },
      },
    },
  };
}

function youtubeSearchBody(recommendations: Recommendation[], individual = false): Record<string, unknown> {
  const strategy = individual
    ? 'Run a focused exact-match search with the artist and song title quoted, using "official MV", "official music video", "concept video", "performance video", or "lyric video" as appropriate. Inspect results for a full-song video on an official artist or label channel. Search-result, channel, playlist, and category pages are unusable; cite a direct video page, or return no URL if no supported eligible video exists.'
    : 'Search for an official full-song video for every supplied song. Search eligible formats: Music Video (MV), Concept Video, Performance Video, and Lyric Video. Return one best supported video per song; do not stop at an MV-only search.';
  return {
    model: 'gpt-4.1-mini', store: false,
    tools: [{ type: 'web_search' }], tool_choice: 'required', include: ['web_search_call.action.sources'],
    input: [
      { role: 'developer', content: `Find an official full-song Music Video (MV), Concept Video, Performance Video, or Lyric Video for ${individual ? 'the supplied artist and song' : 'each supplied artist and song'}. ${strategy} These four video formats are eligible presentations of the same song, not alternate audio versions. Concept videos must contain the full song, not just a concept trailer. Search site:youtube.com and site:youtu.be using supplied names and any Korean, English, or romanized alias explicitly supported by evidence. Rank eligible results by uploader authority: (1) the official artist channel, then (2) the verified label or distributor channel that released the song. Choose the highest-priority supported result. Do not substitute live stages, fancams, covers, fan-made lyric videos, audio-only uploads, Shorts, or teaser clips. If no supported eligible video is found, return no URL so another candidate can be tried. Return direct YouTube video URLs with citations, retaining the associated artist and song. Do not invent, translate, or guess names or links.` },
      { role: 'user', content: JSON.stringify(recommendations.map(({ artist, title }) => ({ artist, title }))) },
    ],
  };
}

function selectionBody(context: RecommendationContext, candidates: Candidate[], correction?: string): Record<string, unknown> {
  return {
    model: 'gpt-4.1-mini',
    store: false,
    input: [
      { role: 'developer', content: `Select and order ${MIN_RECOMMENDATIONS} to ${MAX_RECOMMENDATIONS} distinct candidate IDs around the SELECTED REFERENCE TRACK; when fewer than ${MIN_RECOMMENDATIONS} eligible artists are supported, return fewer songs while retaining at most one song per artist. Apply this priority order: first original release year or era (never upload date), genre, and language; second mood and vocal character relative to the selected reference; then energy, groove, tempo feel, texture, instrumentation, and production as supporting criteria. ${artistDiversityPrompt} Order the first song from the selected reference, then each from the previous selection. Do not anchor on the playing track or playlist tail, and do not rank by title similarity alone. Exclude the selected reference/playlist songs, duplicates, remixes, covers, and alternate versions. Use only supplied candidate IDs; do not invent facts or modify metadata. Follow the supplied JSON schema.` },
      { role: 'user', content: `${contextPrompt(context)}\n\nCandidates:\n${JSON.stringify(candidates)}` },
      ...(correction ? [{ role: 'developer', content: `The previous selection failed validation: ${correction} Return a corrected selection using only the supplied candidate IDs, each at most once. Return fewer songs when needed; never invent IDs to fill the count.` }] : []),
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
              minItems: 0,
              maxItems: MAX_RECOMMENDATIONS,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  candidateId: { type: 'string', enum: candidates.map((candidate) => candidate.candidateId) },
                },
                required: ['candidateId'],
              },
            },
          },
          required: ['recommendations'],
        },
      },
    },
  };
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
      let discoveryContext = { ...context, recent };
      let candidates: Candidate[] = [];
      let relaxedDiscovery = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        relaxedDiscovery = attempt === 1;
        options.progress?.('discovery');
        const research = outputText(await ai.response(discoveryResearchBody(discoveryContext, attempt === 1), 'discovery')).trim();
        if (!research) {
          if (attempt === 0) { discoveryContext = { ...context, recent: [] }; continue; }
          throw new AiDiagnosticError('INVALID_RESPONSE', { stage: 'discovery', message: '검색 응답에 후보를 추출할 텍스트가 없습니다.' });
        }
        const extracted = outputText(await ai.response(discoveryExtractionBody(discoveryContext, research), 'discovery'));
        const parsed = parseDiscoveryCandidates(extracted, excludedTracks(context.current, context.playlist, discoveryContext.recent));
        if (!parsed) throw new AiDiagnosticError('INVALID_RESPONSE', { stage: 'discovery', message: '후보 JSON 형식이 올바르지 않습니다.' });
        candidates = parsed;
        if (candidates.length > 0) break;
        discoveryContext = { ...context, recent: [] };
      }
      if (candidates.length === 0) throw new AiDiagnosticError('NO_CANDIDATES', { stage: 'discovery' });
      const selection = selectionBody(discoveryContext, candidates);
      options.progress?.('selection');
      let selectionFailure = '';
      const recordFailure = (reason: string) => { selectionFailure = reason; };
      let recommendations = parseSelection(outputText(await ai.response(selection, 'selection')), candidates, recordFailure);
      if (!recommendations || recommendations.length === 0) {
        const retry = selectionBody(discoveryContext, candidates, selectionFailure || 'The selection was empty. Select eligible candidates when supported.');
        recommendations = parseSelection(outputText(await ai.response(retry, 'selection')), candidates, recordFailure);
      }
      if (!recommendations) throw new AiDiagnosticError('INVALID_SELECTION', { stage: 'selection', message: selectionFailure });
      if (recommendations.length === 0) throw new AiDiagnosticError('NO_CANDIDATES', { stage: 'selection' });
      const selected = recommendations;
      const targetCount = Math.min(MAX_RECOMMENDATIONS, Math.max(MIN_RECOMMENDATIONS, selected.length));
      const selectedCandidates = new Set(selected.map((item) => item.candidateId));
      let sawYouTubeSource = false;
      let metadataFailure: AiDiagnosticError | undefined;
      let supplementalFailure: unknown;
      const resolve = async (items: Recommendation[], individual = false): Promise<Recommendation[]> => {
        options.progress?.('youtube-search');
        const sourceIds = youtubeSourceIds(await ai.response(youtubeSearchBody(items, individual), 'youtube-search'));
        if (sourceIds.length === 0) return [];
        sawYouTubeSource = true;
        options.progress?.('metadata');
        try { return await resolveRecommendations(items, sourceIds, request); }
        catch (error) {
          if (error instanceof AiDiagnosticError && error.message === 'YOUTUBE_METADATA_FAILED') { metadataFailure = error; return []; }
          throw error;
        }
      };
      const excludedIds = new Set([context.current?.videoId, ...context.playlist.map((track) => track.videoId), ...(relaxedDiscovery ? [] : recent.map((track) => track.videoId))]);
      const initiallyResolved = await resolve(selected);
      recommendations = initiallyResolved.filter((track) => !excludedIds.has(track.videoId));
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
