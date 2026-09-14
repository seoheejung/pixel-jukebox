import { isRecord, isThumbnail, isVideoId, trackFromVideoId } from './track';
import type { PlaylistTrack } from './playlist';
import type { Track } from './track';

export const TARGET_CANDIDATES = 24;
export const MAX_CANDIDATES = 30;
export const MIN_RECOMMENDATIONS = 12;
export const MAX_RECOMMENDATIONS = 20;

export const VIDEO_TYPES = ['MV', 'PERFORMANCE', 'LIVE', 'LYRIC', 'VISUALIZER', 'AUDIO', 'TOPIC', 'OFFICIAL_OTHER'] as const;
export type VideoType = typeof VIDEO_TYPES[number];

export interface Candidate {
  candidateId: string;
  artist: string;
  title: string;
}

export interface ResolvedRecommendation extends Candidate {
  channelTitle: string;
  thumbnail: string;
  videoId: string;
  videoUrl: string;
  videoType: VideoType;
}

export type Recommendation = ResolvedRecommendation;

function normalize(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

export function parseDiscovery(text: string, excluded: Array<{ artist: string; title: string }> = []): Candidate[] {
  const blocked = new Set(excluded.map((item) => `${normalize(item.artist)}\u0000${normalize(item.title)}`));
  const ids = new Set<string>();
  const tracks = new Set<string>();
  const candidates: Candidate[] = [];
  for (const line of text.split(/\r?\n/u)) {
    const match = /^CANDIDATE\s*\|\s*(C\d{1,2})\s*\|\s*([^|\r\n]+?)\s*\|\s*([^|\r\n]+?)\s*$/iu.exec(line.trim());
    if (!match) continue;
    const candidateId = `C${match[1]!.slice(1).padStart(2, '0')}`;
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

export function parseSelection(value: unknown, candidates: Candidate[], onInvalid?: (reason: string) => void): Candidate[] | null {
  const invalid = (reason: string) => { onInvalid?.(reason); return null; };
  let parsed: unknown = value;
  if (typeof value === 'string') {
    if (!value.trim()) return invalid('선곡 응답에 텍스트가 없습니다.');
    try { parsed = JSON.parse(value); } catch { return invalid('선곡 응답이 올바른 JSON이 아닙니다.'); }
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.recommendations) || Object.keys(parsed).length !== 1) return invalid('선곡 응답의 recommendations 형식이 올바르지 않습니다.');
  if (parsed.recommendations.length < Math.min(MIN_RECOMMENDATIONS, candidates.length)) return invalid('선곡 응답이 필요한 추천 개수보다 적습니다.');
  if (parsed.recommendations.length > MAX_RECOMMENDATIONS) return invalid('선곡 응답이 최대 추천 개수를 초과했습니다.');
  const allowed = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
  const selected = new Set<string>();
  const recommendations: Candidate[] = [];
  for (const item of parsed.recommendations) {
    if (!isRecord(item) || typeof item.candidateId !== 'string' || Object.keys(item).length !== 1) return invalid('선곡 항목은 candidateId만 포함해야 합니다.');
    const candidate = allowed.get(item.candidateId);
    if (!candidate) return invalid('선곡 응답에 후보 목록에 없는 ID가 있습니다.');
    if (selected.has(item.candidateId)) return invalid('선곡 응답에 중복된 후보 ID가 있습니다.');
    selected.add(item.candidateId);
    recommendations.push({ ...candidate });
  }
  return recommendations;
}

export function recommendationTrack(recommendation: Recommendation) {
  if (!isVideoId(recommendation.videoId)) return null;
  const metadata: { videoTitle: string; channelTitle: string; thumbnail?: string } = {
    videoTitle: recommendation.title,
    channelTitle: recommendation.channelTitle || recommendation.artist,
  };
  if (isThumbnail(recommendation.thumbnail, recommendation.videoId)) metadata.thumbnail = recommendation.thumbnail;
  return trackFromVideoId(recommendation.videoId, metadata);
}
