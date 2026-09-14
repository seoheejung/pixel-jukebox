import { describe, expect, it } from 'vitest';
import { parseDiscovery, parseSelection, recommendationTrack } from '../src/shared/recommendation';
import { isAiRecommendationsMessage } from '../src/shared/ai';

describe('recommendations', () => {
  it('accepts 24 discovery candidates and at most 12 resolved recommendations', () => {
    const lines = Array.from({ length: 25 }, (_, index) => `CANDIDATE|C${String(index + 1).padStart(2, '0')}|Artist ${index + 1}|Song ${index + 1}`);
    const candidates = parseDiscovery(lines.join('\n'));
    expect(candidates).toHaveLength(24);
    const selection = candidates.slice(0, 12).map(({ candidateId }) => ({ candidateId }));
    expect(parseSelection({ recommendations: selection }, candidates)).toHaveLength(12);
    expect(parseSelection({ recommendations: [...selection, { candidateId: 'C13' }] }, candidates)).toBeNull();
    const resolved = candidates.slice(0, 13).map((item, index) => {
      const videoId = `AAAAAAAAA${String(index).padStart(2, '0')}`;
      return { ...item, videoId, videoUrl: `https://www.youtube.com/watch?v=${videoId}`, videoType: 'MV' as const, thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, channelTitle: item.artist };
    });
    expect(isAiRecommendationsMessage({ type: 'AI_RECOMMENDATIONS', recommendations: resolved.slice(0, 12) })).toBe(true);
    expect(isAiRecommendationsMessage({ type: 'AI_RECOMMENDATIONS', recommendations: resolved })).toBe(false);
  });

  it('accepts only exact candidate lines without YouTube data', () => {
    const result = parseDiscovery([
      'CANDIDATE|C01|Artist|Song',
      'CANDIDATE|C01|Duplicate|Song',
      'CANDIDATE|C02|Artist|Song',
      'CANDIDATE|C03|Other Artist|Other Song|https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      '- CANDIDATE|C04|Third Artist|Third Song',
    ].join('\n'));
    expect(result).toEqual([{ candidateId: 'C01', artist: 'Artist', title: 'Song' }]);
  });

  it('uses Candidate Set metadata and rejects unknown or duplicate IDs', () => {
    const candidates = parseDiscovery('CANDIDATE|C01|Original Artist|Original Song\nCANDIDATE|C02|Other Artist|Other Song');
    expect(parseSelection({ recommendations: [{ candidateId: 'C02' }, { candidateId: 'C01' }] }, candidates)).toEqual([
      { candidateId: 'C02', artist: 'Other Artist', title: 'Other Song' },
      { candidateId: 'C01', artist: 'Original Artist', title: 'Original Song' },
    ]);
    expect(parseSelection({ recommendations: [{ candidateId: 'C99' }] }, candidates)).toBeNull();
    expect(parseSelection({ recommendations: [{ candidateId: 'C01' }, { candidateId: 'C01' }] }, candidates)).toBeNull();
    expect(parseSelection({ recommendations: [{ candidateId: 'C01', reason: 'extra' }] }, candidates)).toBeNull();
  });

  it('creates a Playlist track from a resolved recommendation', () => {
    expect(recommendationTrack({
      candidateId: 'C01', artist: 'Artist', title: 'Song', channelTitle: 'Artist Official',
      videoId: 'dQw4w9WgXcQ', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      videoType: 'MV', thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    })).toMatchObject({ videoId: 'dQw4w9WgXcQ', videoTitle: 'Song', channelTitle: 'Artist Official' });
  });
});
