import { isRecord, isTrack, isVideoId } from './track';
import type { Recommendation } from './recommendation';
import { MAX_RECOMMENDATIONS, VIDEO_TYPES } from './recommendation';

export const OPENAI_ORIGIN = 'https://api.openai.com/*';
export const YOUTUBE_METADATA_ORIGIN = 'https://www.youtube.com/*';
export const OPENAI_API_KEY = 'openaiApiKey';

export const MESSAGE_AI = {
  status: 'AI_STATUS',
  save: 'AI_SAVE',
  clear: 'AI_CLEAR',
  test: 'AI_TEST',
  state: 'AI_STATE',
  result: 'AI_RESULT',
  recommend: 'AI_RECOMMEND',
  recommendations: 'AI_RECOMMENDATIONS',
  progress: 'AI_PROGRESS',
  recommendationError: 'AI_RECOMMENDATION_ERROR',
} as const;

export type RecommendationStage = 'connection' | 'discovery' | 'selection' | 'youtube-search' | 'metadata';
export type RecommendationProgressStage = Exclude<RecommendationStage, 'connection'>;
export type RecommendationRequestKind = 'discovery-research' | 'candidate-extraction' | 'selection' | 'selection-retry' | 'youtube-search' | 'youtube-search-individual' | 'youtube-search-reserve';
export type RecommendationErrorCode = 'NO_TRACK' | 'NO_CANDIDATES' | 'INVALID_SELECTION' | 'PERMISSION_DENIED' | 'NOT_CONFIGURED' | 'AUTH_ERROR' | 'RATE_LIMIT' | 'USAGE_ERROR' | 'OPENAI_REQUEST_FAILED' | 'BAD_REQUEST' | 'NOT_FOUND' | 'SERVER_ERROR' | 'NETWORK_ERROR' | 'INVALID_RESPONSE' | 'YOUTUBE_SOURCE_EMPTY' | 'YOUTUBE_METADATA_FAILED' | 'FAILED';

export interface RecommendationRequestMeasurement {
  kind: RecommendationRequestKind;
  stage: RecommendationProgressStage;
  model: string;
  serviceTier?: string;
  durationMs: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  webSearchCalls: number;
  startedAt?: number;
  completedAt?: number;
  success?: boolean;
  timeout?: boolean;
  httpStatus?: number;
  errorKind?: string;
}

export type RecommendationDropStage = 'discovery' | 'selection' | 'resolver' | 'oembed';

export interface RecommendationDropMeasurement {
  stage: RecommendationDropStage;
  inputCount: number;
  outputCount: number;
  dropCount: number;
  attempts: number;
}

export interface RecommendationResolverDiagnostics {
  searchSourceEmpty: number;
  urlExtractionFailure: number;
  candidateMismatch: number;
  videoTypeExcluded: number;
  validationFailure: number;
  supplementalSearchFailure: number;
}

export interface RecommendationLiveMeasurement {
  startedAt: number;
  updatedAt: number;
  currentStage: RecommendationProgressStage | null;
  lastCompletedStage: RecommendationProgressStage | null;
  stageCounts: RecommendationDropMeasurement[];
  stageTimings: Array<{ stage: RecommendationProgressStage; startedAt: number; completedAt?: number; elapsedMs: number }>;
  requests: RecommendationRequestMeasurement[];
  activeRequest?: { stage: RecommendationProgressStage; kind: RecommendationRequestKind; attempt: number; startedAt: number };
  resolver: { targetCount: number; processedCount: number; successCount: number; failedCount: number; supplementalSearches: number; currentCandidateIndex: number | null };
}

export interface RecommendationMeasurement {
  cacheHit: boolean;
  totalDurationMs: number;
  candidateCount: number;
  selectedCount: number;
  youtubeSourceCount: number;
  recommendationCount: number;
  stageCounts: RecommendationDropMeasurement[];
  resolverDiagnostics: RecommendationResolverDiagnostics;
  requests: RecommendationRequestMeasurement[];
}

export interface AiErrorDetails {
  stage: RecommendationStage;
  status?: number;
  apiCode?: string;
  apiType?: string;
  param?: string;
  message?: string;
  requestId?: string;
}

export interface AiState {
  configured: boolean;
  persisted: boolean;
  permission: boolean;
  trustedContexts: boolean;
}

