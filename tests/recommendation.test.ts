import { describe, expect, it } from 'vitest';
import { parseDiscovery, parseSelection, recommendationTrack } from '../src/shared/recommendation';

const source = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

describe('recommendations', () => {
  it('keeps only parsed candidates and validates source URLs', () => {
    const result = parseDiscovery(`CANDIDATE|C01|Artist|Song|${source}\nCANDIDATE|C01|Duplicate|Song|${source}\ninvalid`);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ artist: 'Artist', title: 'Song', videoId: 'dQw4w9WgXcQ', videoUrl: source });
  });

  it('uses original candidate metadata for selected recommendations', () => {
    const candidates = parseDiscovery(`CANDIDATE|C01|Original Artist|Original Song|${source}`);
    const result = parseSelection({ recommendations: [{ candidateId: 'C01', reason: '현재 곡과 잘 어울리는 분위기', tags: ['dreamy'] }] }, candidates);
    expect(result).toHaveLength(1);
    expect(result?.[0]).toMatchObject({ artist: 'Original Artist', title: 'Original Song', videoId: 'dQw4w9WgXcQ' });
  });

  it('creates a playlist track only for a verified video ID', () => {
    const [recommendation] = parseSelection({ recommendations: [{ candidateId: 'C01', reason: '새로운 분위기의 곡입니다', tags: ['indie'] }] }, parseDiscovery(`CANDIDATE|C01|Artist|Song|${source}`))!;
    expect(recommendationTrack(recommendation!)).toMatchObject({ videoId: 'dQw4w9WgXcQ', videoTitle: 'Song' });
    const [withoutSource] = parseSelection({ recommendations: [{ candidateId: 'C01', reason: '새로운 분위기의 곡입니다', tags: ['indie'] }] }, parseDiscovery('CANDIDATE|C01|Artist|Song'))!;
    expect(recommendationTrack(withoutSource!)).toBeNull();
  });
});
