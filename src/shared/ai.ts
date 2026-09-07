import { isRecord } from './track';

export const OPENAI_ORIGIN = 'https://api.openai.com/*';
export const OPENAI_API_KEY = 'openaiApiKey';

export const MESSAGE_AI = {
  status: 'AI_STATUS',
  save: 'AI_SAVE',
  clear: 'AI_CLEAR',
  test: 'AI_TEST',
  state: 'AI_STATE',
  result: 'AI_RESULT',
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

export function isAiAction(value: unknown, type: string): boolean {
  return isRecord(value) && value.type === type;
}
