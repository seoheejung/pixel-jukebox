import { describe, expect, it, vi } from 'vitest';
import { createConnections } from '../src/background/connections';
import { isConnectionStatus, MESSAGE, PORT } from '../src/shared/messages';

function fakePort(name: string, sender: chrome.runtime.MessageSender) {
  const messages: Array<(message: unknown) => void> = [];
  const disconnects: Array<() => void> = [];
  const postMessage = vi.fn();
  const disconnect = vi.fn();
  const port = {
    name, sender, postMessage, disconnect,
    onMessage: { addListener: (listener: (message: unknown) => void) => messages.push(listener) },
    onDisconnect: { addListener: (listener: () => void) => disconnects.push(listener) },
  } as unknown as chrome.runtime.Port;
  return {
    port, postMessage, disconnect,
    receive: (message: unknown) => messages.forEach((listener) => listener(message)),
    close: () => disconnects.forEach((listener) => listener()),
  };
}

const panelUrl = 'chrome-extension://test/sidepanel.html';
const youtubeSender = (id: number): chrome.runtime.MessageSender => ({
  url: 'https://www.youtube.com/watch?v=example', frameId: 0,
  tab: { id } as chrome.tabs.Tab,
});

describe('Phase 0 connection routing (Chrome API mocks)', () => {
  it('relays content readiness to the panel and routes a panel probe back to content', () => {
    const connect = createConnections(panelUrl);
    const content = fakePort(PORT.content, youtubeSender(10));
    const panel = fakePort(PORT.panel, { url: panelUrl });
    connect(content.port);
    connect(panel.port);
    expect(panel.postMessage).toHaveBeenLastCalledWith({ type: MESSAGE.status, connectedTabs: 0 });
    content.receive({ type: MESSAGE.ready });
    expect(content.postMessage).toHaveBeenLastCalledWith({ type: MESSAGE.ack });
    expect(panel.postMessage).toHaveBeenLastCalledWith({ type: MESSAGE.status, connectedTabs: 1 });
    panel.receive({ type: MESSAGE.probe });
    expect(content.postMessage).toHaveBeenLastCalledWith({ type: MESSAGE.probe });
    content.close();
    expect(panel.postMessage).toHaveBeenLastCalledWith({ type: MESSAGE.status, connectedTabs: 0 });
  });

  it('does not remove a replacement connection when the old document disconnects', () => {
    const connect = createConnections(panelUrl);
    const panel = fakePort(PORT.panel, { url: panelUrl });
    const old = fakePort(PORT.content, youtubeSender(1));
    const replacement = fakePort(PORT.content, youtubeSender(1));
    const other = fakePort(PORT.content, youtubeSender(2));
    [panel, old, replacement, other].forEach(({ port }) => connect(port));
    [old, replacement, other].forEach((port) => port.receive({ type: MESSAGE.ready }));
    old.close();
    expect(panel.postMessage).toHaveBeenLastCalledWith({ type: MESSAGE.status, connectedTabs: 2 });
    replacement.close();
    expect(panel.postMessage).toHaveBeenLastCalledWith({ type: MESSAGE.status, connectedTabs: 1 });
  });

  it.each([
    [PORT.content, { ...youtubeSender(1), url: 'https://www.youtube.com.attacker.test/' }],
    [PORT.content, { ...youtubeSender(1), frameId: 1 }],
    [PORT.content, { url: 'https://www.youtube.com/' }],
    [PORT.panel, youtubeSender(1)],
    ['unknown', { url: panelUrl }],
  ])('rejects an unauthorized port %s', (name, sender) => {
    const rejected = fakePort(name, sender);
    createConnections(panelUrl)(rejected.port);
    expect(rejected.disconnect).toHaveBeenCalledOnce();
  });

  it('ignores malformed payloads and isolates a closed panel', () => {
    const connect = createConnections(panelUrl);
    const content = fakePort(PORT.content, youtubeSender(1));
    const panel = fakePort(PORT.panel, { url: panelUrl });
    connect(content.port);
    connect(panel.port);
    content.receive(null);
    content.receive({ type: 1 });
    expect(content.postMessage).not.toHaveBeenCalled();
    panel.postMessage.mockImplementation(() => { throw new Error('Port closed'); });
    expect(() => content.receive({ type: MESSAGE.ready })).not.toThrow();
    expect(content.postMessage).toHaveBeenLastCalledWith({ type: MESSAGE.ack });
  });
});

describe('status payload boundary', () => {
  it.each([null, {}, { type: MESSAGE.status, connectedTabs: -1 }, { type: MESSAGE.status, connectedTabs: '1' }, { type: MESSAGE.status, connectedTabs: 0.5 }])('rejects invalid payload %j', (value) => {
    expect(isConnectionStatus(value)).toBe(false);
  });
  it('accepts a bounded connection count', () => {
    expect(isConnectionStatus({ type: MESSAGE.status, connectedTabs: 2 })).toBe(true);
  });
});

describe('Phase 1 tab player routing', () => {
  const snapshot = (videoId: string) => ({
    track: { videoId, videoTitle: 'Track', channelTitle: 'Channel', thumbnail: '', videoUrl: `https://www.youtube.com/watch?v=${videoId}`, playbackState: 'paused' },
    previous: false, next: true, error: false,
  });

  it('keeps two tracks separate and sends controls only to the selected tab', () => {
    const connect = createConnections(panelUrl);
    const first = fakePort(PORT.content, youtubeSender(1));
    const second = fakePort(PORT.content, youtubeSender(2));
    const panel = fakePort(PORT.panel, { url: panelUrl });
    [first, second, panel].forEach(({ port }) => connect(port));
    [first, second].forEach((port) => port.receive({ type: MESSAGE.ready }));
    first.receive({ type: MESSAGE.track, snapshot: snapshot('dQw4w9WgXcQ'), tabId: 2 });
    second.receive({ type: MESSAGE.track, snapshot: snapshot('4Ygvv_Ae3dg') });
    expect(panel.postMessage).toHaveBeenCalledWith({ type: MESSAGE.playerState, tabs: [
      { tabId: 1, active: false, snapshot: snapshot('dQw4w9WgXcQ') },
      { tabId: 2, active: false, snapshot: snapshot('4Ygvv_Ae3dg') },
    ] });
    first.postMessage.mockClear();
    second.postMessage.mockClear();
    const command = { type: MESSAGE.control, tabId: 2, videoId: '4Ygvv_Ae3dg', action: 'toggle' };
    panel.receive(command);
    expect(second.postMessage).toHaveBeenCalledExactlyOnceWith(command);
    expect(first.postMessage).not.toHaveBeenCalled();
    panel.receive({ ...command, videoId: 'dQw4w9WgXcQ' });
    expect(second.postMessage).toHaveBeenCalledTimes(1);
    first.receive(command);
    expect(second.postMessage).toHaveBeenCalledTimes(1);
  });
});
