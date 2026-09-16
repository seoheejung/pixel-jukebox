(() => {
  'use strict';

  const storageKey = 'pixel-jukebox-web-demo-completed-v1';

  function hasCompleted(storage) {
    try {
      return storage.getItem(storageKey) === 'true';
    } catch {
      return false;
    }
  }

  function claimDemo(storage) {
    if (hasCompleted(storage)) return false;
    try {
      storage.setItem(storageKey, 'true');
      return true;
    } catch {
      return false;
    }
  }

  window.PixelJukeboxDemo = Object.freeze({ storageKey, hasCompleted, claimDemo });

  const demoButton = document.querySelector('#demo-button');
  const readyPanel = document.querySelector('#ready-panel');
  const curatingPanel = document.querySelector('#curating-panel');
  const resultsPanel = document.querySelector('#results-panel');
  const screenState = document.querySelector('#screen-state');
  const demoFooter = document.querySelector('#demo-footer');
  const progressMessage = document.querySelector('#progress-message');
  const sessionMessage = document.querySelector('#session-message');

  if (!(demoButton instanceof HTMLButtonElement) || !(readyPanel instanceof HTMLElement) || !(curatingPanel instanceof HTMLElement) || !(resultsPanel instanceof HTMLElement) || !(screenState instanceof HTMLElement) || !(demoFooter instanceof HTMLElement) || !(progressMessage instanceof HTMLElement) || !(sessionMessage instanceof HTMLElement)) return;

  const progress = [
    ['discovery', '분위기에 맞는 곡을 찾는 중…'],
    ['selection', '다음 재생 순서를 구성하는 중…'],
    ['youtube', '실제 YouTube 영상을 찾는 중…'],
    ['metadata', 'Artist와 곡 정보를 검증하는 중…'],
  ];

  function showPanel(panel) {
    readyPanel.hidden = panel !== readyPanel;
    curatingPanel.hidden = panel !== curatingPanel;
    resultsPanel.hidden = panel !== resultsPanel;
  }

  function renderResults(restored) {
    showPanel(resultsPanel);
    screenState.textContent = 'COMPLETE';
    demoFooter.textContent = 'A OPEN YOUTUBE · VERIFIED RESULTS';
    demoButton.disabled = true;
    sessionMessage.textContent = restored
      ? '이 브라우저 세션에서는 이미 Demo를 실행했습니다. 새 세션에서 다시 체험할 수 있습니다.'
      : '큐레이션 완료. 같은 세션의 두 번째 실행은 제한되며, 새 세션에서 다시 체험할 수 있습니다.';
  }

  function setProgress(activeIndex) {
    for (const [index, item] of progress.entries()) {
      const row = document.querySelector(`[data-progress="${item[0]}"]`);
      if (!(row instanceof HTMLElement)) continue;
      row.classList.toggle('is-active', index === activeIndex);
      row.classList.toggle('is-done', index < activeIndex);
      const state = row.querySelector('i');
      if (state) state.textContent = index < activeIndex ? '' : index === activeIndex ? 'RUN' : 'WAIT';
    }
    progressMessage.textContent = progress[activeIndex][1];
  }

  function runProgress(index) {
    if (index >= progress.length) {
      for (const row of document.querySelectorAll('[data-progress]')) {
        row.classList.remove('is-active');
        row.classList.add('is-done');
      }
      window.setTimeout(() => renderResults(false), 350);
      return;
    }
    setProgress(index);
    window.setTimeout(() => runProgress(index + 1), 650);
  }

  demoButton.addEventListener('click', () => {
    if (!claimDemo(window.sessionStorage)) {
      renderResults(true);
      return;
    }
    demoButton.disabled = true;
    screenState.textContent = 'CURATING';
    demoFooter.textContent = 'CURATING · PLEASE WAIT';
    sessionMessage.textContent = '검증된 E2E 진행 상태를 재생하고 있습니다. OpenAI 네트워크 요청은 발생하지 않습니다.';
    showPanel(curatingPanel);
    runProgress(0);
  });

  if (hasCompleted(window.sessionStorage)) renderResults(true);
})();
