import { describe, expect, it, vi } from 'vitest';
import { resolveRecommendations, youtubeSourceIds } from '../src/background/youtube-resolver';
import { createRecommendationService } from '../src/background/recommendation';
import { parseDiscovery } from '../src/shared/recommendation';
import { trackFromVideoId } from '../src/shared/track';
import { playlistTrack } from '../src/shared/playlist';

const videoId = 'dQw4w9WgXcQ';
const sources = { output: [{ type: 'web_search_call', action: { sources: [{ url: `https://www.youtube.com/watch?v=${videoId}` }] } }] };
const output = (text: string) => ({ output: [{ type: 'message', content: [{ type: 'output_text', text }] }] });
const extraction = output(JSON.stringify({ candidates: [{ artist: 'Rick Astley', title: 'Never Gonna Give You Up' }] }));
const candidates = parseDiscovery('CANDIDATE|C01|Rick Astley|Never Gonna Give You Up');
const metadata = { provider_name: 'YouTube', title: 'Rick Astley - Never Gonna Give You Up (Official Video)', author_name: 'Rick Astley' };

describe('YouTube recommendation resolution', () => {
  it('preserves a six-song listening sequence after a missing video resolves later', async () => {
    const songs = Array.from({ length: 6 }, (_, index) => ({ artist: `Artist ${index + 1}`, title: `Song ${index + 1}` }));
    const sequence = ['C06', 'C04', 'C02', 'C05', 'C01', 'C03'];
    const url = (index: number) => `https://www.youtube.com/watch?v=AAAAAAAAA0${index}`;
    const response = vi.fn()
      .mockResolvedValueOnce(output('Supported songs in a natural continuation.'))
      .mockResolvedValueOnce(output(JSON.stringify({ candidates: songs })))
      .mockResolvedValueOnce(output(JSON.stringify({ recommendations: sequence.map((candidateId) => ({ candidateId })) })))
      .mockResolvedValueOnce(output([1, 2, 3, 5, 6].map(url).join('\n')))
      .mockResolvedValueOnce(output(url(4)));
    const request = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const id = new URL(String(input)).searchParams.get('url')!.slice(-1);
      return new Response(JSON.stringify({ provider_name: 'YouTube', title: `Artist ${id} - Song ${id}`, author_name: `Artist ${id}` }));
    });
    const current = trackFromVideoId('dQw4w9WgXcQ');
    const result = await createRecommendationService({ response }, request).run({
      current, playlist: [playlistTrack(current), playlistTrack(trackFromVideoId('M7lc1UVf-VE'))], recent: [],
    });
    expect(result.recommendations.map((item) => item.candidateId)).toEqual(sequence);
    const selection = response.mock.calls[2]![0];
    expect(selection.input[1].content).toContain('Ordered playlist (playback order)');
    expect(selection.input[1].content).toContain('Reference track position: 1');
    expect(selection.text.format.schema.properties.recommendations).toMatchObject({ minItems: 0, maxItems: 8 });
  });

  it('collects direct, cited, and search-source YouTube URLs only once', () => {
    expect(youtubeSourceIds({ output_text: `https://youtu.be/${videoId}` })).toEqual([videoId]);
    expect(youtubeSourceIds(sources)).toEqual([videoId]);
    expect(youtubeSourceIds({ output: [{ type: 'message', content: [{ type: 'output_text', text: `Found https://youtube.com/watch?v=${videoId}`, annotations: [{ type: 'url_citation', url: `https://youtu.be/${videoId}` }, { type: 'url_citation', url: 'https://example.com/video' }] }] }] })).toEqual([videoId]);
    expect(youtubeSourceIds({ output_text: `{"url":"https://www.youtube.com/watch?v=${videoId}"} [video](https://youtu.be/${videoId})` })).toEqual([videoId]);
  });

  it('normalizes supported mobile, music, embed, and live video URLs only', () => {
    expect(youtubeSourceIds({ output_text: [
      `https://m.youtube.com/watch?v=${videoId}`,
      `https://music.youtube.com/watch?v=${videoId}`,
      `https://www.youtube.com/embed/${videoId}`,
      `https://youtube.com/live/${videoId}?feature=share`,
    ].join(' ') })).toEqual([videoId]);
    expect(youtubeSourceIds({ output_text: [
      `https://evil.youtube.com/watch?v=${videoId}`,
      `http://www.youtube.com/watch?v=${videoId}`,
      'https://www.youtube.com/results?search_query=artist+song',
      `https://www.youtube.com.evil.example/watch?v=${videoId}`,
    ].join(' ') })).toEqual([]);
    expect(youtubeSourceIds({ output_text: `https:\\/\\/m.youtube.com\\/live\\/${videoId}` })).toEqual([videoId]);
  });

  it('resolves matching real metadata without forwarding credentials', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(metadata)));
    const result = await resolveRecommendations(candidates, [videoId], request);
    expect(result[0]).toMatchObject({ videoId, title: metadata.title, channelTitle: 'Rick Astley' });
    expect(request.mock.calls[0]?.[1]).toMatchObject({ credentials: 'omit', redirect: 'error' });
    expect(request.mock.calls[0]?.[1]?.headers).toBeUndefined();
  });

  it('discards unavailable and mismatched videos', async () => {
    const unavailable = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 }));
    await expect(resolveRecommendations(candidates, [videoId], unavailable)).rejects.toMatchObject({ message: 'YOUTUBE_METADATA_FAILED', details: { stage: 'metadata' } });
    const mismatch = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ...metadata, title: 'Different song' })));
    expect(await resolveRecommendations(candidates, [videoId], mismatch)).toEqual([]);
  });

  it('matches short artist and title tokens on a broadcaster upload without substring false positives', async () => {
    const shortCandidate = parseDiscovery('CANDIDATE|C01|선미|꼬리');
    const broadcaster = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      ...metadata, title: '[Mnet Comeback Stage] 선미 - 꼬리', author_name: 'Mnet K-POP',
    })));
    expect(await resolveRecommendations(shortCandidate, [videoId], broadcaster)).toHaveLength(1);

    const latinShortCandidate = parseDiscovery('CANDIDATE|C01|IU|Go');
    const substringOnly = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      ...metadata, title: 'Golden Hour - Going Home', author_name: 'IUMusic',
    })));
    expect(await resolveRecommendations(latinShortCandidate, [videoId], substringOnly)).toEqual([]);
  });

  it('does not treat generic video qualifiers as a song-title match', async () => {
    const qualified = parseDiscovery('CANDIDATE|C01|Rick Astley|Different Song (Official Video)');
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(metadata)));
    expect(await resolveRecommendations(qualified, [videoId], request)).toEqual([]);
  });

  it('rejects clearly labeled reaction or commentary videos', async () => {
    const reaction = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      ...metadata, title: '[Classical Composer Reacts] Rick Astley - Never Gonna Give You Up', author_name: 'ReacttotheK',
    })));
    expect(await resolveRecommendations(candidates, [videoId], reaction)).toEqual([]);
    const commentary = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      ...metadata, title: 'Rick Astley - Never Gonna Give You Up | Commentary', author_name: 'Music Review',
    })));
    expect(await resolveRecommendations(candidates, [videoId], commentary)).toEqual([]);
  });

  it('retries selection once with identical candidates and caches resolved results', async () => {
    const response = vi.fn().mockResolvedValueOnce(output('Research supports Rick Astley — Never Gonna Give You Up.'))
      .mockResolvedValueOnce(extraction)
      .mockResolvedValueOnce({ output_text: '{broken' })
      .mockResolvedValueOnce({ output_text: JSON.stringify({ recommendations: [{ candidateId: 'C01' }] }) })
      .mockResolvedValueOnce(sources);
    const request = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify(metadata)));
    const service = createRecommendationService({ response }, request);
    const context = { current: trackFromVideoId('4Ygvv_Ae3dg'), playlist: [], recent: [] };
    const result = await service.run(context);
    expect(result.recommendations[0]?.videoId).toBe(videoId);
    const originalSelectionRequest = response.mock.calls[2]?.[0] as { input: unknown[]; text: unknown };
    const retriedSelection = response.mock.calls[3]?.[0] as { input: unknown[]; text: unknown };
    expect(retriedSelection.input.slice(0, 2)).toEqual(originalSelectionRequest.input);
    expect(retriedSelection.text).toEqual(originalSelectionRequest.text);
    expect(await service.run(context)).toEqual(result);
    expect(response).toHaveBeenCalledTimes(5);
    expect(request).toHaveBeenCalledTimes(1);
    const discovery = response.mock.calls[0]?.[0] as { tool_choice?: string; input?: Array<{ content: string }> };
    expect(discovery.tool_choice).toBe('required');
    expect(discovery.input?.[0]?.content).toContain('first match original release year or era (never upload date), genre, and language');
    expect(discovery.input?.[0]?.content).toContain("second match the reference track's mood and vocal character");
    expect(discovery.input?.[0]?.content).toContain('energy, groove, tempo feel, texture, instrumentation, and production as supporting criteria');
    expect(discovery.input?.[0]?.content).toContain('aiming for at least 10 different artists');
    expect(discovery.input?.[1]?.content).toContain(context.current.videoUrl);
    expect(discovery.input?.[0]?.content).toContain('channel may be a label, distributor, broadcaster');
    expect(discovery.input?.[0]?.content).toContain('pool of up to 15 supported candidates');
    const discoveryContextText = discovery.input?.[1]?.content ?? '';
    expect(discoveryContextText.indexOf('Supplied title:')).toBeLessThan(discoveryContextText.indexOf('Secondary reference URL:'));
    const extractionRequest = response.mock.calls[1]?.[0] as { tools?: unknown; text?: { format?: { type?: string } }; input?: Array<{ content: string }> };
    expect(extractionRequest.tools).toBeUndefined();
    expect(extractionRequest.text?.format?.type).toBe('json_schema');
    expect(extractionRequest.input?.[1]?.content).toContain('Web research:');
    const firstSelection = response.mock.calls[2]?.[0] as { input?: Array<{ content: string }> };
    expect(firstSelection.input?.[1]?.content).toContain(context.current.videoTitle);
    expect(firstSelection.input?.[1]?.content).toContain('Candidates:');
    for (const prompt of [discovery, extractionRequest, firstSelection]) {
      expect(prompt.input?.[0]?.content).toContain('Prefer artists other than the identified reference artist');
      expect(prompt.input?.[0]?.content).toContain('at most one song per artist across the entire candidate pool and final recommendations');
      expect(prompt.input?.[0]?.content).toContain('aliases and spelling variants as the same artist');
      expect(prompt.input?.[0]?.content).toContain('return fewer songs instead of filling the count with repeated artists');
      expect(prompt.input?.[0]?.content).not.toContain('only a tertiary tie-breaker');
    }
    const selectionSchema = response.mock.calls[2]?.[0] as { text: { format: { schema: { properties: { recommendations: { minItems: number } } } } } };
    expect(selectionSchema.text.format.schema.properties.recommendations.minItems).toBe(0);
    const youtubeSearch = response.mock.calls[4]?.[0] as { tools?: Array<Record<string, unknown>> };
    expect(youtubeSearch.tools?.[0]).toEqual({ type: 'web_search' });
  });

  it('uses bounded reserve batches until it has five verified distinct songs', async () => {
    const discovered = Array.from({ length: 7 }, (_, index) => ({
      artist: `Artist ${index + 1}`, title: `Song ${index + 1}`,
    }));
    const ids = ['AAAAAAAAA01', 'AAAAAAAAA03', 'AAAAAAAAA04', 'AAAAAAAAA05', 'AAAAAAAAA06', 'AAAAAAAAA07'];
    const sourceResponse = (sourceIds: string[]) => ({
      output: [{ type: 'web_search_call', action: { sources: sourceIds.map((id) => ({ url: `https://youtu.be/${id}` })) } }],
    });
    const response = vi.fn()
      .mockResolvedValueOnce(output('Seven supported candidates.'))
      .mockResolvedValueOnce(output(JSON.stringify({ candidates: discovered })))
      .mockResolvedValueOnce(output(JSON.stringify({ recommendations: [{ candidateId: 'C01' }, { candidateId: 'C02' }] })))
      .mockResolvedValueOnce(sourceResponse([ids[0]!]))
      .mockResolvedValueOnce({ output: [] })
      .mockResolvedValueOnce(sourceResponse(ids.slice(1)));
    const metadataById = new Map(ids.map((id, index) => {
      const candidateNumber = index === 0 ? 1 : index + 2;
      return [id, { ...metadata, title: `Artist ${candidateNumber} - Song ${candidateNumber}`, author_name: `Artist ${candidateNumber}` }];
    }));
    const request = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const endpoint = input instanceof URL ? input : new URL(String(input));
      const requestedVideo = new URL(endpoint.searchParams.get('url')!).searchParams.get('v')!;
      return new Response(JSON.stringify(metadataById.get(requestedVideo)));
    });

    const result = await createRecommendationService({ response }, request).run({
      current: trackFromVideoId('4Ygvv_Ae3dg'),
      playlist: [playlistTrack(trackFromVideoId(ids[0]!, { videoTitle: 'Existing Song', channelTitle: 'Existing Artist' }))],
      recent: [],
    });

    expect(result.recommendations.map((item) => item.candidateId)).toEqual(['C03', 'C04', 'C05', 'C06', 'C07']);
    expect(new Set(result.recommendations.map((item) => item.videoId))).toHaveLength(5);
    expect(response).toHaveBeenCalledTimes(6);
    const selection = response.mock.calls[2]?.[0] as { input?: Array<{ content: string }> };
    expect(selection.input?.[0]?.content).toContain('Select and order 5 to 8 distinct candidate IDs');
  });

  it('distinguishes an empty YouTube source search from metadata failures', async () => {
    const response = vi.fn().mockResolvedValueOnce(output('Research supports Rick Astley — Never Gonna Give You Up.'))
      .mockResolvedValueOnce(extraction)
      .mockResolvedValueOnce({ output_text: JSON.stringify({ recommendations: [{ candidateId: 'C01' }] }) })
      .mockResolvedValueOnce({ output: [] });
    const service = createRecommendationService({ response }, vi.fn<typeof fetch>());
    await expect(service.run({ current: trackFromVideoId('4Ygvv_Ae3dg'), playlist: [], recent: [] }))
      .rejects.toMatchObject({ message: 'YOUTUBE_SOURCE_EMPTY', details: { stage: 'youtube-search' } });
    expect(response).toHaveBeenCalledTimes(5);
    const batchPrompt = response.mock.calls[3]?.[0] as { input?: Array<{ content: string }> };
    const focusedPrompt = response.mock.calls[4]?.[0] as { input?: Array<{ content: string }> };
    expect(batchPrompt.input?.[0]?.content).toContain('official full-length music video (MV) for every supplied song');
    expect(batchPrompt.input?.[0]?.content).toContain('(1) the official artist channel, then (2) the verified label or distributor channel');
    expect(focusedPrompt.input?.[0]?.content).toContain('focused exact-match search');
    expect(focusedPrompt.input?.[0]?.content).toContain('Do not substitute live stages');
    expect(focusedPrompt.input?.[0]?.content).not.toBe(batchPrompt.input?.[0]?.content);
  });

  it('uses the focused search fallback when a batch search has no direct video URL', async () => {
    const response = vi.fn().mockResolvedValueOnce(output('Research supports Rick Astley — Never Gonna Give You Up.'))
      .mockResolvedValueOnce(extraction)
      .mockResolvedValueOnce({ output_text: JSON.stringify({ recommendations: [{ candidateId: 'C01' }] }) })
      .mockResolvedValueOnce({ output: [{ type: 'web_search_call', action: { sources: [{ url: 'https://www.youtube.com/results?search_query=rick+astley' }] } }] })
      .mockResolvedValueOnce({ output_text: `https://m.youtube.com/live/${videoId}?feature=share` });
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(metadata)));

    const result = await createRecommendationService({ response }, request).run({
      current: trackFromVideoId('4Ygvv_Ae3dg'), playlist: [], recent: [],
    });

    expect(result.recommendations[0]?.videoId).toBe(videoId);
    expect(response).toHaveBeenCalledTimes(5);
  });

  it('constrains selection IDs and repairs an invalid selection with validation feedback', async () => {
    const response = vi.fn()
      .mockResolvedValueOnce(output('Research supports Rick Astley — Never Gonna Give You Up.'))
      .mockResolvedValueOnce(extraction)
      .mockResolvedValueOnce(output('{"recommendations":[{"candidateId":"C99"}]}'))
      .mockResolvedValueOnce(output('{"recommendations":[{"candidateId":"C01"}]}'))
      .mockResolvedValueOnce({ output_text: `https://www.youtube.com/watch?v=${videoId}` });
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(metadata)));
    const result = await createRecommendationService({ response }, request).run({ current: trackFromVideoId('4Ygvv_Ae3dg'), playlist: [], recent: [] });
    expect(result.recommendations[0]?.videoId).toBe(videoId);
    expect(response.mock.calls[2]?.[0]).toMatchObject({ text: { format: { schema: { properties: { recommendations: { items: { properties: { candidateId: { enum: ['C01'] } } } } } } } } });
    expect(response.mock.calls[3]?.[0]).toMatchObject({ input: expect.arrayContaining([expect.objectContaining({ role: 'developer', content: expect.stringContaining('후보 목록에 없는 ID') })]) });
  });

  it.each([
    ['{"recommendations":[{"candidateId":"C99"}]}', '선곡 응답에 후보 목록에 없는 ID가 있습니다.'],
    ['{"recommendations":[{"candidateId":"C01"},{"candidateId":"C01"}]}', '선곡 응답에 중복된 후보 ID가 있습니다.'],
    ['{broken', '선곡 응답이 올바른 JSON이 아닙니다.'],
    ['', '선곡 응답에 텍스트가 없습니다.'],
  ])('reports the selection failure after one bounded retry: %s', async (invalid, message) => {
    const response = vi.fn().mockResolvedValueOnce(output('Supported song'))
      .mockResolvedValueOnce(extraction).mockResolvedValue(output(invalid));
    const request = vi.fn<typeof fetch>();
    await expect(createRecommendationService({ response }, request).run({ current: trackFromVideoId('4Ygvv_Ae3dg'), playlist: [], recent: [] }))
      .rejects.toMatchObject({ message: 'INVALID_SELECTION', details: { stage: 'selection', message } });
    expect(response).toHaveBeenCalledTimes(4);
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects empty research and malformed extraction without fabricating candidates', async () => {
    const context = { current: trackFromVideoId('4Ygvv_Ae3dg'), playlist: [], recent: [] };
    const noResearch = createRecommendationService({ response: vi.fn().mockResolvedValue({ output: [{ type: 'web_search_call' }] }) });
    await expect(noResearch.run(context)).rejects.toMatchObject({ message: 'INVALID_RESPONSE', details: { stage: 'discovery', message: '검색 응답에 후보를 추출할 텍스트가 없습니다.' } });
    const malformedResponse = vi.fn().mockResolvedValueOnce(output('Supported candidate: Artist — Song')).mockResolvedValueOnce(output('{broken'));
    await expect(createRecommendationService({ response: malformedResponse }).run(context)).rejects.toMatchObject({ message: 'INVALID_RESPONSE', details: { stage: 'discovery', message: '후보 JSON 형식이 올바르지 않습니다.' } });
    const emptyResponse = vi.fn()
      .mockResolvedValueOnce(output('No supported candidates.')).mockResolvedValueOnce(output('{"candidates":[]}'))
      .mockResolvedValueOnce(output('Still no supported candidates.')).mockResolvedValueOnce(output('{"candidates":[]}'));
    await expect(createRecommendationService({ response: emptyResponse }).run(context)).rejects.toMatchObject({ message: 'NO_CANDIDATES', details: { stage: 'discovery' } });
    expect(emptyResponse).toHaveBeenCalledTimes(4);
    const retry = emptyResponse.mock.calls[2]?.[0] as { input?: Array<{ content: string }> };
    expect(retry.input?.[0]?.content).toContain('preserving the stated priority order');
  });

  it('excludes current, playlist, and duplicate candidates before selection', async () => {
    const current = trackFromVideoId('4Ygvv_Ae3dg', { videoTitle: 'Seed Song', channelTitle: 'Seed Artist' });
    const queuedTrack = trackFromVideoId('M7lc1UVf-VE', { videoTitle: 'Queued Song', channelTitle: 'Queued Artist' });
    const extracted = output(JSON.stringify({ candidates: [
      { artist: 'Seed Artist', title: 'Seed Song' },
      { artist: 'Queued Artist', title: 'Queued Song' },
      { artist: 'Rick Astley', title: 'Never Gonna Give You Up' },
      { artist: '  RICK ASTLEY ', title: ' never gonna give you up ' },
    ] }));
    const response = vi.fn()
      .mockResolvedValueOnce(output('Supported candidates.')).mockResolvedValueOnce(extracted)
      .mockResolvedValueOnce(output(JSON.stringify({ recommendations: [{ candidateId: 'C01' }] })))
      .mockResolvedValueOnce(sources);
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(metadata)));
    const result = await createRecommendationService({ response }, request).run({
      current, playlist: [playlistTrack(queuedTrack)], recent: [],
    });
    expect(result.candidates.map(({ artist, title }) => ({ artist, title }))).toEqual([
      { artist: 'Rick Astley', title: 'Never Gonna Give You Up' },
    ]);
  });

  it('keeps verified partial results when a supplemental YouTube search fails', async () => {
    const secondExtraction = output(JSON.stringify({ candidates: [
      { artist: 'Rick Astley', title: 'Never Gonna Give You Up' },
      { artist: 'Second Artist', title: 'Second Song' },
    ] }));
    const response = vi.fn()
      .mockResolvedValueOnce(output('Two supported candidates.')).mockResolvedValueOnce(secondExtraction)
      .mockResolvedValueOnce(output(JSON.stringify({ recommendations: [{ candidateId: 'C01' }, { candidateId: 'C02' }] })))
      .mockResolvedValueOnce(sources)
      .mockRejectedValueOnce(new Error('supplemental search failed'));
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(metadata)));
    const result = await createRecommendationService({ response }, request).run({ current: trackFromVideoId('4Ygvv_Ae3dg'), playlist: [], recent: [] });
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]?.videoId).toBe(videoId);
    expect(response).toHaveBeenCalledTimes(5);
  });
});
