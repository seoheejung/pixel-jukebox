import { isRecord } from './track';
import type { PlaylistTrack } from './playlist';
import type { Track } from './track';

export const MAX_CANDIDATES = 10;
export const MAX_RECOMMENDATIONS = 5;

export interface Candidate {
  candidateId: string;
  artist: string;
  title: string;
}

export interface Recommendation {
  candidateId: string;
  artist: string;
  title: string;
  reason: string;
  tags: string[];
}

function normalize(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

function isKorean(value: string): boolean { return /[가-힣]/u.test(value); }

export function parseDiscovery(text: string, excluded: Array<{ artist: string; title: string }> = []): Candidate[] {
  const blocked = new Set(excluded.map((item) => `${normalize(item.artist)}\u0000${normalize(item.title)}`));
  const ids = new Set<string>();
  const tracks = new Set<string>();
  const candidates: Candidate[] = [];
  for (const line of text.split(/\r?\n/u)) {
    const match = /^CANDIDATE\|(C\d{2})\|([^|\r\n]+)\|([^|\r\n]+)$/u.exec(line.trim());
    if (!match) continue;
    const candidateId = match[1]!.trim();
    const artist = match[2]!.trim();
    const title = match[3]!.trim();
    const trackKey = `${normalize(artist)}\u0000${normalize(title)}`;
    if (!artist || !title || ids.has(candidateId) || tracks.has(trackKey) || blocked.has(trackKey)) continue;
    ids.add(candidateId);
    tracks.add(trackKey);
    candidates.push({ candidateId, artist, title });
    if (candidates.length === MAX_CANDIDATES) break;
  }
  return candidates;
}

export function excludedTracks(current: Track | null, playlist: PlaylistTrack[], recent: Recommendation[]): Array<{ artist: string; title: string }> {
  return [
    ...(current ? [{ artist: current.channelTitle, title: current.videoTitle }] : []),
    ...playlist.map((track) => ({ artist: track.channelTitle, title: track.videoTitle })),
    ...recent.map((item) => ({ artist: item.artist, title: item.title })),
  ];
}

export function parseSelection(value: unknown, candidates: Candidate[]): Recommendation[] | null {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { return null; }
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.recommendations) || parsed.recommendations.length > MAX_RECOMMENDATIONS) return null;
  const allowed = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
  const selected = new Set<string>();
  const recommendations: Recommendation[] = [];
  for (const item of parsed.recommendations) {
    if (!isRecord(item) || typeof item.candidateId !== 'string' || typeof item.reason !== 'string' || !isKorean(item.reason) ||
      !Array.isArray(item.tags) || item.tags.length < 1 || item.tags.length > 3 || item.tags.some((tag) => typeof tag !== 'string' || tag.trim().length === 0 || tag.length > 40)) return null;
    const candidate = allowed.get(item.candidateId);
    if (!candidate || selected.has(item.candidateId)) return null;
    selected.add(item.candidateId);
    recommendations.push({ candidateId: candidate.candidateId, artist: candidate.artist, title: candidate.title, reason: item.reason.trim(), tags: item.tags.map((tag) => tag.trim()) });
  }
  return recommendations;
}

export function youtubeSearchUrl(recommendation: Recommendation): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${recommendation.artist} ${recommendation.title}`)}`;
}
