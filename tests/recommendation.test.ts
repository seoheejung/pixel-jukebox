import { describe, expect, it } from 'vitest';
import { parseDiscovery, parseSelection, youtubeSearchUrl } from '../src/shared/recommendation';
import { createRecommendationService } from '../src/background/recommendation';

describe('Phase 4 candidate boundary', () => {
  it('parses fixed discovery lines, removes duplicates and excludes context', () => {
    const candidates = parseDiscovery([
      'CANDIDATE|C01|Artist|Current Song',
      'CANDIDATE|C01|Artist|Other Song',
      'CANDIDATE|C02|Artist|Other Song',
      'CANDIDATE|C03|New Artist|New Song',
      'not a candidate',
    ].join('\n'), [{ artist: 'Artist', title: 'Current Song' }]);
    expect(candidates).toEqual([{ candidateId: 'C01', artist: 'Artist', title: 'Other Song' }, { candidateId: 'C03', artist: 'New Artist', title: 'New Song' }]);
  });

  it('rejects unknown IDs, duplicate IDs, partial JSON and non-Korean reasons', () => {
    const candidates = [{ candidateId: 'C01', artist: 'Artist', title: 'Song' }];
    expect(parseSelection('{"recommendations":[', candidates)).toBeNull();
    expect(parseSelection({ recommendations: [{ candidateId: 'C99', reason: '좋은 곡', tags: ['indie'] }] }, candidates)).toBeNull();
    expect(parseSelection({ recommendations: [{ candidateId: 'C01', reason: 'Good song', tags: ['indie'] }] }, candidates)).toBeNull();
    expect(parseSelection({ recommendations: [{ candidateId: 'C01', reason: '현재 곡과 잘 어울리는 분위기', tags: ['indie'] }, { candidateId: 'C01', reason: '중복 추천', tags: ['pop'] }] }, candidates)).toBeNull();
  });

  it('uses original candidate metadata for YouTube search', () => {
    const result = parseSelection({ recommendations: [{ candidateId: 'C01', reason: '새로운 분위기의 곡입니다', tags: ['dreamy'] }] }, [{ candidateId: 'C01', artist: 'Original Artist', title: 'Original Song' }]);
    expect(result?.[0]).toMatchObject({ artist: 'Original Artist', title: 'Original Song' });
    expect(youtubeSearchUrl(result![0]!)).toContain(encodeURIComponent('Original Artist Original Song'));
  });
});

describe('Phase 4 workflow boundaries', () => {
  it('keeps Discovery and Selection requests separate and retries Selection once', async () => {
    const bodies: Record<string, unknown>[] = [];
    const responses = [
      { output_text: 'CANDIDATE|C01|New Artist|New Song' },
      { output_text: '{"recommendations":[{"candidateId":"C99","reason":"잘못된 후보","tags":["indie"]}]}' },
      { output_text: '{"recommendations":[{"candidateId":"C01","reason":"현재 곡과 잘 어울리는 분위기","tags":["indie"]}]}' },
    ];
    const service = createRecommendationService({ response: async (body) => { bodies.push(body); return responses.shift(); } });
    const result = await service.run({ current: null, playlist: [], recent: [] });
    expect(result.recommendations).toHaveLength(1);
    expect(bodies).toHaveLength(3);
    expect(bodies[0]!.tools).toBeDefined();
    expect(bodies[0]!.text).toBeUndefined();
    expect(bodies[1]!.tools).toBeUndefined();
    expect(bodies[1]!.text).toBeDefined();
    expect(bodies[2]!.input).toEqual(bodies[1]!.input);
  });
});
