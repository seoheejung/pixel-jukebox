import type { RecommendationPromptContext } from './discovery';

export function singleRecommendationBody(context: RecommendationPromptContext): Record<string, unknown> {
  const current = context.current
    ? `Current track:\nTitle: ${context.current.videoTitle}\nChannel: ${context.current.channelTitle}\nYouTube URL: ${context.current.videoUrl}`
    : 'Current track: none';
  return {
    model: 'gpt-5.6-luna',
    store: false,
    tools: [{ type: 'web_search', search_context_size: 'low', filters: { allowed_domains: ['www.youtube.com'] } }],
    tool_choice: 'required',
    max_tool_calls: 6,
    reasoning: { effort: 'low' },
    include: ['web_search_call.action.sources'],
    input: [
      {
        role: 'developer',
        content: 'You are a careful playlist curator. Use no more than six focused web searches, restricted to direct www.youtube.com/watch results, and gather at least 12 distinct source URLs before answering. In one response, return 12 distinct real tracks that continue the current listening flow: 10 primary recommendations followed by 2 backup recommendations. Exclude the current track, covers, karaoke, reactions, remixes, sped-up or slowed versions, compilations, playlists, Shorts, and uncertain matches. For every track, use one exact YouTube URL found in your web search for an official or artist-authorized full recording. Use only a URL returned in the web-search source list. Do not guess or construct URLs. Preserve the best listening order. Your final message MUST contain exactly 12 lines and nothing else. Every line MUST begin with TRACK. Use this exact form for the first 10 lines: TRACK|PRIMARY|Artist — Track title|https://www.youtube.com/watch?v=VIDEO_ID. Use this exact form for the last 2 lines: TRACK|BACKUP|Artist — Track title|https://www.youtube.com/watch?v=VIDEO_ID. Do not return prose, Markdown, JSON, headings, citations, or code fences.',
      },
      { role: 'user', content: current },
    ],
  };
}
