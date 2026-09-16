import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const html = readFileSync('player-bridge/index.html', 'utf8');
const script = readFileSync('player-bridge/demo.js', 'utf8');

function demoApi() {
  const window = {} as {
    PixelJukeboxDemo?: {
      storageKey: string;
      hasCompleted(storage: Storage): boolean;
      claimDemo(storage: Storage): boolean;
    };
  };
  const context = vm.createContext({ window, document: { querySelector: () => null }, HTMLButtonElement: class {} });
  vm.runInContext(script, context);
  if (!window.PixelJukeboxDemo) throw new Error('Demo API was not initialized');
  return window.PixelJukeboxDemo;
}

function sessionStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe('GitHub Pages web demo', () => {
  it('keeps the demo and existing player bridge as separate Pages entries', () => {
    expect(html).toContain('<script type="module" src="./demo.js"></script>');
    expect(html).toContain('href="./demo.css"');
    expect(readFileSync('player-bridge/player.html', 'utf8')).toContain('<title>Pixel Jukebox Player Bridge</title>');
  });

  it('uses the documented E2E source and eight verified recommendation links', () => {
    expect(html).toContain('openai-e2e-2026-09-15T12-52-13-346Z.md');
    expect(html).toContain('Radiohead — No Surprises');
    expect([...html.matchAll(/https:\/\/www\.youtube\.com\/watch\?v=([\w-]+)/g)].map((match) => match[1])).toEqual([
      '6hUpJ94q0c8',
      'A-Tod1_tZdU',
      '4texipD7faM',
      'oAhO5eegMfY',
      '68nVcK58qO8',
      'AIOAlaACuv4',
      'kz9jhG963no',
      'z7xPjk1ldjg',
    ]);
    expect(html).toContain('실제 OpenAI 호출 없이');
  });

  it('allows one run per session and a new run in a new session', () => {
    const api = demoApi();
    const firstSession = sessionStorage();
    expect(api.hasCompleted(firstSession)).toBe(false);
    expect(api.claimDemo(firstSession)).toBe(true);
    expect(api.claimDemo(firstSession)).toBe(false);
    expect(api.hasCompleted(firstSession)).toBe(true);
    expect(api.claimDemo(sessionStorage())).toBe(true);
  });
});
