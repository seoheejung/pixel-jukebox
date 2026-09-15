import type { RecommendationLiveMeasurement } from '../shared/ai';

export interface LiveMeasurementTarget {
  __pixelJukeboxLiveMeasurement?: RecommendationLiveMeasurement;
}

export function storeLiveMeasurement(target: LiveMeasurementTarget, enabled: boolean, measurement?: RecommendationLiveMeasurement): void {
  if (enabled && measurement) target.__pixelJukeboxLiveMeasurement = structuredClone(measurement);
}
