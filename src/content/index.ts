import { hasType, isPlayerCommand, isRestart, MESSAGE, PORT } from '../shared/messages';
import { controlYouTube, observeYouTube, restartYouTube } from './youtube';

function connect() {
  try {
    if (!chrome.runtime.id) return;
    const port = chrome.runtime.connect({ name: PORT.content });
    port.postMessage({ type: MESSAGE.ready });
    const observer = observeYouTube(document, window, (snapshot) => {
      try { port.postMessage({ type: MESSAGE.track, snapshot }); }
      catch { /* 연결 종료 시 onDisconnect에서 Observer 정리 */ }
    });
    port.onMessage.addListener((message: unknown) => {
      if (hasType(message, MESSAGE.probe)) {
        port.postMessage({ type: MESSAGE.ready });
        observer.publish();
      } else if (isPlayerCommand(message)) {
        void controlYouTube(document, location.href, message.videoId, message.action)
          .then(observer.publish).catch(observer.error);
      } else if (isRestart(message)) {
        void restartYouTube(document, location.href, message.videoId).then(observer.publish).catch(observer.error);
      }
    });
    port.onDisconnect.addListener(() => {
      void chrome.runtime.lastError;
      observer.stop();
      window.setTimeout(connect, 1000);
    });
  } catch {
    // Extension 갱신 후 무효화된 Content Script
  }
}

connect();
