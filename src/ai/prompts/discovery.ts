import type { PlaylistTrack } from '../../shared/playlist';
import { MAX_CANDIDATES } from '../../shared/recommendation';
import type { Recommendation } from '../../shared/recommendation';
import type { Track } from '../../shared/track';

export interface RecommendationPromptContext {
  current: Track | null;
  playlist: PlaylistTrack[];
  recent: Recommendation[];
}

export function recommendationContext(context: RecommendationPromptContext): string {
  const current = context.current
    ? `Supplied title: ${context.current.videoTitle}\nSupplied channel: ${context.current.channelTitle}\nSecondary reference URL: ${context.current.videoUrl}`
    : 'No selected reference track';
  const playlist = context.playlist.map((track) => `${track.channelTitle} — ${track.videoTitle}`).join('\n') || 'Empty';
  const recent = context.recent.map((item) => `${item.artist} — ${item.title}`).join('\n') || 'Empty';
  return `Current track:\n${current}\n\nPlaylist context:\n${playlist}\n\nRecent recommendations:\n${recent}`;
}

export function discoveryResearchBody(context: RecommendationPromptContext): Record<string, unknown> {
  return {
    model: 'gpt-4.1-mini',
    store: false,
    tools: [{ type: 'web_search' }],
    tool_choice: 'required',
    input: [
      {
        role: 'developer',
        content: `Research real, publicly released tracks that form a natural listening journey from the CURRENT TRACK. Treat the current track as the strongest anchor and the playlist only as supporting taste context. Judge emotional mood, sonic texture, energy, tempo feel, groove, vocal character, melody, harmony, era, music scene, and artist relationships. Build a balanced pool containing very close tracks, tracks from the same or an adjacent scene, and a few more exploratory tracks whose transition still feels natural. Songs by the same artist are allowed, but prevent one artist from dominating the pool. Exclude the current track, playlist tracks, recent recommendations, duplicates, remixes, sped-up or slowed versions, karaoke, covers, and any track whose existence is uncertain. Do not invent facts, names, links, BPM, or musical attributes. Research up to ${MAX_CANDIDATES} supported tracks and return concise evidence notes. Do not create YouTube URLs or video IDs.`,
      },
      { role: 'user', content: recommendationContext(context) },
    ],
  };
}

export function discoveryExtractionBody(context: RecommendationPromptContext, research: string): Record<string, unknown> {
  return {
    model: 'gpt-4.1-mini',
    store: false,
    input: [
      {
        role: 'developer',
        content: `Extract at most ${MAX_CANDIDATES} real tracks supported by the supplied research. Preserve the evidenced artist and track names. Do not infer, translate, rename, or add tracks. Exclude the current track, playlist tracks, recent recommendations, duplicates, alternate versions, remixes, sped-up or slowed versions, karaoke, and covers. Return only one candidate per line in the exact form CANDIDATE|C01|Artist|Track, using unique sequential IDs. Return no prose, URLs, video IDs, Markdown bullets, or code fences.`,
      },
      { role: 'user', content: `${recommendationContext(context)}\n\nWeb research:\n${research}` },
    ],
  };
}
