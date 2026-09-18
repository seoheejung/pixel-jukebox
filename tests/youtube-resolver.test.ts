import { describe, expect, it, vi } from 'vitest';
import { createRecommendationService } from '../src/background/recommendation';
import { parseYouTubeResults, resolveRecommendations } from '../src/background/youtube-resolver';
import type { Candidate, VideoType } from '../src/shared/recommendation';
import { parseDiscovery } from '../src/shared/recommendation';
import { playlistTrack } from '../src/shared/playlist';
import { trackFromVideoId } from '../src/shared/track';

const videoId = 'dQw4w9WgXcQ';
const candidate: Candidate = { candidateId: 'C01', artist: 'Rick Astley', title: 'Never Gonna Give You Up' };
const candidates = [candidate];
const metadata = {
  title: 'Rick Astley - Never Gonna Give You Up (Official Video)',
  author_name: 'Rick Astley',
  provider_name: 'YouTube',
  thumbnail_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
};

function output(text: string) {
  return { output_text: text };
}

function measuredOutput(text: string, webSearch = false) {
  return {
    output_text: text,
    model: 'gpt-4.1-mini-2025-04-14',
    service_tier: 'default',
    usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 20 }, output_tokens: 30, total_tokens: 130 },
    output: webSearch ? [{ type: 'web_search_call' }] : [],
  };
}

function youtubeLine(item: Candidate, id = videoId, type: VideoType = 'MV') {
  return `YOUTUBE|${item.candidateId}|${type}|${item.artist}|${item.title}|https://www.youtube.com/watch?v=${id}`;
}