export function isAiState(value: unknown): value is AiState {
  return isRecord(value) && typeof value.configured === 'boolean' && typeof value.persisted === 'boolean' &&
    typeof value.permission === 'boolean' && typeof value.trustedContexts === 'boolean';
}

export function isAiStateMessage(value: unknown): value is { type: typeof MESSAGE_AI.state; state: AiState } {
  return isRecord(value) && value.type === MESSAGE_AI.state && isAiState(value.state);
}

export function isAiRecommendationMessage(value: unknown): value is { type: typeof MESSAGE_AI.recommend; sourceVideoId: string; refresh?: boolean } {
  return isRecord(value) && value.type === MESSAGE_AI.recommend && Object.keys(value).every((key) => key === 'type' || key === 'sourceVideoId' || key === 'refresh') &&
    isVideoId(value.sourceVideoId) && (value.refresh === undefined || typeof value.refresh === 'boolean');
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isRecommendationRequestMeasurement(value: unknown): value is RecommendationRequestMeasurement {
  if (!isRecord(value) || !['discovery-research', 'candidate-extraction', 'selection', 'selection-retry', 'youtube-search', 'youtube-search-individual', 'youtube-search-reserve'].includes(value.kind as string) ||
    !['discovery', 'selection', 'youtube-search'].includes(value.stage as string) || typeof value.model !== 'string' || value.model.length > 100 ||
    (value.serviceTier !== undefined && (typeof value.serviceTier !== 'string' || value.serviceTier.length > 100))) return false;
  return ['durationMs', 'inputTokens', 'cachedInputTokens', 'outputTokens', 'totalTokens', 'webSearchCalls'].every((key) => isNonNegativeInteger(value[key])) &&
    (value.startedAt === undefined || isNonNegativeInteger(value.startedAt)) && (value.completedAt === undefined || isNonNegativeInteger(value.completedAt)) &&
    (value.success === undefined || typeof value.success === 'boolean') && (value.timeout === undefined || typeof value.timeout === 'boolean') &&
    (value.httpStatus === undefined || isNonNegativeInteger(value.httpStatus)) && (value.errorKind === undefined || (typeof value.errorKind === 'string' && value.errorKind.length <= 100));
}

function isLiveMeasurement(value: unknown): value is RecommendationLiveMeasurement {
  const resolver = isRecord(value) ? value.resolver : undefined;
  if (!isRecord(value) || !isNonNegativeInteger(value.startedAt) || !isNonNegativeInteger(value.updatedAt) ||
    (value.currentStage !== null && !['discovery', 'selection', 'youtube-search', 'metadata'].includes(value.currentStage as string)) ||
    (value.lastCompletedStage !== null && !['discovery', 'selection', 'youtube-search', 'metadata'].includes(value.lastCompletedStage as string)) ||
    !Array.isArray(value.stageCounts) || !value.stageCounts.every(isRecommendationDropMeasurement) || !Array.isArray(value.stageTimings) || !value.stageTimings.every((item) => isRecord(item) && ['discovery', 'selection', 'youtube-search', 'metadata'].includes(item.stage as string) && isNonNegativeInteger(item.startedAt) && (item.completedAt === undefined || isNonNegativeInteger(item.completedAt)) && isNonNegativeInteger(item.elapsedMs)) || !Array.isArray(value.requests) || !value.requests.every(isRecommendationRequestMeasurement) ||
    !isRecord(resolver)) return false;
  return ['targetCount', 'processedCount', 'successCount', 'failedCount', 'supplementalSearches'].every((key) => isNonNegativeInteger(resolver[key])) &&
    (resolver.currentCandidateIndex === null || isNonNegativeInteger(resolver.currentCandidateIndex)) &&
    (value.activeRequest === undefined || (isRecord(value.activeRequest) && ['discovery', 'selection', 'youtube-search'].includes(value.activeRequest.stage as string) && typeof value.activeRequest.kind === 'string' && isNonNegativeInteger(value.activeRequest.attempt) && isNonNegativeInteger(value.activeRequest.startedAt)));
}

function isRecommendationDropMeasurement(value: unknown): value is RecommendationDropMeasurement {
  return isRecord(value) && ['discovery', 'selection', 'resolver', 'oembed'].includes(value.stage as string) &&
    ['inputCount', 'outputCount', 'dropCount', 'attempts'].every((key) => isNonNegativeInteger(value[key]));
}

export function isRecommendationMeasurement(value: unknown): value is RecommendationMeasurement {
  const resolverDiagnostics = isRecord(value) ? value.resolverDiagnostics : undefined;
  return isRecord(value) && typeof value.cacheHit === 'boolean' &&
    ['totalDurationMs', 'candidateCount', 'selectedCount', 'youtubeSourceCount', 'recommendationCount'].every((key) => isNonNegativeInteger(value[key])) &&
    isRecord(resolverDiagnostics) && ['searchSourceEmpty', 'urlExtractionFailure', 'candidateMismatch', 'videoTypeExcluded', 'validationFailure', 'supplementalSearchFailure'].every((key) => isNonNegativeInteger(resolverDiagnostics[key])) &&
    Array.isArray(value.stageCounts) && value.stageCounts.length === 4 && value.stageCounts.every(isRecommendationDropMeasurement) &&
    Array.isArray(value.requests) && value.requests.length <= 100 && value.requests.every(isRecommendationRequestMeasurement) &&
    Object.keys(value).every((key) => ['cacheHit', 'totalDurationMs', 'candidateCount', 'selectedCount', 'youtubeSourceCount', 'recommendationCount', 'stageCounts', 'resolverDiagnostics', 'requests'].includes(key));
}

export function isAiRecommendationsMessage(value: unknown): value is { type: typeof MESSAGE_AI.recommendations; recommendations: Recommendation[]; measurement?: RecommendationMeasurement } {
  if (!isRecord(value) || value.type !== MESSAGE_AI.recommendations || !Array.isArray(value.recommendations) || value.recommendations.length > MAX_RECOMMENDATIONS) return false;
  return (value.measurement === undefined || isRecommendationMeasurement(value.measurement)) && value.recommendations.every((item) => {
    if (!isRecord(item) || typeof item.candidateId !== 'string' || typeof item.artist !== 'string' || typeof item.title !== 'string' ||
      typeof item.videoType !== 'string' || !(VIDEO_TYPES as readonly string[]).includes(item.videoType)) return false;
    if (!Object.keys(item).every((key) => ['candidateId', 'artist', 'title', 'videoId', 'videoUrl', 'videoType', 'thumbnail', 'channelTitle'].includes(key))) return false;
    return isTrack({ ...item, videoTitle: item.title, playbackState: 'paused' });
  });
}

export function isAiProgressMessage(value: unknown): value is { type: typeof MESSAGE_AI.progress; stage: RecommendationProgressStage; measurement?: RecommendationLiveMeasurement } {
  return isRecord(value) && value.type === MESSAGE_AI.progress && Object.keys(value).every((key) => ['type', 'stage', 'measurement'].includes(key)) &&
    ['discovery', 'selection', 'youtube-search', 'metadata'].includes(value.stage as string) && (value.measurement === undefined || isLiveMeasurement(value.measurement));
}

export function isAiErrorDetails(value: unknown): value is AiErrorDetails {
  if (!isRecord(value) || !['connection', 'discovery', 'selection', 'youtube-search', 'metadata'].includes(value.stage as string)) return false;
  return Object.keys(value).every((key) => ['stage', 'status', 'apiCode', 'apiType', 'param', 'message', 'requestId'].includes(key)) &&
    (value.status === undefined || (Number.isInteger(value.status) && (value.status as number) >= 0)) &&
    ['apiCode', 'apiType', 'param', 'message', 'requestId'].every((key) => value[key] === undefined || (typeof value[key] === 'string' && (value[key] as string).length <= 300));
}

export function isAiRecommendationErrorMessage(value: unknown): value is { type: typeof MESSAGE_AI.recommendationError; code: RecommendationErrorCode; details?: AiErrorDetails } {
  return isRecord(value) && value.type === MESSAGE_AI.recommendationError && ['NO_TRACK', 'NO_CANDIDATES', 'INVALID_SELECTION', 'PERMISSION_DENIED', 'NOT_CONFIGURED', 'AUTH_ERROR', 'RATE_LIMIT', 'USAGE_ERROR', 'OPENAI_REQUEST_FAILED', 'BAD_REQUEST', 'NOT_FOUND', 'SERVER_ERROR', 'NETWORK_ERROR', 'INVALID_RESPONSE', 'YOUTUBE_SOURCE_EMPTY', 'YOUTUBE_METADATA_FAILED', 'FAILED'].includes(value.code as string) &&
    (value.details === undefined || isAiErrorDetails(value.details));
}

export function isAiAction(value: unknown, type: string): boolean {
  return isRecord(value) && value.type === type;
}
