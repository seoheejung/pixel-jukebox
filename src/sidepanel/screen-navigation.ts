export type ScreenId = 'home' | 'now-playing' | 'playlist' | 'ai-picks' | 'settings' | 'appearance' | 'openai';

export interface ScreenFrame { screen: ScreenId; selected: number }
export interface ScreenState { screen: ScreenId; selected: number; history: ScreenFrame[] }

export const homeScreens: ScreenId[] = ['now-playing', 'playlist', 'ai-picks', 'settings'];

export function initialScreenState(): ScreenState { return homeScreen(); }

export function openScreen(state: ScreenState, screen: ScreenId): ScreenState {
  if (screen === state.screen) return state;
  return { screen, selected: 0, history: [...state.history, { screen: state.screen, selected: state.selected }].slice(-8) };
}

export function homeScreen(): ScreenState { return { screen: 'home', selected: 0, history: [] }; }

export function backScreen(state: ScreenState): ScreenState {
  const history = [...state.history];
  const frame = history.pop() ?? { screen: 'home' as const, selected: 0 };
  return { ...frame, history };
}

export function moveSelection(state: ScreenState, delta: number, count: number): ScreenState {
  if (count <= 0) return { ...state, selected: 0 };
  return { ...state, selected: (state.selected + delta + count) % count };
}

export function clampSelection(state: ScreenState, count: number): ScreenState {
  return { ...state, selected: Math.max(0, Math.min(state.selected, Math.max(0, count - 1))) };
}
