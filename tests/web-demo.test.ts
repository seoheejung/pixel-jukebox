import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const html = readFileSync('player-bridge/index.html', 'utf8');
const script = readFileSync('player-bridge/demo.js', 'utf8');
const readme = readFileSync('README.md', 'utf8');
const pagesWorkflow = readFileSync('.github/workflows/deploy-player-bridge.yml', 'utf8');
const connections = readFileSync('src/background/connections.ts', 'utf8');

function demoApi() {
  const window = {} as {
    PixelJukeboxDemo?: {
      storageKey: string;
      referenceStorageKey: string;
      hasCompleted(storage: Storage): boolean;
      claimDemo(storage: Storage): boolean;
      savedReference(storage: Storage): string;
      rememberReference(storage: Storage, id: string): boolean;
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
    expect(readme).toContain('동일 브라우저 탭 세션당 1회');
    expect(html).toContain('OpenAI API 호출이나 YouTube 재생은 발생하지 않으며');
    expect(readme).toContain('Service Worker가 OpenAI 연결을 즉시 검증한다');
    expect(connections).toContain('const connection = await core.ai.testConnection();');
    expect(readme).toContain('npm run test:web:demo');
    expect(readme).not.toContain('test\\:web\\:demo');
    expect(readme).not.toContain('check\\:bridge');
    expect(readme).toContain('"url": "https://seoheejung.github.io/pixel-jukebox/player.html"');
    expect(readme).toContain('[Pixel Jukebox Repository](https://github.com/seoheejung/pixel-jukebox)');
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
    expect(html).not.toContain('id="settings-panel"');
    expect(html).toContain('id="demo-start" type="button" aria-label="Settings는 전체 Extension에서 사용 가능" title="FULL EXTENSION ONLY" disabled');
    expect(html).toContain('class="speaker"');
    expect(html).not.toContain('class="screen-label"');
  });

  it('uses three documented E2E fixtures without YouTube navigation', () => {
    expect(html).toContain('openai-e2e-2026-09-15T12-52-13-346Z.md');
    expect([...html.matchAll(/data-reference-id="([\w-]+)"/g)].map((match) => match[1])).toEqual(['radiohead', 'newjeans', 'tyler']);
    expect([...script.matchAll(/videoId: '([\w-]+)'/g)].map((match) => match[1])).toEqual([
      '6hUpJ94q0c8',
      'A-Tod1_tZdU',
      '4texipD7faM',
      'oAhO5eegMfY',
      '68nVcK58qO8',
      'AIOAlaACuv4',
      'kz9jhG963no',
      'z7xPjk1ldjg',
      'dJdqn5v4Dkw',
      '11cta61wi0g',
      'pze6vPP0xNo',
      '6_vDL6_aVm8',
      'IMpXNQ-MLT4',
      '-Y7zc0eO26k',
      'drfS9adBK8o',
      'CTV-sZ4r1t0',
    ]);
    expect(html).not.toContain('href="https://www.youtube.com/watch');
    expect(html).not.toContain('OPEN YOUTUBE');
    expect(html).not.toContain('REPLAYED INSTANTLY');
    expect(html).not.toContain('72.47s');
    expect(html).not.toContain('VERIFIED FIXTURE');
    expect(html).toContain('E2E VERIFIED RESULT');
    expect(html).toContain('VERIFIED FLOW');
    expect(html).toContain('3 REFERENCE TRACKS');
    expect(html).toContain('기준곡 하나를 선택해 큐레이션 흐름을 체험할 수 있습니다. 탭 세션당 1회 실행됩니다.');
    expect(script).toContain('VERIFIED RESULTS · NO PLAYBACK');
    expect(script).toContain('다른 기준곡을 체험하려면 새 탭에서 Web Demo를 열어주세요.');
    expect(html).toContain('OpenAI API 호출이나 YouTube 재생은 발생하지 않으며');
    expect(readme).toContain('Radiohead — No Surprises: 8곡');
    expect(readme).toContain('NewJeans — Ditto: 5곡');
    expect(readme).toContain('Tyler, The Creator — SEE YOU AGAIN: 3곡');
    expect(readme).toContain('선택한 기준곡에 따라 8 / 5 / 3개의 검증 결과를 표시한다.');
  });

  it('allows one run per session and a new run in a new session', () => {
    const api = demoApi();
    const firstSession = sessionStorage();
    expect(api.hasCompleted(firstSession)).toBe(false);
    expect(api.claimDemo(firstSession)).toBe(true);
    expect(api.claimDemo(firstSession)).toBe(false);
    expect(api.hasCompleted(firstSession)).toBe(true);
    expect(api.claimDemo(sessionStorage())).toBe(true);
    const referenceSession = sessionStorage();
    expect(api.savedReference(referenceSession)).toBe('radiohead');
    expect(api.rememberReference(referenceSession, 'newjeans')).toBe(true);
    expect(api.savedReference(referenceSession)).toBe('newjeans');
    expect(api.rememberReference(referenceSession, 'unknown')).toBe(false);
  });
});
