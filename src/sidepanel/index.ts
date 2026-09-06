import { isConnectionStatus, MESSAGE, PORT } from '../shared/messages';
import './style.css';

const status = document.querySelector<HTMLParagraphElement>('#connection-status')!;
const recheck = document.querySelector<HTMLButtonElement>('#recheck')!;
let currentPort: chrome.runtime.Port | undefined;

function connect() {
  try {
    const port = chrome.runtime.connect({ name: PORT.panel });
    currentPort = port;
    port.onMessage.addListener((message: unknown) => {
      if (!isConnectionStatus(message)) return;
      status.textContent = message.connectedTabs > 0
        ? `연결됨 · YouTube 탭 ${message.connectedTabs}개`
        : 'YouTube 연결 대기 중';
      recheck.disabled = false;
    });
    port.onDisconnect.addListener(() => {
      void chrome.runtime.lastError;
      currentPort = undefined;
      recheck.disabled = true;
      status.textContent = '연결 복구 중…';
      window.setTimeout(connect, 1000);
    });
    port.postMessage({ type: MESSAGE.probe });
  } catch {
    recheck.disabled = true;
    status.textContent = '확장 프로그램을 다시 로드한 후 패널을 열어주세요.';
  }
}

recheck.addEventListener('click', () => {
  try {
    currentPort?.postMessage({ type: MESSAGE.probe });
  } catch {
    status.textContent = '연결 복구 중…';
  }
});

connect();
