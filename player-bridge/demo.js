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
  const backButton = document.querySelector('#demo-back');
  const selectButton = document.querySelector('#demo-select');
  const startButton = document.querySelector('#demo-start');
  const dpadUp = document.querySelector('#dpad-up');
  const dpadRight = document.querySelector('#dpad-right');
  const dpadDown = document.querySelector('#dpad-down');
  const dpadLeft = document.querySelector('#dpad-left');
  const homePanel = document.querySelector('#home-panel');
  const readyPanel = document.querySelector('#ready-panel');
  const curatingPanel = document.querySelector('#curating-panel');
  const resultsPanel = document.querySelector('#results-panel');
  const settingsPanel = document.querySelector('#settings-panel');
  const screenTitle = document.querySelector('#screen-title');
  const screenState = document.querySelector('#screen-state');
  const demoFooter = document.querySelector('#demo-footer');
  const progressMessage = document.querySelector('#progress-message');
  const sessionMessage = document.querySelector('#session-message');

  const controls = [demoButton, backButton, selectButton, startButton, dpadUp, dpadRight, dpadDown, dpadLeft];
  const panels = [homePanel, readyPanel, curatingPanel, resultsPanel, settingsPanel];
  if (!controls.every((control) => control instanceof HTMLButtonElement) || !panels.every((panel) => panel instanceof HTMLElement) || !(screenTitle instanceof HTMLElement) || !(screenState instanceof HTMLElement) || !(demoFooter instanceof HTMLElement) || !(progressMessage instanceof HTMLElement) || !(sessionMessage instanceof HTMLElement)) return;

  const menuItems = [...document.querySelectorAll('.demo-menu button')];
  const resultRows = [...document.querySelectorAll('.result-row')];
  if (!menuItems.every((item) => item instanceof HTMLButtonElement) || !resultRows.every((row) => row instanceof HTMLElement)) return;

  const progress = [
    ['discovery', '분위기에 맞는 곡을 찾는 중…'],
    ['selection', '다음 재생 순서를 구성하는 중…'],
    ['youtube', '실제 YouTube 영상을 찾는 중…'],
    ['metadata', 'Artist와 곡 정보를 검증하는 중…'],
  ];
  let currentPanel = readyPanel;
  const panelHistory = [];
  let menuIndex = 1;
  let resultIndex = 0;
  let running = false;
  let resultsReady = hasCompleted(window.sessionStorage);

  function showPanel(panel, remember = true) {
    if (remember && panel !== currentPanel && panelHistory.at(-1) !== currentPanel) panelHistory.push(currentPanel);
    for (const item of panels) item.hidden = item !== panel;
    currentPanel = panel;
  }

  function setScreen(title, state, footer) {
    screenTitle.textContent = title;
    screenState.textContent = state;
    demoFooter.textContent = footer;
  }

  function updateMenuSelection(next = menuIndex) {
    menuIndex = (next + menuItems.length) % menuItems.length;
    for (const [index, item] of menuItems.entries()) {
      item.classList.toggle('is-selected', index === menuIndex);
      item.setAttribute('aria-selected', String(index === menuIndex));
    }
  }

  function updateResultSelection(next = resultIndex) {
    resultIndex = (next + resultRows.length) % resultRows.length;
    for (const [index, row] of resultRows.entries()) row.classList.toggle('is-selected', index === resultIndex);
    resultRows[resultIndex].scrollIntoView({ block: 'nearest' });
  }

  function renderHome(remember = true) {
    showPanel(homePanel, remember);
    setScreen('PIXEL JUKEBOX', 'HOME', 'D-PAD MOVE · A SELECT · B BACK');
    demoButton.disabled = false;
    updateMenuSelection();
  }

  function renderReady(remember = true) {
    showPanel(readyPanel, remember);
    if (running) setScreen('KEEP THIS VIBE', 'CURATING', 'CURATING · SELECT HOME · START SETTINGS');
    else if (resultsReady) setScreen('KEEP THIS VIBE', 'COMPLETE', 'A VIEW RESULTS · SELECT HOME');
    else setScreen('KEEP THIS VIBE', 'READY', 'A KEEP THIS VIBE · WEB DEMO');
    demoButton.disabled = running;
  }

  function renderSettings(remember = true) {
    showPanel(settingsPanel, remember);
    setScreen('SETTINGS', 'DEMO', 'SELECT HOME · B BACK');
    demoButton.disabled = false;
  }

  function renderResults(restored, remember = true) {
    resultsReady = true;
    showPanel(resultsPanel, remember);
    setScreen('KEEP THIS VIBE', 'COMPLETE', 'VERIFIED RESULTS · NO PLAYBACK');
    demoButton.disabled = false;
    updateResultSelection();
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
      window.setTimeout(() => {
        running = false;
        resultsReady = true;
        if (currentPanel === curatingPanel) renderResults(false, false);
        else {
          demoButton.disabled = false;
          if (currentPanel === readyPanel) renderReady(false);
          sessionMessage.textContent = '큐레이션이 완료되었습니다. A 버튼으로 검증 결과를 확인할 수 있습니다.';
        }
      }, 350);
      return;
    }
    setProgress(index);
    window.setTimeout(() => runProgress(index + 1), 650);
  }

  function startDemo() {
    if (running) return;
    if (resultsReady || !claimDemo(window.sessionStorage)) {
      renderResults(true);
      return;
    }
    running = true;
    demoButton.disabled = true;
    setScreen('KEEP THIS VIBE', 'CURATING', 'CURATING · PLEASE WAIT');
    sessionMessage.textContent = '검증된 E2E 진행 상태를 재현하고 있습니다. OpenAI 네트워크 요청은 발생하지 않습니다.';
    showPanel(curatingPanel);
    runProgress(0);
  }

  function activateMenuItem() {
    const target = menuItems[menuIndex].dataset.demoTarget;
    if (target === 'reference') renderReady();
    else if (target === 'settings') renderSettings();
    else startDemo();
  }

  function primaryAction() {
    if (currentPanel === homePanel) activateMenuItem();
    else if (currentPanel === readyPanel) startDemo();
    else if (currentPanel === resultsPanel) {
      sessionMessage.textContent = 'Web Demo 결과는 표시 전용입니다. YouTube 재생이나 외부 이동은 발생하지 않습니다.';
    } else if (currentPanel === settingsPanel) goBack();
  }

  function renderKnownPanel(panel) {
    if (panel === resultsPanel && resultsReady) renderResults(true, false);
    else if (panel === homePanel) renderHome(false);
    else if (panel === settingsPanel) renderSettings(false);
    else renderReady(false);
  }

  function goBack() {
    if (currentPanel === resultsPanel) {
      panelHistory.length = 0;
      renderReady(false);
      return;
    }
    const fallback = currentPanel === readyPanel ? homePanel : readyPanel;
    renderKnownPanel(panelHistory.pop() ?? fallback);
  }

  function moveSelection(delta) {
    if (currentPanel === homePanel) updateMenuSelection(menuIndex + delta);
    else if (currentPanel === resultsPanel) updateResultSelection(resultIndex + delta);
    else {
      renderHome();
      updateMenuSelection(menuIndex + delta);
    }
  }

  demoButton.addEventListener('click', primaryAction);
  backButton.addEventListener('click', goBack);
  selectButton.addEventListener('click', () => renderHome());
  startButton.addEventListener('click', () => renderSettings());
  dpadUp.addEventListener('click', () => moveSelection(-1));
  dpadDown.addEventListener('click', () => moveSelection(1));
  dpadLeft.addEventListener('click', goBack);
  dpadRight.addEventListener('click', primaryAction);
  for (const [index, item] of menuItems.entries()) item.addEventListener('click', () => {
    updateMenuSelection(index);
    activateMenuItem();
  });
  for (const [index, row] of resultRows.entries()) row.addEventListener('click', () => {
    updateResultSelection(index);
    sessionMessage.textContent = 'Web Demo 결과는 표시 전용입니다. YouTube 재생이나 외부 이동은 발생하지 않습니다.';
  });

  if (resultsReady) renderResults(true, false);
  else {
    updateMenuSelection();
    renderReady(false);
  }
})();
