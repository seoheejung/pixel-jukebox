import { createConnections } from './connections';

chrome.runtime.onConnect.addListener(createConnections(chrome.runtime.getURL('sidepanel.html')));

chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId === undefined) return;
  void chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {
    // Side Panel 열기 실패 표시
    void chrome.action.setBadgeText({ text: '!' });
    void chrome.action.setTitle({ title: 'Side Panel을 열지 못했습니다. 다시 클릭하세요.' });
  });
});
