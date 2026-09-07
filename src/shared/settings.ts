import { isRecord } from './track';

export interface DesignSettings {
  discStyle: 'lp' | 'cd';
  background: string;
  accent: string;
}

export const defaultSettings: DesignSettings = {
  discStyle: 'lp', background: '#fff4d8', accent: '#ff6a3d',
};

export function isDesignSettings(value: unknown): value is DesignSettings {
  return isRecord(value) && (value.discStyle === 'lp' || value.discStyle === 'cd') &&
    ['background', 'accent'].every((key) => typeof value[key] === 'string' && /^#[0-9a-f]{6}$/i.test(value[key]));
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
  return contrast('#28172f', settings.background) >= 4.5;
}

export function applyDesign(document: Document, settings: DesignSettings) {
  const style = document.documentElement.style;
  style.setProperty('--color-bg', settings.background);
  style.setProperty('--color-surface', '#fff9ea');
  style.setProperty('--color-ink', '#28172f');
  style.setProperty('--color-orange', settings.accent);
  style.setProperty('--color-accent-text', contrast(settings.accent, '#28172f') >= 3 ? '#28172f' : '#ffffff');
}
