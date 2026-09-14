import { MAX_RECOMMENDATIONS } from '../../shared/recommendation';
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
        content: `Select and order up to ${MAX_RECOMMENDATIONS} distinct candidate IDs as a cohesive playlist beginning from the CURRENT TRACK. Use only the supplied Candidate Set. Prioritize: (1) a natural transition from the current track, (2) mood and emotional arc, (3) production and instrumentation, (4) energy, tempo feel, and groove, (5) playlist cohesion, (6) artist diversity, and (7) discovery value. Keep the opening tracks close to the seed, then gradually allow adjacent scenes and more exploratory tracks. Songs by the same artist are allowed, but do not place them consecutively or let one artist dominate. Preserve the candidate order you choose as the playback order. Return only candidateId values through the supplied JSON schema; do not modify metadata or invent IDs.`,
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
              minItems: 0,
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
