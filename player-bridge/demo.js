(() => {
  'use strict';

  const storageKey = 'pixel-jukebox-web-demo-completed-v1';
  const referenceStorageKey = 'pixel-jukebox-web-demo-reference-v1';
  const fixtures = [
    {
      id: 'radiohead', artist: 'Radiohead', title: 'No Surprises',
      recommendations: [
        { artist: 'Radiohead', title: 'Let Down', type: 'MV', videoId: '6hUpJ94q0c8' },
        { artist: 'The National', title: 'I Need My Girl', type: 'MV', videoId: 'A-Tod1_tZdU' },
        { artist: 'James Blake', title: 'Retrograde', type: 'MV', videoId: '4texipD7faM' },
        { artist: 'Ólafur Arnalds', title: 're:member', type: 'MV', videoId: 'oAhO5eegMfY' },
        { artist: 'Iron & Wine', title: 'Flightless Bird, American Mouth', type: 'PERFORMANCE', videoId: '68nVcK58qO8' },
        { artist: 'Tracy Chapman', title: 'Fast Car', type: 'MV', videoId: 'AIOAlaACuv4' },
        { artist: 'Mac DeMarco', title: 'Chamber of Reflection', type: 'MV', videoId: 'kz9jhG963no' },
        { artist: 'Fleet Foxes', title: 'Tiger Mountain Peasant Song', type: 'MV', videoId: 'z7xPjk1ldjg' },
      ],
    },
    {
      id: 'newjeans', artist: 'NewJeans', title: 'Ditto',
      recommendations: [
        { artist: 'NewJeans', title: 'ASAP', type: 'MV', videoId: 'dJdqn5v4Dkw' },
        { artist: 'NewJeans', title: 'Hype Boy', type: 'MV', videoId: '11cta61wi0g' },
        { artist: 'Loona', title: 'PTT (Paint The Town)', type: 'MV', videoId: 'pze6vPP0xNo' },
        { artist: 'Sunmi', title: 'Tail', type: 'MV', videoId: '6_vDL6_aVm8' },
        { artist: 'aespa', title: 'Next Level', type: 'MV', videoId: 'IMpXNQ-MLT4' },
      ],
    },
    {
      id: 'tyler', artist: 'Tyler, The Creator', title: 'SEE YOU AGAIN',
      recommendations: [
        { artist: 'Kali Uchis', title: 'I Wish You Roses', type: 'MV', videoId: '-Y7zc0eO26k' },
        { artist: 'Tyler, The Creator', title: "I Ain't Got Time!", type: 'AUDIO', videoId: 'drfS9adBK8o' },
        { artist: 'Lil Uzi Vert', title: '20 Min', type: 'LYRIC', videoId: 'CTV-sZ4r1t0' },
      ],
    },
  ];

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

  function savedReference(storage) {
    try {
      const id = storage.getItem(referenceStorageKey);
      return fixtures.some((fixture) => fixture.id === id) ? id : fixtures[0].id;
    } catch {
      return fixtures[0].id;
    }
  }

  function rememberReference(storage, id) {
    if (!fixtures.some((fixture) => fixture.id === id)) return false;
    try {
      storage.setItem(referenceStorageKey, id);
      return true;
    } catch {
      return false;
    }
  }

  window.PixelJukeboxDemo = Object.freeze({ storageKey, referenceStorageKey, hasCompleted, claimDemo, savedReference, rememberReference });

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
  const screenTitle = document.querySelector('#screen-title');
  const screenState = document.querySelector('#screen-state');
  const demoFooter = document.querySelector('#demo-footer');
  const progressMessage = document.querySelector('#progress-message');
  const sessionMessage = document.querySelector('#session-message');
  const resultCount = document.querySelector('#result-count');
  const resultList = document.querySelector('#result-list');
  const referenceCopy = document.querySelector('#demo-reference-copy');
  const resultCopy = document.querySelector('#demo-result-copy');

  const controls = [demoButton, backButton, selectButton, startButton, dpadUp, dpadRight, dpadDown, dpadLeft];
  const panels = [homePanel, readyPanel, curatingPanel, resultsPanel];
  const copies = [screenTitle, screenState, demoFooter, progressMessage, sessionMessage, resultCount, resultList, referenceCopy, resultCopy];
  if (!controls.every((control) => control instanceof HTMLButtonElement) || !panels.every((panel) => panel instanceof HTMLElement) || !copies.every((copy) => copy instanceof HTMLElement)) return;

  const menuItems = [...document.querySelectorAll('.demo-menu button')];
  const referenceButtons = [...document.querySelectorAll('.reference-options button')];
  if (!menuItems.every((item) => item instanceof HTMLButtonElement) || !referenceButtons.every((item) => item instanceof HTMLButtonElement) || referenceButtons.length !== fixtures.length) return;

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
  let referenceIndex = Math.max(0, fixtures.findIndex((fixture) => fixture.id === savedReference(window.sessionStorage)));

  function selectedFixture() {
    return fixtures[referenceIndex];
  }

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

  function updateReferenceSelection(next = referenceIndex, persist = true) {
    if ((running || resultsReady) && next !== referenceIndex) return;
    referenceIndex = (next + fixtures.length) % fixtures.length;
    const fixture = selectedFixture();
    for (const [index, button] of referenceButtons.entries()) {
      button.classList.toggle('is-selected', index === referenceIndex);
      button.setAttribute('aria-selected', String(index === referenceIndex));
      button.tabIndex = index === referenceIndex ? 0 : -1;
      button.disabled = running || resultsReady;
    }
    referenceCopy.textContent = `${fixture.artist} — ${fixture.title}`;
    resultCopy.textContent = `${fixture.recommendations.length} verified recommendations`;
    if (persist) rememberReference(window.sessionStorage, fixture.id);
  }

  function resultRows() {
    return [...resultList.querySelectorAll('.result-row')];
  }

  function updateResultSelection(next = resultIndex) {
    const rows = resultRows();
    if (!rows.length) return;
    resultIndex = (next + rows.length) % rows.length;
    for (const [index, row] of rows.entries()) row.classList.toggle('is-selected', index === resultIndex);
    rows[resultIndex].scrollIntoView({ block: 'nearest' });
  }

  function renderFixtureResults() {
    const fixture = selectedFixture();
    resultCount.textContent = `${fixture.recommendations.length} TRACKS VERIFIED`;
    resultIndex = 0;
    resultList.replaceChildren(...fixture.recommendations.map((recommendation, index) => {
      const row = document.createElement('li');
      row.className = 'result-row';
      row.dataset.e2eVideoId = recommendation.videoId;
      const order = document.createElement('span');
      order.textContent = String(index + 1).padStart(2, '0');
      const track = document.createElement('span');
      const title = document.createElement('strong');
      title.textContent = recommendation.title;
      const artist = document.createElement('small');
      artist.textContent = recommendation.artist;
      track.append(title, artist);
      const type = document.createElement('i');
      type.textContent = recommendation.type;
      row.append(order, track, type);
      row.addEventListener('click', () => {
        updateResultSelection(index);
        sessionMessage.textContent = 'Web Demo 결과는 표시 전용입니다. YouTube 재생이나 외부 이동은 발생하지 않습니다.';
      });
      return row;
    }));
    updateResultSelection();
  }

  function renderHome(remember = true) {
    showPanel(homePanel, remember);
    setScreen('PIXEL JUKEBOX', 'HOME', 'D-PAD MOVE · A SELECT · B BACK');
    demoButton.disabled = false;
    updateMenuSelection();
  }

  function renderReady(remember = true) {
    showPanel(readyPanel, remember);
    updateReferenceSelection(referenceIndex, false);
    if (running) setScreen('KEEP THIS VIBE', 'CURATING', 'CURATING · SELECT HOME');
    else if (resultsReady) setScreen('KEEP THIS VIBE', 'COMPLETE', 'A VIEW RESULTS · SELECT HOME');
    else setScreen('KEEP THIS VIBE', 'READY', '↑↓ CHOOSE · A KEEP THIS VIBE');
    demoButton.disabled = running;
  }

  function renderResults(restored, remember = true) {
    resultsReady = true;
    updateReferenceSelection(referenceIndex, false);
    renderFixtureResults();
    showPanel(resultsPanel, remember);
    setScreen('KEEP THIS VIBE', 'COMPLETE', 'VERIFIED RESULTS · NO PLAYBACK');
    demoButton.disabled = false;
    sessionMessage.textContent = restored
      ? '이 탭 세션에서는 이미 1회 실행했습니다. 선택한 기준곡의 검증 결과만 다시 확인할 수 있습니다.'
      : '큐레이션 완료. 이 탭 세션에서는 선택한 기준곡의 검증 결과만 다시 확인할 수 있습니다.';
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
    rememberReference(window.sessionStorage, selectedFixture().id);
    running = true;
    updateReferenceSelection(referenceIndex, false);
    demoButton.disabled = true;
    setScreen('KEEP THIS VIBE', 'CURATING', 'CURATING · PLEASE WAIT');
    sessionMessage.textContent = `${selectedFixture().artist} — ${selectedFixture().title} 기준의 검증된 E2E 흐름을 재현하고 있습니다.`;
    showPanel(curatingPanel);
    runProgress(0);
  }

  function activateMenuItem() {
    const target = menuItems[menuIndex].dataset.demoTarget;
    if (target === 'reference') renderReady();
    else startDemo();
  }

  function primaryAction() {
    if (currentPanel === homePanel) activateMenuItem();
    else if (currentPanel === readyPanel) startDemo();
    else if (currentPanel === resultsPanel) {
      sessionMessage.textContent = 'Web Demo 결과는 표시 전용입니다. YouTube 재생이나 외부 이동은 발생하지 않습니다.';
    }
  }

  function renderKnownPanel(panel) {
    if (panel === resultsPanel && resultsReady) renderResults(true, false);
    else if (panel === homePanel) renderHome(false);
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
    else if (currentPanel === readyPanel) updateReferenceSelection(referenceIndex + delta);
    else if (currentPanel === resultsPanel) updateResultSelection(resultIndex + delta);
  }

  demoButton.addEventListener('click', primaryAction);
  backButton.addEventListener('click', goBack);
  selectButton.addEventListener('click', () => renderHome());
  dpadUp.addEventListener('click', () => moveSelection(-1));
  dpadDown.addEventListener('click', () => moveSelection(1));
  dpadLeft.addEventListener('click', goBack);
  dpadRight.addEventListener('click', primaryAction);
  for (const [index, item] of menuItems.entries()) item.addEventListener('click', () => {
    updateMenuSelection(index);
    activateMenuItem();
  });
  for (const [index, button] of referenceButtons.entries()) button.addEventListener('click', () => updateReferenceSelection(index));

  updateMenuSelection();
  updateReferenceSelection(referenceIndex, false);
  if (resultsReady) renderResults(true, false);
  else renderReady(false);
})();
