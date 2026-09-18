import { isRecord, isThumbnail, isVideoId, videoIdFromUrl } from '../shared/track';
import { MAX_RECOMMENDATIONS, VIDEO_TYPES } from '../shared/recommendation';
import type { Candidate, Recommendation, VideoType } from '../shared/recommendation';
import { AiDiagnosticError } from './ai';

export interface YouTubeResult extends Candidate {
  videoId: string;
  videoUrl: string;
  videoType: VideoType | null;
}

export interface YouTubeParseDiagnostics {
  urlExtractionFailure: number;
  candidateMismatch: number;
  videoTypeExcluded: number;
  validationFailure: number;
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

function responseUrls(response: unknown): string[] {
  if (!isRecord(response)) return [];
  const urls: string[] = [];
  const collectAnnotations = (value: unknown) => {
    if (!Array.isArray(value)) return;
    for (const annotation of value) if (isRecord(annotation) && typeof annotation.url === 'string') urls.push(annotation.url);
  };
  if (Array.isArray(response.output)) {
    for (const item of response.output) {
      if (!isRecord(item)) continue;
      if (isRecord(item.action) && Array.isArray(item.action.sources)) {
        for (const source of item.action.sources) if (isRecord(source) && typeof source.url === 'string') urls.push(source.url);
      }
      if (!Array.isArray(item.content)) continue;
      for (const content of item.content) if (isRecord(content)) collectAnnotations(content.annotations);
    }
  }
  return urls;
}

function canonicalSourceVideo(value: string): { videoId: string; videoUrl: string } | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    let videoId: string | null = null;
    if (url.hostname === 'youtu.be') videoId = url.pathname.split('/')[1] ?? null;
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(url.hostname)) {
      if (url.pathname === '/watch') videoId = url.searchParams.get('v');
      else if (/^\/(?:live|embed)\/[A-Za-z0-9_-]{11}\/?$/u.test(url.pathname)) videoId = url.pathname.split('/')[2] ?? null;
    }
    if (!isVideoId(videoId)) return null;
    return { videoId, videoUrl: `https://www.youtube.com/watch?v=${videoId}` };
  } catch { return null; }
}

function isVideoType(value: string): value is VideoType {
  return (VIDEO_TYPES as readonly string[]).includes(value);
}

export function parseYouTubeResults(response: unknown, candidates: Candidate[], useSearchSources = false, diagnostics?: YouTubeParseDiagnostics): YouTubeResult[] {
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
    const video = canonicalSourceVideo(match[5]!);
    if (!candidate || normalize(candidate.artist) !== normalize(artist) || normalize(candidate.title) !== normalize(title)) {
      if (diagnostics) diagnostics.candidateMismatch += 1;
      continue;
    }
    if (!isVideoType(videoType)) {
      if (diagnostics) diagnostics.videoTypeExcluded += 1;
      continue;
    }
    if (!video) {
      if (diagnostics) diagnostics.urlExtractionFailure += 1;
      continue;
    }
    if (candidateIds.has(candidateId) || videoIds.has(video.videoId)) {
      if (diagnostics) diagnostics.validationFailure += 1;
      continue;
    }
    candidateIds.add(candidateId);
    videoIds.add(video.videoId);
    results.push({ ...candidate, ...video, videoType });
    if (results.length === MAX_RECOMMENDATIONS) break;
  }
  if (results.length > 0 || !useSearchSources || candidates.length !== 1) return results;
  const candidate = candidates[0]!;
  for (const value of responseUrls(response)) {
    const video = canonicalSourceVideo(value);
    if (!video || videoIds.has(video.videoId)) continue;
    videoIds.add(video.videoId);
    results.push({ ...candidate, ...video, videoType: null });
    if (results.length === 5) break;
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

function inferVideoType(title: string, channelTitle: string): VideoType {
  const value = `${title} ${channelTitle}`;
  if (/\blyrics?\b|lyric video|가사/iu.test(value)) return 'LYRIC';
  if (/visuali[sz]er|비주얼라이저/iu.test(value)) return 'VISUALIZER';
  if (/performance|stage|퍼포먼스|무대/iu.test(value)) return 'PERFORMANCE';
  if (/\blive\b|라이브/iu.test(value)) return 'LIVE';
  if (/official audio|\baudio\b|오디오/iu.test(value)) return 'AUDIO';
  if (/\btopic\b/iu.test(channelTitle)) return 'TOPIC';
  if (/official (?:music )?video|music video|\bmv\b|뮤직비디오/iu.test(value)) return 'MV';
  return 'OFFICIAL_OTHER';
}

export async function resolveRecommendations(candidates: Candidate[], sources: YouTubeResult[], request: typeof fetch, options: { acceptMetadataIdentity?: boolean } = {}): Promise<Recommendation[]> {
  const allowed = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
  let metadataFailures = 0;
  const resolved = await Promise.all(candidates.slice(0, MAX_RECOMMENDATIONS).map(async (candidate): Promise<Recommendation | null> => {
    const candidateSources = sources.filter((source) => source.candidateId === candidate.candidateId);
    for (const source of candidateSources) {
      const allowedCandidate = allowed.get(source.candidateId);
      if (!allowedCandidate || allowedCandidate.artist !== source.artist || allowedCandidate.title !== source.title) continue;
      const endpoint = new URL('https://www.youtube.com/oembed');
      endpoint.searchParams.set('url', source.videoUrl);
      endpoint.searchParams.set('format', 'json');
      try {
        const response = await request(endpoint, { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(8000) });
        if (!response.ok) { metadataFailures++; continue; }
        const data: unknown = await response.json();
        if (!isRecord(data) || typeof data.title !== 'string' || !data.title.trim() || data.title.length > 500 ||
          typeof data.author_name !== 'string' || !data.author_name.trim() || data.author_name.length > 200 || data.provider_name !== 'YouTube') { metadataFailures++; continue; }
        const videoTitle = data.title.trim();
        const channelTitle = data.author_name.trim();
        if (isExcludedRecording(videoTitle)) continue;
        const matchesCandidate = includesVariant(videoTitle, candidate.title) &&
          (includesVariant(videoTitle, candidate.artist) || includesVariant(channelTitle, candidate.artist));
        if (!matchesCandidate && !options.acceptMetadataIdentity) continue;
        return {
          ...candidate,
          ...(matchesCandidate ? {} : { artist: channelTitle, title: videoTitle }),
          videoId: source.videoId,
          videoUrl: source.videoUrl,
          videoType: source.videoType ?? inferVideoType(videoTitle, channelTitle),
          channelTitle,
          thumbnail: isThumbnail(data.thumbnail_url, source.videoId) ? data.thumbnail_url : `https://i.ytimg.com/vi/${source.videoId}/hqdefault.jpg`,
        };
      } catch { metadataFailures++; }
    }
    return null;
  }));
  const valid = resolved.filter((item): item is Recommendation => item !== null)
    .filter((item, index, items) => items.findIndex((candidate) => candidate.videoId === item.videoId) === index);
  if (valid.length === 0 && metadataFailures > 0) {
    throw new AiDiagnosticError('YOUTUBE_METADATA_FAILED', { stage: 'metadata', message: `${metadataFailures}개 YouTube 메타데이터를 확인하지 못했습니다.` });
  }
  return valid;
}
