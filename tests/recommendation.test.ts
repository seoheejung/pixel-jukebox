import { describe, expect, it } from 'vitest';
import { parseDiscovery, parseDiscoveryCandidates, parseSelection, recommendationTrack } from '../src/shared/recommendation';
import { isAiRecommendationsMessage } from '../src/shared/ai';

const source = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

describe('recommendations', () => {
  it('accepts eight verified continuation songs across the runtime contract and rejects nine', () => {
    const candidates = parseDiscoveryCandidates({ candidates: Array.from({ length: 9 }, (_, index) => ({ artist: 'Artist', title: `Song ${index}` })) })!;
    const selection = candidates.slice(0, 8).map(({ candidateId }) => ({ candidateId }));
    expect(parseSelection({ recommendations: selection }, candidates)).toHaveLength(8);
    expect(parseSelection({ recommendations: [...selection, { candidateId: 'C09' }] }, candidates)).toBeNull();
    const verified = candidates.map((item, index) => ({ ...item, videoId: `AAAAAAAAA0${index}`, videoUrl: `https://www.youtube.com/watch?v=AAAAAAAAA0${index}` }));
    expect(isAiRecommendationsMessage({ type: 'AI_RECOMMENDATIONS', recommendations: verified.slice(0, 8) })).toBe(true);
    expect(isAiRecommendationsMessage({ type: 'AI_RECOMMENDATIONS', recommendations: verified })).toBe(false);
  });

  it('keeps only parsed candidates and validates source URLs', () => {
    const result = parseDiscovery(`CANDIDATE|C01|Artist|Song|${source}\nCANDIDATE|C01|Duplicate|Song|${source}\ninvalid`);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ artist: 'Artist', title: 'Song', videoId: 'dQw4w9WgXcQ', videoUrl: source });
  });

  it('accepts harmless discovery formatting variations', () => {
    const result = parseDiscovery('- candidate | c1 | Artist | Song\n* CANDIDATE|C02|Other Artist|Other Song');
    expect(result.map(({ candidateId, artist, title }) => ({ candidateId, artist, title }))).toEqual([
      { candidateId: 'C01', artist: 'Artist', title: 'Song' },
      { candidateId: 'C02', artist: 'Other Artist', title: 'Other Song' },
    ]);
  });

  it('validates structured candidates and assigns local IDs', () => {
    const result = parseDiscoveryCandidates({ candidates: [{ artist: 'Artist', title: 'Song | Live' }, { artist: 'Artist', title: 'Song | Live' }] });
    expect(result).toEqual([{ candidateId: 'C01', artist: 'Artist', title: 'Song | Live', channelTitle: 'Artist', videoId: null, videoUrl: null, thumbnail: '' }]);
    expect(parseDiscoveryCandidates({ candidates: [{ artist: 'Artist', title: 'Song', extra: true }] })).toBeNull();
  });

  it('uses original candidate metadata for selected recommendations', () => {
    const candidates = parseDiscovery(`CANDIDATE|C01|Original Artist|Original Song|${source}`);
    const result = parseSelection({ recommendations: [{ candidateId: 'C01' }] }, candidates);
    expect(result).toHaveLength(1);
    expect(result?.[0]).toMatchObject({ artist: 'Original Artist', title: 'Original Song', videoId: 'dQw4w9WgXcQ' });
  });

  it('creates a playlist track only for a verified video ID', () => {
    const [recommendation] = parseSelection({ recommendations: [{ candidateId: 'C01' }] }, parseDiscovery(`CANDIDATE|C01|Artist|Song|${source}`))!;
    expect(recommendationTrack(recommendation!)).toMatchObject({ videoId: 'dQw4w9WgXcQ', videoTitle: 'Song' });
    const [withoutSource] = parseSelection({ recommendations: [{ candidateId: 'C01' }] }, parseDiscovery('CANDIDATE|C01|Artist|Song'))!;
    expect(recommendationTrack(withoutSource!)).toBeNull();
  });

  it('rejects unknown IDs and fields outside the selection schema', () => {
    const candidates = parseDiscovery('CANDIDATE|C01|Artist|Song');
    expect(parseSelection({ recommendations: [{ candidateId: 'C99' }] }, candidates)).toBeNull();
    expect(parseSelection({ recommendations: [{ candidateId: 'C01', reason: 'extra' }] }, candidates)).toBeNull();
  });
});