describe('YouTube recommendation resolver', () => {
  it('parses exact candidate-bound results and all supported video types', () => {
    const supported = ['MV', 'PERFORMANCE', 'LIVE', 'LYRIC', 'VISUALIZER', 'AUDIO', 'TOPIC', 'OFFICIAL_OTHER'] as const;
    const pool = supported.map((_, index) => ({ candidateId: `C${String(index + 1).padStart(2, '0')}`, artist: `Artist ${index}`, title: `Song ${index}` }));
    const lines = pool.map((item, index) => youtubeLine(item, `AAAAAAAAA${String(index).padStart(2, '0')}`, supported[index]!));
    expect(parseYouTubeResults(output(lines.join('\n')), pool).map((item) => item.videoType)).toEqual(supported);
  });

  it('canonicalizes supported YouTube URL forms in resolver lines', () => {
    const variants = ['https://youtu.be/dQw4w9WgXcQ', 'https://music.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/embed/dQw4w9WgXcQ'];
    for (const url of variants) {
      expect(parseYouTubeResults(output(`YOUTUBE|C01|MV|Rick Astley|Never Gonna Give You Up|${url}`), candidates)).toMatchObject([{ videoId }]);
    }
  });

  it('rejects guessed, mismatched, duplicate, and unsupported sources', () => {
    const text = [
      youtubeLine(candidate),
      youtubeLine(candidate, 'M7lc1UVf-VE', 'LIVE'),
      `YOUTUBE|C01|MV|Wrong Artist|Never Gonna Give You Up|https://www.youtube.com/watch?v=M7lc1UVf-VE`,
      `YOUTUBE|C99|MV|Rick Astley|Never Gonna Give You Up|https://www.youtube.com/watch?v=M7lc1UVf-VE`,
      `YOUTUBE|C01|CONCEPT|Rick Astley|Never Gonna Give You Up|https://www.youtube.com/watch?v=M7lc1UVf-VE`,
      `YOUTUBE|C01|MV|Rick Astley|Never Gonna Give You Up|https://youtu.be/M7lc1UVf-VE`,
      `YOUTUBE|C01|MV|Rick Astley|Never Gonna Give You Up|https://www.youtube.com/live/M7lc1UVf-VE`,
    ].join('\n');
    expect(parseYouTubeResults(output(text), candidates)).toEqual([{
      ...candidate, videoId, videoUrl: `https://www.youtube.com/watch?v=${videoId}`, videoType: 'MV',
    }]);
  });

  it('validates oEmbed metadata and retains the selected video type', async () => {
    const sources = parseYouTubeResults(output(youtubeLine(candidate, videoId, 'VISUALIZER')), candidates);
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(metadata)));
    const result = await resolveRecommendations(candidates, sources, request);
    expect(result[0]).toMatchObject({ ...candidate, videoId, videoType: 'VISUALIZER', channelTitle: 'Rick Astley' });
    expect(request.mock.calls[0]?.[1]).toMatchObject({ credentials: 'omit', redirect: 'error' });
    expect(request.mock.calls[0]?.[1]?.headers).toBeUndefined();
  });

  it('uses cited YouTube search sources for an individual track and infers its video type', async () => {
    const response = {
      output: [{ type: 'web_search_call', action: { sources: [{ url: `https://youtu.be/${videoId}`, title: 'YouTube result' }] } }],
    };
    const sources = parseYouTubeResults(response, candidates, true);
    expect(sources).toEqual([{ ...candidate, videoId, videoUrl: `https://www.youtube.com/watch?v=${videoId}`, videoType: null }]);
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      ...metadata, title: 'Rick Astley - Never Gonna Give You Up (Official Audio)',
    })));
    expect(await resolveRecommendations(candidates, sources, request)).toMatchObject([{ videoId, videoType: 'AUDIO' }]);
  });

  it('does not accept an uncited URL written only in model text', () => {
    expect(parseYouTubeResults(output(`Try https://youtu.be/${videoId}`), candidates, true)).toEqual([]);
  });

  it('discards mismatched recordings, covers, reactions, and karaoke', async () => {
    const sources = parseYouTubeResults(output(youtubeLine(candidate)), candidates);
    for (const title of [
      'Different song',
      'Rick Astley - Never Gonna Give You Up (Cover)',
      '[Producer Reacts] Rick Astley - Never Gonna Give You Up',
      'Rick Astley - Never Gonna Give You Up Karaoke',
    ]) {
      const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ...metadata, title })));
      expect(await resolveRecommendations(candidates, sources, request)).toEqual([]);
    }
  });

  it('reports metadata transport failure when every source fails', async () => {
    const sources = parseYouTubeResults(output(youtubeLine(candidate)), candidates);
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 }));
    await expect(resolveRecommendations(candidates, sources, request)).rejects.toMatchObject({
      message: 'YOUTUBE_METADATA_FAILED', details: { stage: 'metadata' },
    });
  });

  it('requests a complete recommendation set once and caches resolved results', async () => {
    const response = vi.fn().mockResolvedValueOnce(measuredOutput(`TRACK|01|${candidate.artist}|${candidate.title}|https://www.youtube.com/watch?v=${videoId}`, true));
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(metadata)));
    const service = createRecommendationService({ response }, request);
    const context = { current: trackFromVideoId('4Ygvv_Ae3dg'), playlist: [], recent: [] };
    const result = await service.run(context);
    expect(result.recommendations[0]).toMatchObject({ candidateId: 'C01', videoId, videoType: 'OFFICIAL_OTHER' });
    const cached = await service.run(context);
    expect(cached).toMatchObject({ candidates: result.candidates, recommendations: result.recommendations, measurement: { cacheHit: true, requests: [] } });
    expect(response).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(1);

    const discovery = response.mock.calls[0]?.[0] as {
      tool_choice?: string;
      input?: Array<{ content: string }>;
      text?: unknown;
      tools?: Array<{ type?: string; search_context_size?: string; filters?: { allowed_domains?: string[] } }>;
      max_tool_calls?: number;
      reasoning?: { effort?: string };
    };
    expect(discovery.tool_choice).toBe('required');
    expect(discovery.input?.[0]?.content).toContain('In one response');
    expect(discovery.input?.[0]?.content).toContain('10 primary');
    expect(discovery.text).toBeUndefined();
    expect(discovery.tools?.[0]?.type).toBe('web_search');
    expect(discovery.tools?.[0]?.search_context_size).toBe('low');
    expect(discovery.tools?.[0]?.filters?.allowed_domains).toEqual(['www.youtube.com']);
    expect(discovery.max_tool_calls).toBe(6);
    expect(discovery.reasoning?.effort).toBe('low');
  });

  it('accepts the labeled Artist — Title TRACK format returned by the Responses API', async () => {
    const response = vi.fn().mockResolvedValueOnce(output(`TRACK | PRIMARY | ${candidate.artist} — ${candidate.title} | https://www.youtube.com/watch?v=${videoId}`));
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(metadata)));
    const result = await createRecommendationService({ response }, request).run({ current: trackFromVideoId('4Ygvv_Ae3dg'), playlist: [], recent: [] });
    expect(result.recommendations).toMatchObject([{ candidateId: 'C01', artist: candidate.artist, title: candidate.title, videoId }]);
  });

  it('uses a verified Web Search source when the model returned an uncited URL', async () => {
    const uncitedId = 'M7lc1UVf-VE';
    const response = vi.fn().mockResolvedValueOnce({
      output: [
        { type: 'web_search_call', action: { sources: [{ url: `https://www.youtube.com/watch?v=${videoId}` }] } },
        { type: 'message', content: [{ type: 'output_text', text: `TRACK|PRIMARY|Wrong Artist|Wrong Title|https://www.youtube.com/watch?v=${uncitedId}` }] },
      ],
    });
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(metadata)));
    const result = await createRecommendationService({ response }, request).run({ current: trackFromVideoId('4Ygvv_Ae3dg'), playlist: [], recent: [] });
    expect(result.recommendations).toMatchObject([{ videoId, artist: 'Rick Astley', title: metadata.title }]);
  });

  it('keeps valid partial results when another selected candidate cannot resolve', async () => {
    const second: Candidate = { candidateId: 'C02', artist: 'Second Artist', title: 'Second Song' };
    const response = vi.fn().mockResolvedValueOnce(output([
      `TRACK|01|${candidate.artist}|${candidate.title}|https://www.youtube.com/watch?v=${videoId}`,
      `TRACK|02|${second.artist}|${second.title}|https://www.youtube.com/watch?v=M7lc1UVf-VE`,
    ].join('\n')));
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(metadata)));
    const result = await createRecommendationService({ response }, request).run({ current: trackFromVideoId('4Ygvv_Ae3dg'), playlist: [], recent: [] });
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]?.candidateId).toBe('C01');
    expect(response).toHaveBeenCalledTimes(1);
  });

  it('measures each live Responses call without retaining response content', async () => {
    const response = vi.fn().mockResolvedValueOnce(measuredOutput(`TRACK|01|${candidate.artist}|${candidate.title}|https://www.youtube.com/watch?v=${videoId}`, true));
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(metadata)));
    const result = await createRecommendationService({ response }, request).run({ current: trackFromVideoId('4Ygvv_Ae3dg'), playlist: [], recent: [] }, { refresh: true });
    expect(result.measurement).toMatchObject({
      cacheHit: false, candidateCount: 1, selectedCount: 1, youtubeSourceCount: 1, recommendationCount: 1,
      stageCounts: [
        { stage: 'discovery', inputCount: 12, outputCount: 1, dropCount: 11, attempts: 1 },
        { stage: 'selection', inputCount: 0, outputCount: 0, dropCount: 0, attempts: 0 },
        { stage: 'resolver', inputCount: 1, outputCount: 1, dropCount: 0, attempts: 1 },
        { stage: 'oembed', inputCount: 1, outputCount: 1, dropCount: 0, attempts: 1 },
      ],
      resolverDiagnostics: { searchSourceEmpty: 0, urlExtractionFailure: 0, candidateMismatch: 0, videoTypeExcluded: 0, validationFailure: 0, supplementalSearchFailure: 0 },
    });
    expect(result.measurement?.requests).toHaveLength(1);
    expect(result.measurement?.requests[0]).toMatchObject({
      kind: 'single-recommendation', stage: 'discovery', model: 'gpt-4.1-mini-2025-04-14', serviceTier: 'default',
      inputTokens: 100, cachedInputTokens: 20, outputTokens: 30, totalTokens: 130, webSearchCalls: 1,
    });
    expect(result.measurement?.requests.map((item) => item.kind)).toEqual(['single-recommendation']);
    expect(JSON.stringify(result.measurement)).not.toContain('Never Gonna Give You Up');
  });

  it('fails Discovery without retry when no valid TRACK line exists', async () => {
    const response = vi.fn()
      .mockResolvedValueOnce(output('No valid tracks found.'));
    await expect(createRecommendationService({ response }).run({ current: trackFromVideoId('4Ygvv_Ae3dg'), playlist: [], recent: [] }))
      .rejects.toMatchObject({ message: 'INVALID_RESPONSE', details: { stage: 'discovery' } });
    expect(response).toHaveBeenCalledTimes(1);
  });

  it('excludes the current track, Playlist, and Recent Recommendations before Selection', async () => {
    const current = trackFromVideoId('4Ygvv_Ae3dg', { videoTitle: 'Seed Song', channelTitle: 'Seed Artist' });
    const queued = trackFromVideoId('M7lc1UVf-VE', { videoTitle: 'Queued Song', channelTitle: 'Queued Artist' });
    const recent = [{
      candidateId: 'OLD', artist: 'Recent Artist', title: 'Recent Song', videoId: 'ysz5S6PUM-U',
      videoUrl: 'https://www.youtube.com/watch?v=ysz5S6PUM-U', videoType: 'MV' as const,
      thumbnail: 'https://i.ytimg.com/vi/ysz5S6PUM-U/hqdefault.jpg', channelTitle: 'Recent Artist',
    }];
    const response = vi.fn().mockResolvedValueOnce(output([
      'TRACK|01|Wrong Artist|Wrong Current|https://www.youtube.com/watch?v=4Ygvv_Ae3dg',
      'TRACK|02|Wrong Artist|Wrong Playlist|https://www.youtube.com/watch?v=M7lc1UVf-VE',
      'TRACK|03|Wrong Artist|Wrong Recent|https://www.youtube.com/watch?v=ysz5S6PUM-U',
      `TRACK|04|${candidate.artist}|${candidate.title}|https://www.youtube.com/watch?v=${videoId}`,
    ].join('\n')));
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(metadata)));
    const result = await createRecommendationService({ response }, request).run({ current, playlist: [playlistTrack(queued)], recent });
    expect(result.candidates).toEqual([{ candidateId: 'C04', artist: 'Rick Astley', title: 'Never Gonna Give You Up' }]);
  });
});
