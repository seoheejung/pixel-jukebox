import { isRecord, isThumbnail, videoIdFromUrl } from '../shared/track';
import { MAX_RECOMMENDATIONS, VIDEO_TYPES } from '../shared/recommendation';
import type { Candidate, Recommendation, VideoType } from '../shared/recommendation';
import { AiDiagnosticError } from './ai';

export interface YouTubeResult extends Candidate {
  videoId: string;
  videoUrl: string;
  videoType: VideoType;
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

function responseText(response: unknown): string {
  if (!isRecord(response)) return '';
  const chunks: string[] = [];
  if (typeof response.output_text === 'string') chunks.push(response.output_text);
  if (Array.isArray(response.output)) {
    for (const item of response.output) {
      if (!isRecord(item) || !Array.isArray(item.content)) continue;
      for (const content of item.content) if (isRecord(content) && typeof content.text === 'string') chunks.push(content.text);
    }
  }
  return chunks.join('\n');
}

function canonicalVideo(value: string): { videoId: string; videoUrl: string } | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !['youtube.com', 'www.youtube.com'].includes(url.hostname) || url.pathname !== '/watch') return null;
    const videoId = videoIdFromUrl(url.toString());
    if (!videoId || url.searchParams.get('v') !== videoId) return null;
    return { videoId, videoUrl: `https://www.youtube.com/watch?v=${videoId}` };
  } catch { return null; }
}

function isVideoType(value: string): value is VideoType {
  return (VIDEO_TYPES as readonly string[]).includes(value);
}

export function parseYouTubeResults(response: unknown, candidates: Candidate[]): YouTubeResult[] {
  const allowed = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
  const candidateIds = new Set<string>();
  const videoIds = new Set<string>();
  const results: YouTubeResult[] = [];
  for (const line of responseText(response).split(/\r?\n/u)) {
    const match = /^YOUTUBE\s*\|\s*(C\d{1,2})\s*\|\s*([A-Z_]+)\s*\|\s*([^|\r\n]+?)\s*\|\s*([^|\r\n]+?)\s*\|\s*(https:\/\/[^|\s]+)\s*$/u.exec(line.trim());
    if (!match) continue;
    const candidateId = `C${match[1]!.slice(1).padStart(2, '0')}`;
    const videoType = match[2]!;
    const artist = match[3]!.trim();
    const title = match[4]!.trim();
    const candidate = allowed.get(candidateId);
    const video = canonicalVideo(match[5]!);
    if (!candidate || !isVideoType(videoType) || !video || candidateIds.has(candidateId) || videoIds.has(video.videoId)) continue;
    if (normalize(candidate.artist) !== normalize(artist) || normalize(candidate.title) !== normalize(title)) continue;
    candidateIds.add(candidateId);
    videoIds.add(video.videoId);
    results.push({ ...candidate, ...video, videoType });
    if (results.length === MAX_RECOMMENDATIONS) break;
  }
  return results;
}

const METADATA_QUALIFIERS = new Set([
  'audio', 'officialaudio', 'officialvideo', 'officialmusicvideo', 'lyrics', 'lyricvideo',
  'live', 'liveclip', 'musicvideo', 'mv', 'performance', 'performancevideo', 'stage', 'topic', 'visualizer',
]);

function variants(value: string): string[] {
  const pieces = [value, ...value.split(/[()[\]{}|/]/u)]
    .map(normalize).filter((item) => item.length > 0 && !METADATA_QUALIFIERS.has(item));
  return [...new Set(pieces)];
}

function includesVariant(value: string, expected: string): boolean {
  const normalized = normalize(value);
  const tokens = value.normalize('NFKC').toLowerCase().split(/[^\p{L}\p{N}]+/gu).map(normalize).filter(Boolean);
  return variants(expected).some((variant) => variant.length >= 3 ? normalized.includes(variant) : tokens.includes(variant));
}

function isExcludedRecording(value: string): boolean {
  return /\[[^\]]*\breacts?\b[^\]]*\]|\b(?:reaction(?:\s+video)?|reacts?\s+to|commentary|covers?|karaoke|instrumental(?:\s+cover)?|sped[ -]?up|slowed|nightcore|mashup|compilation|playlist|shorts?)\b|리액션|커버|노래방/iu.test(value);
}

export async function resolveRecommendations(candidates: Candidate[], sources: YouTubeResult[], request: typeof fetch): Promise<Recommendation[]> {
  const allowed = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
  let metadataFailures = 0;
  const resolved = await Promise.all(sources.slice(0, MAX_RECOMMENDATIONS).map(async (source): Promise<Recommendation | null> => {
    const candidate = allowed.get(source.candidateId);
    if (!candidate || candidate.artist !== source.artist || candidate.title !== source.title) return null;
    const endpoint = new URL('https://www.youtube.com/oembed');
    endpoint.searchParams.set('url', source.videoUrl);
    endpoint.searchParams.set('format', 'json');
    try {
      const response = await request(endpoint, { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(8000) });
      if (!response.ok) { metadataFailures++; return null; }
      const data: unknown = await response.json();
      if (!isRecord(data) || typeof data.title !== 'string' || !data.title.trim() || data.title.length > 500 ||
        typeof data.author_name !== 'string' || !data.author_name.trim() || data.author_name.length > 200 || data.provider_name !== 'YouTube') { metadataFailures++; return null; }
      const videoTitle = data.title.trim();
      const channelTitle = data.author_name.trim();
      if (isExcludedRecording(videoTitle) || !includesVariant(videoTitle, candidate.title) ||
        (!includesVariant(videoTitle, candidate.artist) && !includesVariant(channelTitle, candidate.artist))) return null;
      return {
        ...candidate,
        videoId: source.videoId,
        videoUrl: source.videoUrl,
        videoType: source.videoType,
        channelTitle,
        thumbnail: isThumbnail(data.thumbnail_url, source.videoId) ? data.thumbnail_url : `https://i.ytimg.com/vi/${source.videoId}/hqdefault.jpg`,
      };
    } catch { metadataFailures++; return null; }
  }));
  if (resolved.every((item) => item === null) && metadataFailures > 0) {
    throw new AiDiagnosticError('YOUTUBE_METADATA_FAILED', { stage: 'metadata', message: `${metadataFailures}개 YouTube 메타데이터를 확인하지 못했습니다.` });
  }
  return resolved.filter((item): item is Recommendation => item !== null);
}
