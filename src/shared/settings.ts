import { isRecord } from './track';

export interface DesignSettings {
  shell: string;
  screen: string;
  button: string;
}

export const defaultSettings: DesignSettings = {
  shell: '#d9d7cc', screen: '#9bbc0f', button: '#a13b6d',
};

export function isDesignSettings(value: unknown): value is DesignSettings {
  return isRecord(value) && ['shell', 'screen', 'button'].every((key) => typeof value[key] === 'string' && /^#[0-9a-f]{6}$/i.test(value[key]));
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((index) => {
    const channel = parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

export function contrast(first: string, second: string): number {
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function readableSettings(settings: DesignSettings): boolean {
  return contrast('#2e2230', settings.shell) >= 4.5 && contrast('#0f380f', settings.screen) >= 4.5;
}

export function applyDesign(document: Document, settings: DesignSettings) {
  const style = document.documentElement.style;
  style.setProperty('--color-shell', settings.shell);
  style.setProperty('--color-screen', settings.screen);
  style.setProperty('--color-ab', settings.button);
  style.setProperty('--color-accent-text', contrast(settings.button, '#2e2230') >= 4.5 ? '#2e2230' : '#ffffff');
}
