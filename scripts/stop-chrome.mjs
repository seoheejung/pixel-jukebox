import { connectBrowser } from './cdp.mjs';

const browser = await connectBrowser();
try {
  await browser.send('Browser.close');
  console.log('Closed the test browser on port 9223');
} finally {
  browser.close();
}
