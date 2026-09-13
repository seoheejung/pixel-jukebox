import { describe, expect, it } from 'vitest';
import { backScreen, clampSelection, homeScreen, homeScreens, moveSelection, openScreen } from '../src/sidepanel/screen-navigation';

describe('LCD screen navigation', () => {
  it('wraps menu selection and clamps after list changes', () => {
    expect(moveSelection(homeScreen(), -1, 5).selected).toBe(4);
    expect(moveSelection({ ...homeScreen(), selected: 4 }, 1, 5).selected).toBe(0);
    expect(clampSelection({ ...homeScreen(), selected: 4 }, 2).selected).toBe(1);
  });

  it('returns through screen history and SELECT resets home', () => {
    const settings = openScreen(homeScreen(), 'settings');
    const appearance = openScreen(settings, 'appearance');
    expect(backScreen(appearance).screen).toBe('settings');
    expect(homeScreen()).toEqual({ screen: 'home', selected: 0, history: [] });
    expect(backScreen(openScreen({ ...homeScreen(), selected: 3 }, 'settings')).selected).toBe(3);
  });

  it('keeps Add Music integrated into Playlist rather than the Home menu', () => {
    expect(homeScreens).toEqual(['now-playing', 'playlist', 'ai-picks', 'settings']);
  });
});
