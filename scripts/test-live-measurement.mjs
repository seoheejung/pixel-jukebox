import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { attach, connectBrowser, evaluate, until } from './cdp.mjs';

const fixture = {
  startedAt: 1000, updatedAt: 2000, currentStage: 'youtube-search', lastCompletedStage: 'selection',
  stageCounts: [
    { stage: 'discovery', inputCount: 0, outputCount: 24, dropCount: 0, attempts: 1 },
    { stage: 'selection', inputCount: 24, outputCount: 15, dropCount: 9, attempts: 1 },
    { stage: 'resolver', inputCount: 30, outputCount: 4, dropCount: 26, attempts: 2 },
    { stage: 'oembed', inputCount: 4, outputCount: 3, dropCount: 1, attempts: 1 },
  ],
  stageTimings: [{ stage: 'youtube-search', startedAt: 1200, elapsedMs: 800 }],
  requests: [{ kind: 'youtube-search', stage: 'youtube-search', model: 'gpt-4.1-mini', durationMs: 700, inputTokens: 10, cachedInputTokens: 0, outputTokens: 4, totalTokens: 14, webSearchCalls: 1, startedAt: 1200, completedAt: 1900, success: true, timeout: false }],
  activeRequest: { stage: 'youtube-search', kind: 'youtube-search-individual', attempt: 2, startedAt: 1950 },
  resolver: { targetCount: 30, processedCount: 7, successCount: 3, failedCount: 4, supplementalSearches: 2, currentCandidateIndex: 7 },
};

async function readLiveMeasurement(browser, panel) {
  try {
    const value = await evaluate(browser, panel, 'window.__pixelJukeboxLiveMeasurement ?? null');
    return value ? { status: 'value', value } : { status: 'live-measurement-not-initialized' };
  } catch (error) {
    return { status: 'query-failed', error: error instanceof Error ? error.message : String(error) };
  }
}

const browser = await connectBrowser();
try {
  const { targetInfos } = await browser.send('Target.getTargets');
  let worker = targetInfos.find((item) => item.type === 'service_worker' && /\/background\.js$/u.test(item.url));
  if (!worker) {
    const loaded = await browser.send('Extensions.loadUnpacked', { path: resolve('dist') });
    worker = await until(async () => {
      const { targetInfos: current } = await browser.send('Target.getTargets');
      return current.find((item) => item.type === 'service_worker' && item.url === `chrome-extension://${loaded.id}/background.js`);
    }, 'Pixel Jukebox service worker');
  }
  assert.ok(worker, 'Pixel Jukebox service worker is required');
  const extensionId = new URL(worker.url).hostname;
  const { targetId } = await browser.send('Target.createTarget', { url: `chrome-extension://${extensionId}/sidepanel.html` });
  const panel = await attach(browser, targetId);
  try {
    await until(() => evaluate(browser, panel, "document.readyState === 'complete' && Boolean(document.querySelector('#ai-picks'))"), 'Pixel Jukebox panel');
    await evaluate(browser, panel, 'globalThis.__pixelJukeboxE2E = true; globalThis.__pixelJukeboxLiveMeasurement = undefined;');
    assert.deepEqual(await readLiveMeasurement(browser, panel), { status: 'live-measurement-not-initialized' });
    await evaluate(browser, panel, `globalThis.__pixelJukeboxLiveMeasurement = ${JSON.stringify(fixture)};`);
    const result = await readLiveMeasurement(browser, panel);
    assert.equal(result.status, 'value');
    assert.deepEqual(result.value, fixture);
    console.log('PASS: live measurement fixture reached and was read from the same Sidepanel target');
  } finally {
    await browser.send('Target.closeTarget', { targetId });
  }
} finally {
  browser.close();
}
