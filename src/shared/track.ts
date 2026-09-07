export type PlaybackState = 'playing' | 'paused' | 'buffering' | 'ended' | 'error';

export interface Track {
  videoId: string;
  videoTitle: string;
  channelTitle: string;
  thumbnail: string;
  videoUrl: string;
  playbackState: PlaybackState;
}

export interface PlayerSnapshot {
  track: Track | null;
  previous: boolean;
  next: boolean;
  error: boolean;
}

export type PlayerAction = 'previous' | 'toggle' | 'next';

export const emptySnapshot = (): PlayerSnapshot => ({ track: null, previous: false, next: false, error: false });

export function trackFromVideoId(videoId: string, metadata: Partial<Pick<Track, 'videoTitle' | 'channelTitle' | 'thumbnail'>> = {}): Track {
  return {
    videoId,
    videoTitle: metadata.videoTitle?.trim() || `YouTube video ${videoId}`,
    channelTitle: metadata.channelTitle?.trim() || 'YouTube',
    thumbnail: metadata.thumbnail && isThumbnail(metadata.thumbnail, videoId) ? metadata.thumbnail : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
    playbackState: 'paused',
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isVideoId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{11}$/.test(value);
}

export function videoIdFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.origin === 'https://www.youtube.com' && url.pathname === '/watch') {
      const id = url.searchParams.get('v');
      return isVideoId(id) ? id : null;
    }
    if (url.origin === 'https://www.youtube.com' && url.pathname.startsWith('/shorts/')) {
      const id = url.pathname.split('/')[2] ?? null;
      return isVideoId(id) ? id : null;
    }
    if (url.origin === 'https://youtu.be') {
      const id = url.pathname.slice(1).split('/')[0] ?? null;
      return isVideoId(id) ? id : null;
    }
    return null;
  } catch { return null; }
}

export function isThumbnail(value: unknown, videoId: string): value is string {
  if (value === '') return true;
  if (typeof value !== 'string' || value.length > 1000) return false;
  try {
    const url = new URL(value);
    return url.origin === 'https://i.ytimg.com' && url.pathname.split('/').includes(videoId);
  } catch { return false; }
}

export function isTrack(value: unknown): value is Track {
  return isRecord(value) && isVideoId(value.videoId) &&
    typeof value.videoTitle === 'string' && value.videoTitle.trim().length > 0 && value.videoTitle.length <= 500 &&
    typeof value.channelTitle === 'string' && value.channelTitle.length <= 200 &&
    isThumbnail(value.thumbnail, value.videoId) &&
    value.videoUrl === `https://www.youtube.com/watch?v=${value.videoId}` &&
    typeof value.playbackState === 'string' && ['playing', 'paused', 'buffering', 'ended', 'error'].includes(value.playbackState);
}

export function isPlayerSnapshot(value: unknown): value is PlayerSnapshot {
  return isRecord(value) && (value.track === null || isTrack(value.track)) &&
    typeof value.previous === 'boolean' && typeof value.next === 'boolean' && typeof value.error === 'boolean';
}
