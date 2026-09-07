import { isRecord, isTrack } from './track';
import type { Track } from './track';

export type PlaylistTrack = Omit<Track, 'playbackState'>;

export function playlistTrack(track: Track): PlaylistTrack {
  return { videoId: track.videoId, videoTitle: track.videoTitle, channelTitle: track.channelTitle, thumbnail: track.thumbnail, videoUrl: track.videoUrl };
}

export function isPlaylist(value: unknown): value is PlaylistTrack[] {
  return Array.isArray(value) && value.every((track) => isRecord(track) && isTrack({ ...track, playbackState: 'paused' })) &&
    new Set(value.map((track: PlaylistTrack) => track.videoId)).size === value.length;
}

export function addTrack(playlist: PlaylistTrack[], track: PlaylistTrack): PlaylistTrack[] {
  return playlist.some((item) => item.videoId === track.videoId) ? playlist : [...playlist, track];
}

export function removeTrack(playlist: PlaylistTrack[], videoId: string): PlaylistTrack[] {
  return playlist.filter((track) => track.videoId !== videoId);
}

export function moveTrack(playlist: PlaylistTrack[], videoId: string, beforeId: string | null): PlaylistTrack[] {
  const track = playlist.find((item) => item.videoId === videoId);
  if (!track || beforeId === videoId) return playlist;
  const rest = removeTrack(playlist, videoId);
  const index = beforeId === null ? rest.length : rest.findIndex((item) => item.videoId === beforeId);
  if (index < 0) throw new Error('PLAYLIST_CHANGED');
  return [...rest.slice(0, index), track, ...rest.slice(index)];
}

export function adjacentTrack(playlist: PlaylistTrack[], currentId: string, direction: 1 | -1): PlaylistTrack | null {
  if (playlist.length === 0) return null;
  const index = playlist.findIndex((track) => track.videoId === currentId);
  if (index < 0) return playlist[direction === 1 ? 0 : playlist.length - 1]!;
  return playlist[(index + direction + playlist.length) % playlist.length]!;
}
