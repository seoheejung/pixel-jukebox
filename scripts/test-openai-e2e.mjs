import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { attach, connectBrowser, evaluate, until } from './cdp.mjs';

const panelPort = 'pixel-jukebox:panel';
const outputDirectory = resolve('docs/results');
const extensionRoot = resolve('dist');
const setupTimeoutMs = 15 * 60 * 1000;
const runTimeoutMs = 15 * 60 * 1000;
const pricing = {
  asOf: '2026-09-15',
  source: 'https://developers.openai.com/api/docs/pricing',
  model: 'gpt-5.6-luna',
  inputPerMillion: 0.20,
  cachedInputPerMillion: 0.02,
  outputPerMillion: 1.20,
  webSearchPerCall: 0.01,
  searchContentTokensPerCall: 8000,
};
const seeds = [
  { videoId: 'u5CVsCnxyXg', videoTitle: 'Radiohead - No Surprises', channelTitle: 'Radiohead' },
  { videoId: 'pSUydWEqKwE', videoTitle: "NewJeans (뉴진스) 'Ditto' Official MV (side A)", channelTitle: 'HYBE LABELS' },
  { videoId: 'TGgcC5xg9YI', videoTitle: 'SEE YOU AGAIN featuring Kali Uchis', channelTitle: 'Tyler, The Creator' },
].map((track) => ({
  ...track,
  thumbnail: `https://i.ytimg.com/vi/${track.videoId}/hqdefault.jpg`,
  videoUrl: `https://www.youtube.com/watch?v=${track.videoId}`,
}));
const requestedSeed = process.argv.find((argument) => argument.startsWith('--seed='))?.slice('--seed='.length);
const runSeeds = requestedSeed ? seeds.filter((seed) => seed.videoId === requestedSeed || seed.channelTitle.toLowerCase().includes(requestedSeed.toLowerCase())) : seeds;
if (runSeeds.length === 0) throw new Error(`알 수 없는 seed: ${requestedSeed}`);

