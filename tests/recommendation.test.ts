import { describe, expect, it } from 'vitest';
import { parseDiscovery, parseSelection, recommendationTrack } from '../src/shared/recommendation';
import { isAiProgressMessage, isAiRecommendationsMessage } from '../src/shared/ai';

describe('recommendations', () => {
  it('accepts safe live progress measurements for timeout diagnostics', () => {
    const measurement = {
      startedAt: 1000, updatedAt: 2500, currentStage: 'youtube-search' as const, lastCompletedStage: 'selection' as const,
      stageCounts: [
        { stage: 'discovery' as const, inputCount: 0, outputCount: 24, dropCount: 0, attempts: 1 },
        { stage: 'selection' as const, inputCount: 24, outputCount: 15, dropCount: 9, attempts: 1 },
        { stage: 'resolver' as const, inputCount: 15, outputCount: 4, dropCount: 11, attempts: 1 },
        { stage: 'oembed' as const, inputCount: 0, outputCount: 0, dropCount: 0, attempts: 0 },
      ],
      stageTimings: [{ stage: 'youtube-search' as const, startedAt: 2000, elapsedMs: 500 }],
      requests: [{ kind: 'youtube-search' as const, stage: 'youtube-search' as const, model: 'gpt-4.1-mini', durationMs: 500, inputTokens: 10, cachedInputTokens: 0, outputTokens: 4, totalTokens: 14, webSearchCalls: 1, startedAt: 2000, completedAt: 2500, success: true, timeout: false }],
      activeRequest: { stage: 'youtube-search' as const, kind: 'youtube-search' as const, attempt: 1, startedAt: 2000 },
      resolver: { targetCount: 15, processedCount: 0, successCount: 0, failedCount: 0, supplementalSearches: 0, currentCandidateIndex: 0 },
    };
    expect(isAiProgressMessage({ type: 'AI_PROGRESS', stage: 'youtube-search', measurement })).toBe(true);
    expect(isAiProgressMessage({ type: 'AI_PROGRESS', stage: 'youtube-search', measurement: { ...measurement, activeRequest: { ...measurement.activeRequest, startedAt: -1 } } })).toBe(false);
  });

  it('accepts 30 discovery candidates and at most 20 resolved recommendations', () => {
    const lines = Array.from({ length: 31 }, (_, index) => `CANDIDATE|C${String(index + 1).padStart(2, '0')}|Artist ${index + 1}|Song ${index + 1}`);
    const candidates = parseDiscovery(lines.join('\n'));
    expect(candidates).toHaveLength(30);
    const selection = candidates.slice(0, 20).map(({ candidateId }) => ({ candidateId }));
    expect(parseSelection({ recommendations: selection }, candidates)).toHaveLength(20);
    expect(parseSelection({ recommendations: selection.slice(0, 11) }, candidates)).toBeNull();
    expect(parseSelection({ recommendations: [...selection, { candidateId: 'C21' }] }, candidates)).toBeNull();
    const resolved = candidates.slice(0, 21).map((item, index) => {
      const videoId = `AAAAAAAAA${String(index).padStart(2, '0')}`;
      return { ...item, videoId, videoUrl: `https://www.youtube.com/watch?v=${videoId}`, videoType: 'MV' as const, thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, channelTitle: item.artist };
    });
    expect(isAiRecommendationsMessage({ type: 'AI_RECOMMENDATIONS', recommendations: resolved.slice(0, 20) })).toBe(true);
    const measurement = {
      cacheHit: false, totalDurationMs: 1200, candidateCount: 24, selectedCount: 12, youtubeSourceCount: 12, recommendationCount: 12,
      stageCounts: [
        { stage: 'discovery', inputCount: 0, outputCount: 24, dropCount: 0, attempts: 1 },
        { stage: 'selection', inputCount: 24, outputCount: 12, dropCount: 12, attempts: 1 },
        { stage: 'resolver', inputCount: 12, outputCount: 12, dropCount: 0, attempts: 1 },
        { stage: 'oembed', inputCount: 12, outputCount: 12, dropCount: 0, attempts: 1 },
      ],
      resolverDiagnostics: { searchSourceEmpty: 0, urlExtractionFailure: 0, candidateMismatch: 0, videoTypeExcluded: 0, validationFailure: 0, supplementalSearchFailure: 0 },
      requests: [{ kind: 'discovery-research', stage: 'discovery', model: 'gpt-4.1-mini', durationMs: 500, inputTokens: 100, cachedInputTokens: 0, outputTokens: 40, totalTokens: 140, webSearchCalls: 1 }],
    };
    expect(isAiRecommendationsMessage({ type: 'AI_RECOMMENDATIONS', recommendations: resolved.slice(0, 12), measurement })).toBe(true);
    expect(isAiRecommendationsMessage({ type: 'AI_RECOMMENDATIONS', recommendations: resolved.slice(0, 12), measurement: { ...measurement, inputTokens: 'secret' } })).toBe(false);
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
