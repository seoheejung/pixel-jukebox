import { createConnections } from './connections';
import { createCoreStore } from './core-store';
import { createAiService } from './ai';
import { createRecommendationService } from './recommendation';
import { OPENAI_ORIGIN } from '../shared/ai';

const store = createCoreStore({
  get: (keys) => chrome.storage.local.get(keys),
  set: (values) => chrome.storage.local.set(values),
});
const ai = createAiService({
  session: {
    get: (keys) => chrome.storage.session.get(keys),
    set: (values) => chrome.storage.session.set(values),
    remove: (keys) => chrome.storage.session.remove(keys),
    setAccessLevel: (details) => chrome.storage.session.setAccessLevel(details),
  },
  local: {
    get: (keys) => chrome.storage.local.get(keys),
    set: (values) => chrome.storage.local.set(values),
    remove: (keys) => chrome.storage.local.remove(keys),
    setAccessLevel: (details) => chrome.storage.local.setAccessLevel(details),
  },
  containsPermission: () => chrome.permissions.contains({ origins: [OPENAI_ORIGIN] }),
  requestPermission: () => chrome.permissions.request({ origins: [OPENAI_ORIGIN] }),
  request: (input, init) => fetch(input, init),
});
void ai.initialize();
const connections = createConnections(chrome.runtime.getURL('sidepanel.html'), {
  store,
  ai,
  recommendations: createRecommendationService(ai),
});
chrome.runtime.onConnect.addListener(connections);

chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId === undefined) return;
  void chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {
    // Side Panel 열기 실패 표시
    void chrome.action.setBadgeText({ text: '!' });
    void chrome.action.setTitle({ title: 'Side Panel을 열지 못했습니다. 다시 클릭하세요.' });
  });
});
