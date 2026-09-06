import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { endpoint, until } from './cdp.mjs';

const executable = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (!existsSync(executable)) throw new Error('Chrome executable is unavailable');
try {
  await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(500) });
  throw new Error('Port 9223 is already in use; use the existing test browser or close it first');
} catch (error) {
  if (error.message.includes('already in use')) throw error;
}
const profile = resolve('.chrome-test/profile');
mkdirSync(profile, { recursive: true });
const child = spawn(executable, [
  '--headless=new', '--remote-debugging-port=9223', '--enable-unsafe-extension-debugging',
  '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
  `--user-data-dir=${profile}`, 'about:blank',
], { detached: true, windowsHide: true, stdio: 'ignore' });
child.on('error', () => { process.exitCode = 1; });
const version = await until(async () => {
  try { return await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(500) }).then((response) => response.json()); }
  catch { return false; }
}, 'test Chrome debugging endpoint');
console.log(`Started isolated test browser: ${version.Browser}`);
// 검증 세션 종료 전 테스트 브라우저 프로세스 유지
await new Promise((resolve) => {
  let misses = 0;
  const timer = setInterval(async () => {
    try {
      await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(500) });
      misses = 0;
    } catch {
      if (++misses >= 3) { clearInterval(timer); resolve(); }
    }
  }, 1000);
});
