import { isRecord } from './track';

export interface DesignSettings {
  discStyle: 'lp' | 'cd';
  artwork: boolean;
  background: string;
  panel: string;
  accent: string;
  text: string;
}

export const defaultSettings: DesignSettings = {
  discStyle: 'lp', artwork: true,
  background: '#fff4d8', panel: '#fff9ea', accent: '#ff6a3d', text: '#28172f',
};

export function isDesignSettings(value: unknown): value is DesignSettings {
  return isRecord(value) && (value.discStyle === 'lp' || value.discStyle === 'cd') && typeof value.artwork === 'boolean' &&
    ['background', 'panel', 'accent', 'text'].every((key) => typeof value[key] === 'string' && /^#[0-9a-f]{6}$/i.test(value[key]));
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
  return contrast(settings.text, settings.background) >= 4.5 && contrast(settings.text, settings.panel) >= 4.5;
}

export function applyDesign(document: Document, settings: DesignSettings) {
  const style = document.documentElement.style;
  style.setProperty('--color-bg', settings.background);
  style.setProperty('--color-surface', settings.panel);
  style.setProperty('--color-ink', settings.text);
  style.setProperty('--color-orange', settings.accent);
  style.setProperty('--color-accent-text', contrast(settings.accent, '#28172f') >= 4.5 ? '#28172f' : '#ffffff');
}
