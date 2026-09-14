import { MAX_RECOMMENDATIONS, MIN_RECOMMENDATIONS } from '../../shared/recommendation';
import type { Candidate } from '../../shared/recommendation';
import { recommendationContext } from './discovery';
import type { RecommendationPromptContext } from './discovery';

export function selectionBody(context: RecommendationPromptContext, candidates: Candidate[], correction?: string): Record<string, unknown> {
  return {
    model: 'gpt-4.1-mini',
    store: false,
    input: [
      {
        role: 'developer',
        content: `Curate ${MIN_RECOMMENDATIONS} to ${MAX_RECOMMENDATIONS} distinct candidate IDs as the continuation of a playlist that begins with the CURRENT TRACK. This is a listening-flow decision, not a generic similarity ranking. For every transition ask: if this song played next, would the flow break? Use only the supplied Candidate Set. Prioritize: (1) uninterrupted flow from the current track, (2) mood and emotional arc, (3) sonic texture, era, production, and instrumentation, (4) energy, tempo feel, and groove, (5) whole-playlist cohesion, (6) artist diversity, and (7) discovery value. Start with close tracks, move through the same or adjacent scene, then allow a few surprising tracks whose atmosphere still connects. Songs by the same artist are allowed, but do not place them consecutively or let one artist dominate. Return fewer than ${MIN_RECOMMENDATIONS} only when the Candidate Set itself is smaller. Preserve your chosen order as playback order. Return only candidateId values through the supplied JSON schema; do not modify metadata or invent IDs.`,
      },
      { role: 'user', content: `${recommendationContext(context)}\n\nCandidate Set:\n${JSON.stringify(candidates)}` },
      ...(correction ? [{ role: 'developer', content: `The previous selection failed validation: ${correction} Retry once with the identical Candidate Set. Use each supplied candidate ID at most once and return fewer results when necessary.` }] : []),
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'music_recommendations',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            recommendations: {
              type: 'array',
              minItems: Math.min(MIN_RECOMMENDATIONS, candidates.length),
              maxItems: MAX_RECOMMENDATIONS,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: { candidateId: { type: 'string', enum: candidates.map((candidate) => candidate.candidateId) } },
                required: ['candidateId'],
              },
            },
          },
          required: ['recommendations'],
        },
      },
    },
  };
}
