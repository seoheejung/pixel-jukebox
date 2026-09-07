import { createConnections } from './connections';
import { createCoreStore } from './core-store';

const store = createCoreStore({
  get: (keys) => chrome.storage.local.get(keys),
  set: (values) => chrome.storage.local.set(values),
});
const connections = createConnections(chrome.runtime.getURL('sidepanel.html'), {
  store,
  async navigate(tabId, videoId) {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    if (tabId === null) await chrome.tabs.create({ url });
    else await chrome.tabs.update(tabId, { url });
  },
});
chrome.runtime.onConnect.addListener(connections);
chrome.tabs.onRemoved.addListener(connections.removeTab);

chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId === undefined) return;
  void chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {
    // Side Panel 열기 실패 표시
    void chrome.action.setBadgeText({ text: '!' });
    void chrome.action.setTitle({ title: 'Side Panel을 열지 못했습니다. 다시 클릭하세요.' });
  });
});
