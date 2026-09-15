import { describe, expect, it } from 'vitest';
import { storeLiveMeasurement } from '../src/sidepanel/live-measurement';

const measurement = {
  startedAt: 1000, updatedAt: 2000, currentStage: 'youtube-search' as const, lastCompletedStage: 'selection' as const,
  stageCounts: [
    { stage: 'discovery' as const, inputCount: 0, outputCount: 24, dropCount: 0, attempts: 1 },
    { stage: 'selection' as const, inputCount: 24, outputCount: 15, dropCount: 9, attempts: 1 },
    { stage: 'resolver' as const, inputCount: 30, outputCount: 4, dropCount: 26, attempts: 2 },
    { stage: 'oembed' as const, inputCount: 4, outputCount: 3, dropCount: 1, attempts: 1 },
  ],
  stageTimings: [{ stage: 'youtube-search' as const, startedAt: 1200, elapsedMs: 800 }], requests: [],
  activeRequest: { stage: 'youtube-search' as const, kind: 'youtube-search-individual' as const, attempt: 2, startedAt: 1950 },
  resolver: { targetCount: 30, processedCount: 7, successCount: 3, failedCount: 4, supplementalSearches: 2, currentCandidateIndex: 7 },
};

describe('live measurement delivery', () => {
  it('stores a cloned measurement only for the E2E target', () => {
    const target: { __pixelJukeboxLiveMeasurement?: typeof measurement } = {};
    storeLiveMeasurement(target, true, measurement);
    expect(target.__pixelJukeboxLiveMeasurement).toEqual(measurement);
    expect(target.__pixelJukeboxLiveMeasurement).not.toBe(measurement);
    const previous = target.__pixelJukeboxLiveMeasurement;
    storeLiveMeasurement(target, false, measurement);
    expect(target.__pixelJukeboxLiveMeasurement).toBe(previous);
  });
});
