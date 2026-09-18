import { createConnections } from './connections';
import { createCoreStore } from './core-store';
import { createAiService } from './ai';
import { createRecommendationService } from './recommendation';
import { OPENAI_ORIGIN } from '../shared/ai';
import { registerAdSkip } from './ad-skip';
import { MESSAGE } from '../shared/messages';
import { focusStandalonePlayerWindow, openStandalonePlayerWindow } from './player-window';

registerAdSkip();

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
  const tabId = tab.id;
  if (tabId === undefined) return;
  if (standaloneWindowId !== undefined) {
    void focusStandalonePlayerWindow({ tabs: chrome.tabs, sidePanel: chrome.sidePanel, windows: chrome.windows }, standaloneWindowId);
    return;
  }
  void chrome.sidePanel.setOptions({ tabId, enabled: true, path: 'sidepanel.html' })
    .then(() => chrome.sidePanel.open({ tabId }))
    .catch(() => undefined);
});
let standaloneWindowId: number | undefined;
chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === standaloneWindowId) standaloneWindowId = undefined;
});
chrome.runtime.onMessage.addListener((message: unknown, sender, reply) => {
  if (!message || typeof message !== 'object' || (message as { type?: unknown }).type !== MESSAGE.openWindow || sender.id !== chrome.runtime.id) return false;
  try {
    const senderUrl = new URL(sender.url ?? '');
    const panelUrl = new URL(chrome.runtime.getURL('sidepanel.html'));
    if (senderUrl.origin !== panelUrl.origin || senderUrl.pathname !== panelUrl.pathname || senderUrl.search !== '') return false;
  } catch { return false; }
  if (standaloneWindowId !== undefined) {
    void focusStandalonePlayerWindow({ tabs: chrome.tabs, sidePanel: chrome.sidePanel, windows: chrome.windows }, standaloneWindowId)
      .then(() => reply({ ok: true }), () => reply({ ok: false }));
    return true;
  }
  void openStandalonePlayerWindow({ tabs: chrome.tabs, sidePanel: chrome.sidePanel, windows: chrome.windows }, chrome.runtime.getURL('sidepanel.html?window=1'))
    .then((windowId) => { standaloneWindowId = windowId; reply({ ok: true }); }, () => reply({ ok: false }));
  return true;
});
