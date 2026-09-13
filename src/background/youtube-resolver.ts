import { isRecord, isThumbnail, videoIdFromUrl } from '../shared/track';
import type { Recommendation } from '../shared/recommendation';
import { AiDiagnosticError } from './ai';

export function youtubeSourceIds(response: unknown): string[] {
  const ids = new Set<string>();
  const addUrl = (value: unknown) => {
    if (typeof value !== 'string') return;
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || url.port) return;
      const youtubeHosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']);
      let normalized = url.toString();
      if (youtubeHosts.has(url.hostname)) {
        const pathId = /^\/(?:embed|live)\/([A-Za-z0-9_-]{11})(?:\/|$)/u.exec(url.pathname)?.[1];
        url.hostname = 'www.youtube.com';
        if (pathId) { url.pathname = '/watch'; url.search = `?v=${pathId}`; url.hash = ''; }
        normalized = url.toString();
      } else if (url.hostname !== 'youtu.be') return;
      const id = videoIdFromUrl(normalized);
      if (id && ids.size < 15) ids.add(id);
    } catch { return; }
  };
  const addTextUrls = (value: unknown) => {
    if (typeof value !== 'string') return;
    for (const match of value.replace(/\\\//gu, '/').matchAll(/https:\/\/[^\s<>"'\][{}()]+/giu)) addUrl(match[0].replace(/[),.;]+$/u, ''));
  };
  if (!isRecord(response)) return [];
  if ('output_text' in response) addTextUrls(response.output_text);
  if (!Array.isArray(response.output)) return [...ids];
  for (const item of response.output) {
    if (!isRecord(item)) continue;
    if (item.type === 'web_search_call' && isRecord(item.action) && Array.isArray(item.action.sources)) {
      for (const source of item.action.sources) if (isRecord(source)) addUrl(source.url);
    }
    if (Array.isArray(item.content)) {
      for (const content of item.content) {
        if (!isRecord(content)) continue;
        addTextUrls(content.text);
        if (Array.isArray(content.annotations)) for (const annotation of content.annotations) if (isRecord(annotation) && annotation.type === 'url_citation') addUrl(annotation.url);
      }
    }
    if (ids.size === 15) return [...ids];
  }
  return [...ids];
}

function normalize(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

const METADATA_QUALIFIERS = new Set([
  'audio', 'officialaudio', 'officialvideo', 'officialmusicvideo', 'lyrics', 'lyricvideo',
  'live', 'musicvideo', 'mv', 'performancevideo', 'stage',
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

function isClearlyNonMvTitle(value: string): boolean {
  return /\[[^\]]*\breacts?\b[^\]]*\]|\b(?:reaction(?:\s+video)?|reacts?\s+to|commentary)\b|리액션/iu.test(value);
}

export async function resolveRecommendations(candidates: Recommendation[], ids: string[], request: typeof fetch): Promise<Recommendation[]> {
  let metadataFailures = 0;
  const videos = await Promise.all(ids.slice(0, 15).map(async (videoId) => {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const endpoint = new URL('https://www.youtube.com/oembed');
    endpoint.searchParams.set('url', videoUrl);
    endpoint.searchParams.set('format', 'json');
    try {
      const response = await request(endpoint, { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(8000) });
      if (!response.ok) { metadataFailures++; return null; }
      const data: unknown = await response.json();
      if (!isRecord(data) || typeof data.title !== 'string' || !data.title.trim() || data.title.length > 500 ||
        typeof data.author_name !== 'string' || !data.author_name.trim() || data.author_name.length > 200 || data.provider_name !== 'YouTube') { metadataFailures++; return null; }
      return { videoId, videoUrl, title: data.title.trim(), channelTitle: data.author_name.trim(),
        thumbnail: isThumbnail(data.thumbnail_url, videoId) ? data.thumbnail_url : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` };
    } catch { metadataFailures++; return null; }
  }));
  if (videos.every((video) => video === null) && metadataFailures > 0) {
    throw new AiDiagnosticError('YOUTUBE_METADATA_FAILED', { stage: 'metadata', message: `${metadataFailures}개 YouTube 메타데이터를 확인하지 못했습니다.` });
  }
  const used = new Set<string>();
  return candidates.flatMap((candidate) => {
    const title = normalize(candidate.title), artist = normalize(candidate.artist);
    if (!title || !artist) return [];
    const video = videos.find((item) => item && !used.has(item.videoId) && !isClearlyNonMvTitle(item.title) && includesVariant(item.title, candidate.title) &&
      (includesVariant(item.title, candidate.artist) || includesVariant(item.channelTitle, candidate.artist)));
    if (!video) return [];
    used.add(video.videoId);
    return [{ ...candidate, ...video }];
  });
}
