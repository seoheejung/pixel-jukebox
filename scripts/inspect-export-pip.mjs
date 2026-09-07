import { writeFileSync } from 'node:fs';
import { attach, connectBrowser, evaluate } from './cdp.mjs';

const browser = await connectBrowser();
try {
  const target = (await browser.send('Target.getTargets')).targetInfos.find((item) => item.url.endsWith('/sidepanel.html'));
  const panel = await attach(browser, target.targetId);
  const image = await evaluate(browser, panel, `new Promise(resolve => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      canvas.getContext('2d').drawImage(image, 0, 0, 64, 64);
      try { resolve({loaded: true, canvasExport: canvas.toDataURL('image/png').startsWith('data:image/png')}); }
      catch (error) { resolve({loaded: true, canvasExport: false, errorName: error.name}); }
    };
    image.onerror = () => resolve({loaded: false, canvasExport: false});
    image.src = 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg';
  })`);
  const pip = await evaluate(browser, panel, `(async () => {
    if (!('documentPictureInPicture' in window)) return {supported: false};
    try { const pip = await documentPictureInPicture.requestWindow({width: 320, height: 420}); pip.close(); return {supported: true, opened: true}; }
    catch (error) { return {supported: true, opened: false, errorName: error.name, message: error.message}; }
  })()`, { userGesture: true });
  console.log(JSON.stringify({ browser: browser.version, image, pip }, null, 2));
  writeFileSync('.chrome-test/phase2-capabilities.json', JSON.stringify({ browser: browser.version, image, pip }, null, 2));
} finally { browser.close(); }
