import { isRecord, isTrack, isVideoId } from './track';
import type { Recommendation } from './recommendation';
import { MAX_RECOMMENDATIONS } from './recommendation';

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
export type RecommendationErrorCode = 'NO_TRACK' | 'NO_CANDIDATES' | 'INVALID_SELECTION' | 'PERMISSION_DENIED' | 'NOT_CONFIGURED' | 'AUTH_ERROR' | 'RATE_LIMIT' | 'USAGE_ERROR' | 'OPENAI_REQUEST_FAILED' | 'BAD_REQUEST' | 'NOT_FOUND' | 'SERVER_ERROR' | 'NETWORK_ERROR' | 'INVALID_RESPONSE' | 'YOUTUBE_SOURCE_EMPTY' | 'YOUTUBE_METADATA_FAILED' | 'FAILED';

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

export function isAiRecommendationsMessage(value: unknown): value is { type: typeof MESSAGE_AI.recommendations; recommendations: Recommendation[] } {
  if (!isRecord(value) || value.type !== MESSAGE_AI.recommendations || !Array.isArray(value.recommendations) || value.recommendations.length > MAX_RECOMMENDATIONS) return false;
  return value.recommendations.every((item) => {
    if (!isRecord(item) || typeof item.candidateId !== 'string' || typeof item.artist !== 'string' || typeof item.title !== 'string') return false;
    return isTrack({ ...item, videoTitle: item.title, playbackState: 'paused' });
  });
}

export function isAiProgressMessage(value: unknown): value is { type: typeof MESSAGE_AI.progress; stage: RecommendationProgressStage } {
  return isRecord(value) && value.type === MESSAGE_AI.progress && Object.keys(value).length === 2 &&
    ['discovery', 'selection', 'youtube-search', 'metadata'].includes(value.stage as string);
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
