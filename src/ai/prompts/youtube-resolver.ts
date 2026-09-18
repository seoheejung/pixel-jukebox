import type { Candidate } from '../../shared/recommendation';

export function youtubeResolverBody(candidates: Candidate[], individual = false): Record<string, unknown> {
  const scope = individual ? 'the supplied track' : 'each supplied track';
  return {
    model: 'gpt-5.6-luna',
    store: false,
    tools: [{ type: 'web_search' }],
    tool_choice: 'required',
    include: ['web_search_call.action.sources'],
    input: [
      {
        role: 'developer',
        content: `Find one exact, official, full-recording YouTube video for ${scope}. Verify that artist, track, and recording match. Rank eligible videos in this order: official MV; official performance or live clip; official lyric video; official visualizer; official audio; Artist Topic; official label or distributor upload. Accept uploads from the artist's official channel, official YouTube channel, label, distributor, or Artist Topic channel. Exclude fan uploads, covers, reactions, karaoke, instrumental covers, sped-up or slowed versions, nightcore, mashups, compilations, playlists, unrelated Shorts, and another artist's cover. Never guess or construct a URL or video ID. Omit a candidate when an exact supported video cannot be confirmed. Return only one result per line in the exact form YOUTUBE|C03|MV|Artist|Track|https://www.youtube.com/watch?v=VIDEO_ID. Allowed video types are MV, PERFORMANCE, LIVE, LYRIC, VISUALIZER, AUDIO, TOPIC, and OFFICIAL_OTHER. Return no prose, Markdown, search pages, channel pages, playlist pages, shortened URLs, embed URLs, or live URLs.`,
      },
      { role: 'user', content: JSON.stringify(candidates) },
    ],
  };
}
