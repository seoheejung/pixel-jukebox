import { describe, expect, it, vi } from 'vitest';
import { controlYouTube, readYouTube, SELECTOR } from '../src/content/youtube';
import { isTrack, videoIdFromUrl } from '../src/shared/track';

const videoId = 'dQw4w9WgXcQ';
const href = `https://www.youtube.com/watch?v=${videoId}`;

function fixture() {
  const video = { paused: false, ended: false, error: null, readyState: 4, play: vi.fn().mockResolvedValue(undefined), pause: vi.fn() };
  const previous = { getAttribute: () => 'true', hasAttribute: () => false, click: vi.fn() };
  const next = { getAttribute: () => 'false', hasAttribute: () => false, click: vi.fn() };
  const metadata = {
    getAttribute: () => videoId,
    querySelector: (selector: string) => ({ textContent: selector === SELECTOR.title ? 'Track title' : 'Channel name' }),
  };
  const image = { getAttribute: () => `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg` };
  const elements: Record<string, unknown> = {
    [SELECTOR.video]: video, [SELECTOR.metadata]: metadata, [SELECTOR.previous]: previous, [SELECTOR.next]: next, [SELECTOR.image]: image,
  };
  const document = { querySelector: (selector: string) => elements[selector] ?? null } as unknown as Document;
  return { video, previous, next, metadata, image, document };
}

describe('YouTube metadata and media adapter', () => {
  it('collects the current video without treating channel as artist', () => {
    const { document } = fixture();
    const result = readYouTube(document, href);
    expect(result.track).toMatchObject({ videoId, videoTitle: 'Track title', channelTitle: 'Channel name', playbackState: 'playing' });
    expect(isTrack(result.track)).toBe(true);
    expect(result.previous).toBe(false);
    expect(result.next).toBe(true);
  });

  it('clears stale metadata while a SPA route is changing', () => {
    const { document } = fixture();
    expect(readYouTube(document, 'https://www.youtube.com/watch?v=4Ygvv_Ae3dg').track).toBeNull();
    expect(readYouTube(document, 'https://www.youtube.com/').track).toBeNull();
  });

  it('detects pause, end and buffering independently', () => {
    const { video, document } = fixture();
    video.paused = true;
    expect(readYouTube(document, href).track?.playbackState).toBe('paused');
    video.ended = true;
    expect(readYouTube(document, href).track?.playbackState).toBe('ended');
    video.ended = false;
    video.paused = false;
    video.readyState = 2;
    expect(readYouTube(document, href).track?.playbackState).toBe('buffering');
  });

  it('does not reuse the previous video artwork or an arbitrary remote image', () => {
    const { image, document } = fixture();
    image.getAttribute = () => 'https://i.ytimg.com/vi/4Ygvv_Ae3dg/maxresdefault.jpg';
    expect(readYouTube(document, href).track?.thumbnail).toBe('');
    image.getAttribute = () => 'https://unrelated.test/image.png';
    expect(readYouTube(document, href).track?.thumbnail).toBe('');
  });

  it('routes play and pause to the native media element', async () => {
    const { video, document } = fixture();
    await controlYouTube(document, href, videoId, 'toggle');
    expect(video.pause).toHaveBeenCalledOnce();
    video.paused = true;
    await controlYouTube(document, href, videoId, 'toggle');
    expect(video.play).toHaveBeenCalledOnce();
  });

  it('uses the native next control and rejects unavailable or stale commands', async () => {
    const { next, document } = fixture();
    await controlYouTube(document, href, videoId, 'next');
    expect(next.click).toHaveBeenCalledOnce();
    await expect(controlYouTube(document, href, videoId, 'previous')).rejects.toThrow('UNAVAILABLE_CONTROL');
    await expect(controlYouTube(document, href, '4Ygvv_Ae3dg', 'toggle')).rejects.toThrow('STALE_TRACK');
  });
});

describe('track input boundary', () => {
  it.each(['https://www.youtube.com.attacker.test/watch?v=dQw4w9WgXcQ', 'http://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=invalid', 'invalid'])('rejects noncanonical video URL %s', (value) => {
    expect(videoIdFromUrl(value)).toBeNull();
  });
  it('rejects an external video URL in a content payload', () => {
    const { document } = fixture();
    expect(isTrack({ ...readYouTube(document, href).track, videoUrl: 'javascript:alert(1)' })).toBe(false);
  });
});
