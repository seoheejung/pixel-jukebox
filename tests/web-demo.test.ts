import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const html = readFileSync('player-bridge/index.html', 'utf8');
const script = readFileSync('player-bridge/demo.js', 'utf8');
const readme = readFileSync('README.md', 'utf8');
const pagesWorkflow = readFileSync('.github/workflows/deploy-player-bridge.yml', 'utf8');

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
  it('documents the official Demo and Extension-only Player Bridge accurately', () => {
    expect(readme).toContain('https://seoheejung.github.io/pixel-jukebox/');
    expect(readme).toContain('단독 실행 화면 아님');
    expect(readme).toContain('npm run test:web:demo');
    expect(readme).toContain('Deploy web demo and player bridge');
    expect(pagesWorkflow).toContain('name: Deploy web demo and player bridge');
    expect(readme).not.toContain('Actions → Deploy player bridge');
  });

  it('keeps the demo and existing player bridge as separate Pages entries', () => {
    expect(html).toContain('<script type="module" src="./demo.js"></script>');
    expect(html).toContain('href="./demo.css"');
    expect(readFileSync('player-bridge/player.html', 'utf8')).toContain('<title>Pixel Jukebox Player Bridge</title>');
    expect(html).not.toContain('href="./player.html"');
    expect(html).toContain('PLAYER BRIDGE · EXTENSION ONLY');
    expect(html).toContain('단독 실행 화면이 아닙니다');
  });

  it('uses the Extension hardware structure in the demo console', () => {
    expect(html).toContain('class="action-control button-b"');
    expect(html).toContain('class="action-control button-a"');
    expect(html).toContain('id="demo-back"');
    expect(html).toContain('id="demo-select"');
    expect(html).toContain('id="demo-start"');
    expect(html.match(/id="dpad-(up|right|down|left)"/g)).toHaveLength(4);
    expect(html).toContain('<strong aria-hidden="true">SELECT</strong>');
    expect(html).toContain('<strong aria-hidden="true">START</strong>');
    expect(html).toContain('id="home-panel"');
    expect(html).toContain('id="settings-panel"');
    expect(html).toContain('class="speaker"');
    expect(html).not.toContain('class="screen-label"');
  });

  it('uses eight documented E2E results without YouTube navigation', () => {
    expect(html).toContain('openai-e2e-2026-09-15T12-52-13-346Z.md');
    expect(html).toContain('Radiohead — No Surprises');
    expect([...html.matchAll(/data-e2e-video-id="([\w-]+)"/g)].map((match) => match[1])).toEqual([
      '6hUpJ94q0c8',
      'A-Tod1_tZdU',
      '4texipD7faM',
      'oAhO5eegMfY',
      '68nVcK58qO8',
      'AIOAlaACuv4',
      'kz9jhG963no',
      'z7xPjk1ldjg',
    ]);
    expect(html).not.toContain('href="https://www.youtube.com/watch');
    expect(html).not.toContain('OPEN YOUTUBE');
    expect(html).not.toContain('REPLAYED INSTANTLY');
    expect(html).toContain('VERIFIED FIXTURE');
    expect(script).toContain('VERIFIED RESULTS · NO PLAYBACK');
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
