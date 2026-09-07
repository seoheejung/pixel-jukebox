import { isRecord } from './track';
import type { Recommendation } from './recommendation';

export const OPENAI_ORIGIN = 'https://api.openai.com/*';
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
  recommendationError: 'AI_RECOMMENDATION_ERROR',
} as const;

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

export function isAiRecommendationMessage(value: unknown): value is { type: typeof MESSAGE_AI.recommend; tabId: number } {
  return isRecord(value) && value.type === MESSAGE_AI.recommend && typeof value.tabId === 'number' && Number.isSafeInteger(value.tabId) && value.tabId >= 0;
}

export function isAiRecommendationsMessage(value: unknown): value is { type: typeof MESSAGE_AI.recommendations; recommendations: Recommendation[] } {
  if (!isRecord(value) || value.type !== MESSAGE_AI.recommendations || !Array.isArray(value.recommendations) || value.recommendations.length > 5) return false;
  return value.recommendations.every((item) => {
    if (!isRecord(item) || typeof item.candidateId !== 'string' || typeof item.artist !== 'string' || typeof item.title !== 'string' || typeof item.reason !== 'string' || !Array.isArray(item.tags) || item.tags.length < 1 || item.tags.length > 3) return false;
    return item.tags.every((tag) => typeof tag === 'string');
  });
}

export function isAiAction(value: unknown, type: string): boolean {
  return isRecord(value) && value.type === type;
}