function sleep(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

function markdown(value) {
  return String(value).replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function normalize(value) {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

function requestCost(request) {
  if (!request.model.startsWith(pricing.model)) return null;
  const cached = Math.min(request.inputTokens, request.cachedInputTokens);
  const uncached = request.inputTokens - cached;
  const tokenCost = (uncached * pricing.inputPerMillion + cached * pricing.cachedInputPerMillion + request.outputTokens * pricing.outputPerMillion) / 1_000_000;
  const webSearchCost = request.webSearchCalls * pricing.webSearchPerCall;
  const searchContentCost = request.webSearchCalls * pricing.searchContentTokensPerCall * pricing.inputPerMillion / 1_000_000;
  return { tokenCost, webSearchCost, searchContentCost, total: tokenCost + webSearchCost + searchContentCost };
}

function summarize(result) {
  const artists = new Map();
  for (const item of result.recommendations) {
    const key = normalize(item.artist);
    artists.set(key, (artists.get(key) ?? 0) + 1);
  }
  const videoIds = result.recommendations.map((item) => item.videoId);
  const requestCosts = result.measurement.requests.map(requestCost);
  const estimatedCost = requestCosts.every(Boolean) ? requestCosts.reduce((sum, cost) => sum + cost.total, 0) : null;
  return {
    uniqueArtists: artists.size,
    maximumArtistRepeats: Math.max(0, ...artists.values()),
    duplicateVideoIds: videoIds.length - new Set(videoIds).size,
    sourceRepeated: videoIds.includes(result.seed.videoId),
    estimatedCost,
    requestCosts,
  };
}

function resultReport(result) {
  const summary = summarize(result);
  const measurement = result.measurement;
  const requestRows = measurement.requests.map((request, index) => {
    const cost = summary.requestCosts[index];
    return `| ${request.kind} | ${markdown(request.model)} | ${request.durationMs} | ${request.inputTokens} | ${request.cachedInputTokens} | ${request.outputTokens} | ${request.webSearchCalls} | ${cost ? cost.total.toFixed(6) : 'N/A'} |`;
  }).join('\n');
  const stageRows = measurement.stageCounts.map((stage) =>
    `| ${stage.stage} | ${stage.inputCount} | ${stage.outputCount} | ${stage.dropCount} | ${stage.attempts} |`,
  ).join('\n');
  const typeCounts = Object.entries(result.recommendations.reduce((counts, item) => ({ ...counts, [item.videoType]: (counts[item.videoType] ?? 0) + 1 }), {}))
    .map(([type, count]) => `${type} ${count}`).join(', ') || '없음';
  const recommendationRows = result.recommendations.map((item, index) =>
    `| ${index + 1} | ${markdown(item.artist)} | ${markdown(item.title)} | ${item.videoType} | [YouTube](${item.videoUrl}) | ☐ | ☐ |`,
  ).join('\n');
  const primaryCount = Math.min(10, measurement.candidateCount);
  const backupCount = Math.max(0, measurement.candidateCount - primaryCount);
  const requestCount = measurement.requests.length;
  const selectionRequests = measurement.requests.filter((request) => request.stage === 'selection').length;
  const retryRequests = measurement.requests.filter((request) => /retry|individual|reserve/u.test(request.kind)).length;
  const oneShotPass = requestCount === 1 && selectionRequests === 0 && retryRequests === 0;
  return `## ${markdown(result.seed.channelTitle)} — ${markdown(result.seed.videoTitle)}

- 실행 결과: ${result.recommendations.length > 0 ? 'PASS' : 'FAIL'}
- 전체 응답시간: ${(measurement.totalDurationMs / 1000).toFixed(2)}초
- Responses API 요청: ${requestCount} (${oneShotPass ? '1회·재시도 없음' : '구조 기준 미달'})
- Web Search tool 호출: ${measurement.requests.reduce((sum, request) => sum + request.webSearchCalls, 0)}
- TRACK 반환: ${measurement.candidateCount} (Primary ${primaryCount} · Backup ${backupCount})
- 실제 YouTube source 연결: ${measurement.youtubeSourceCount}
- URL/videoId + oEmbed 통과: ${measurement.recommendationCount}
- Selection 요청: ${selectionRequests} · 추가 검색/Retry 요청: ${retryRequests}
- Artist: ${summary.uniqueArtists}명 · 한 Artist 최대 ${summary.maximumArtistRepeats}곡
- 중복 videoId: ${summary.duplicateVideoIds} · 기준곡 재추천: ${summary.sourceRepeated ? '있음' : '없음'}
- 영상 유형: ${typeCounts}
- Usage 기반 예상 비용: ${summary.estimatedCost === null ? 'N/A' : `$${summary.estimatedCost.toFixed(6)}`}

### 단계별 Usage

| 요청 | 모델 | 시간(ms) | 입력 | 캐시 입력 | 출력 | Web Search | 예상 비용(USD) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
${requestRows}

### 단계별 Drop Count

| 단계 | 입력 | 출력 | Drop | 시도 횟수 |
| --- | ---: | ---: | ---: | ---: |
${stageRows}

### Resolver 원인별 탈락

| 원인 | 횟수 |
| --- | ---: |
${Object.entries(measurement.resolverDiagnostics).map(([reason, count]) => `| ${reason} | ${count} |`).join('\n')}

### 추천 품질 확인

흐름은 기준곡 다음 재생 시 연결감, 정확성은 Artist·곡·영상 일치 여부를 실제 청취 후 체크한다.

| # | Artist | Track | 영상 | 링크 | 흐름 | 정확성 |
| ---: | --- | --- | --- | --- | --- | --- |
${recommendationRows}
`;
}

function fullReport(results, startedAt) {
  const totalCost = results.map((result) => summarize(result).estimatedCost);
  const allPriced = totalCost.every((cost) => cost !== null);
  return `# 실제 OpenAI E2E · 추천 품질 · Usage/비용 측정

- 측정 시작: ${startedAt}
- 측정 종료: ${new Date().toISOString()}
- 실행 경계: 실제 Chrome Extension → Service Worker → OpenAI Responses API → YouTube oEmbed
- 기준곡 수: ${results.length}
- 예상 총비용: ${allPriced ? `$${totalCost.reduce((sum, cost) => sum + cost, 0).toFixed(6)}` : 'N/A'}

## 비용 산식

- 가격 기준일: ${pricing.asOf}
- 모델: ${pricing.model} 입력 $${pricing.inputPerMillion}/1M, 캐시 입력 $${pricing.cachedInputPerMillion}/1M, 출력 $${pricing.outputPerMillion}/1M tokens
- Web Search: $${pricing.webSearchPerCall.toFixed(2)}/call
- Search content: Web Search 1회당 ${pricing.searchContentTokensPerCall.toLocaleString('en-US')} input-token block
- 공식 가격표: ${pricing.source}
- 계산값은 Responses Usage와 응답의 web_search_call 수를 이용한 추정치다. 계정 청구서 확정 금액과 차이가 날 수 있다.

${results.map(resultReport).join('\n')}

## 종합 판정

- [ ] 서로 다른 기준곡에서 흐름 품질 확인
- [ ] Artist·곡·YouTube 영상 정확성 청취 확인
- [ ] 최종 제출 Regression 완료
`;
}

async function findExtension(browser) {
  const { targetInfos } = await browser.send('Target.getTargets');
  for (const target of targetInfos.filter((item) => item.type === 'service_worker' && /\/background\.js$/u.test(item.url))) {
    const session = await attach(browser, target.targetId);
    const name = await evaluate(browser, session, 'chrome.runtime.getManifest().name').catch(() => '');
    if (name === 'Pixel Jukebox') return { id: new URL(target.url).hostname, worker: session };
  }
  const loaded = await browser.send('Extensions.loadUnpacked', { path: extensionRoot });
  const target = await until(async () => {
    const { targetInfos: current } = await browser.send('Target.getTargets');
    return current.find((item) => item.type === 'service_worker' && item.url === `chrome-extension://${loaded.id}/background.js`);
  }, 'Pixel Jukebox service worker');
  return { id: loaded.id, worker: await attach(browser, target.targetId) };
}

async function waitForValue(check, label, timeoutMs = 30000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const value = await check();
    if (value) return value;
    await sleep(250);
  }
  throw new Error(`Timed out: ${label}`);
}

function liveCost(measurement) {
  return measurement.requests.map(requestCost).filter(Boolean).reduce((sum, cost) => sum + cost.total, 0);
}

async function reportLiveTimeout(browser, panel, seed, runStartedAt, error) {
  let live;
  try { live = await evaluate(browser, panel, 'window.__pixelJukeboxLiveMeasurement ?? null'); }
  catch (queryError) {
    console.error(JSON.stringify({ diagnostic: 'e2e-timeout', reason: 'query-failed', seed: seed.videoTitle, elapsedMs: Date.now() - runStartedAt, error: error.message, queryError: queryError instanceof Error ? queryError.message : String(queryError) }, null, 2));
    return;
  }
  if (!live) { console.error(JSON.stringify({ diagnostic: 'e2e-timeout', reason: 'live-measurement-not-initialized', seed: seed.videoTitle, elapsedMs: Date.now() - runStartedAt, error: error.message }, null, 2)); return; }
  const failed = live.requests.filter((request) => request.success === false);
  const timedOut = live.requests.filter((request) => request.timeout === true);
  const usage = live.requests.reduce((total, request) => ({ input: total.input + request.inputTokens, cachedInput: total.cachedInput + request.cachedInputTokens, output: total.output + request.outputTokens, webSearch: total.webSearch + request.webSearchCalls }), { input: 0, cachedInput: 0, output: 0, webSearch: 0 });
  console.error(JSON.stringify({ diagnostic: 'e2e-timeout', seed: seed.videoTitle, elapsedMs: Date.now() - runStartedAt, error: error.message, currentStage: live.currentStage, lastCompletedStage: live.lastCompletedStage, stageCounts: live.stageCounts, stageTimings: live.stageTimings, completedRequestCount: live.requests.length, failedRequestCount: failed.length, timeoutRequestCount: timedOut.length, activeRequest: live.activeRequest ?? null, resolver: live.resolver, webSearchCalls: usage.webSearch, inputTokens: usage.input, cachedInputTokens: usage.cachedInput, outputTokens: usage.output, estimatedCost: liveCost(live), slowestCompletedRequestMs: Math.max(0, ...live.requests.map((request) => request.durationMs)) }, null, 2));
}

async function addAndSelectSeed(browser, panel, seed) {
  await evaluate(browser, panel, `(() => {
    document.querySelector('[data-open="playlist"]').click();
    const input = document.querySelector('#video-url');
    input.value = ${JSON.stringify(seed.videoUrl)};
    document.querySelector('#add-video').click();
  })()`);
  await waitForValue(() => evaluate(browser, panel, `Boolean(document.querySelector('#playlist-list [data-video-id="${seed.videoId}"]'))`), `Playlist add ${seed.videoTitle}`, 60000);
  await evaluate(browser, panel, `(() => {
    for (const row of document.querySelectorAll('#playlist-list .playlist-row')) {
      if (row.dataset.videoId !== ${JSON.stringify(seed.videoId)}) row.querySelector('.playlist-remove')?.click();
    }
  })()`);
  await waitForValue(() => evaluate(browser, panel, `document.querySelectorAll('#playlist-list .playlist-row').length === 1 && Boolean(document.querySelector('#playlist-list [data-video-id="${seed.videoId}"]'))`), `Playlist isolate ${seed.videoTitle}`, 30000);
  await evaluate(browser, panel, `(() => {
    document.querySelector('[data-open="ai-picks"]').click();
    document.querySelector('#similar-vibes-source-trigger').click();
    document.querySelector('#similar-vibes-source-list [data-video-id="${seed.videoId}"]')?.click();
    window.__pixelJukeboxMeasurement = undefined;
    window.__pixelJukeboxRecommendations = undefined;
    document.querySelector('#ai-picks').click();
  })()`, { userGesture: true });
}

const browser = await connectBrowser().catch((error) => {
  throw new Error(`테스트 Chrome에 연결할 수 없습니다. 먼저 npm run chrome:start -- --headed 를 실행하세요. ${error.message}`);
});
let panel;
try {
  const extension = await findExtension(browser);
  const panelUrl = `chrome-extension://${extension.id}/sidepanel.html`;
  const { targetId } = await browser.send('Target.createTarget', { url: panelUrl });
  panel = await attach(browser, targetId);
  await browser.send('Page.enable', {}, panel);
  await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'globalThis.__pixelJukeboxE2E = true;' }, panel);
  await browser.send('Page.reload', {}, panel);
  await until(() => evaluate(browser, panel, "document.readyState === 'complete' && Boolean(document.querySelector('#ai-picks'))"), 'Pixel Jukebox panel');
  await evaluate(browser, panel, 'globalThis.__pixelJukeboxE2E = true; globalThis.__pixelJukeboxLiveMeasurement = undefined; globalThis.__pixelJukeboxMeasurement = undefined; globalThis.__pixelJukeboxRecommendations = undefined;');
  let configured = await evaluate(browser, panel, "document.querySelector('#openai-state')?.textContent === 'connected'");
  if (!configured) {
    await browser.send('Target.activateTarget', { targetId });
    await evaluate(browser, panel, `(() => {
      document.querySelector('[data-open="ai-picks"]').click();
      document.querySelector('#similar-vibes-key').focus();
    })()`);
    console.log('WAITING: 열린 Pixel Jukebox 창에서 OpenAI API Key를 입력하고 CONNECT를 누르세요. Key는 Extension session storage 안에서만 처리됩니다.');
    const end = Date.now() + setupTimeoutMs;
    while (Date.now() < end && !configured) {
      await sleep(1000);
      configured = await evaluate(browser, panel, "document.querySelector('#openai-state')?.textContent === 'connected'");
    }
    assert.equal(configured, true, 'OpenAI API Key setup timed out');
  }

  const startedAt = new Date().toISOString();
  const results = [];
  for (const seed of runSeeds) {
    await addAndSelectSeed(browser, panel, seed);
    const runStartedAt = Date.now();
    let terminal;
    try {
      terminal = await waitForValue(() => evaluate(browser, panel, `(() => {
      if (window.__pixelJukeboxMeasurement && window.__pixelJukeboxRecommendations) return { recommendations: window.__pixelJukeboxRecommendations, measurement: window.__pixelJukeboxMeasurement };
      const message = document.querySelector('#ai-picks-message')?.textContent;
      return message ? { error: message } : null;
    })()`), `recommendations for ${seed.videoTitle}`, runTimeoutMs);
    } catch (error) {
      await reportLiveTimeout(browser, panel, seed, runStartedAt, error);
      throw error;
    }
    if (terminal.measurement?.cacheHit) {
      await evaluate(browser, panel, "window.__pixelJukeboxMeasurement = undefined; window.__pixelJukeboxRecommendations = undefined; document.querySelector('#ai-picks').click()", { userGesture: true });
      terminal = await waitForValue(() => evaluate(browser, panel, `(() => {
        if (window.__pixelJukeboxMeasurement && window.__pixelJukeboxRecommendations) return { recommendations: window.__pixelJukeboxRecommendations, measurement: window.__pixelJukeboxMeasurement };
        const message = document.querySelector('#ai-picks-message')?.textContent;
        return message ? { error: message } : null;
      })()`), `refreshed recommendations for ${seed.videoTitle}`, runTimeoutMs);
    }
    if (terminal.error) throw new Error(`추천 실패 ${seed.videoTitle}: ${terminal.error}`);
    assert.ok(terminal.measurement && terminal.measurement.cacheHit === false, '실제 OpenAI Usage 측정값이 없습니다');
    results.push({ seed, recommendations: terminal.recommendations, measurement: terminal.measurement, wallDurationMs: Date.now() - runStartedAt });
    console.log(`PASS: ${seed.channelTitle} — ${seed.videoTitle}, ${terminal.recommendations.length} tracks, ${(terminal.measurement.totalDurationMs / 1000).toFixed(2)}s`);
  }
  await mkdir(outputDirectory, { recursive: true });
  const reportPath = resolve(outputDirectory, `openai-e2e-${timestamp()}.md`);
  await writeFile(reportPath, fullReport(results, startedAt), 'utf8');
  console.log(`PASS: 실제 OpenAI E2E 보고서 ${reportPath}`);
} finally {
  browser.close();
}
