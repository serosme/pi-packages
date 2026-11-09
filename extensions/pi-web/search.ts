import type { AgentToolResult, ExtensionContext } from '@earendil-works/pi-coding-agent'
import type { Static } from 'typebox'
import type { Hit } from './types.ts'
import { Type } from 'typebox'
import { resolveApiKey } from './auth.ts'
import { search } from './client.ts'

export const SearchSchema = Type.Object({
  query: Type.String({
    minLength: 1,
    maxLength: 128,
    pattern: '\\S',
    description:
      'Required. Search query, 1-128 characters, not all whitespace. Sent to DeepSeek verbatim, so operators work: '
      + 'site:github.com (combine sites with OR), -site:example.com, -term, "exact phrase", -"excluded phrase", '
      + 'lang:zh,en, after:2025, before:2026-06-01.',
  }),
  count: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 50,
      default: 10,
      description: 'Optional. Number of results to return, 1-50. Defaults to 10.',
    }),
  ),
  question: Type.Optional(
    Type.String({
      minLength: 1,
      maxLength: 128,
      description:
        'Optional. The user\'s original question that triggered the search, 1-128 characters. '
        + 'Sent as ori_question to improve query understanding; omit it when it is the same as query.',
    }),
  ),
})

export type SearchParams = Static<typeof SearchSchema>

function formatSearch(hits: Hit[]): string {
  if (hits.length === 0) {
    return 'No results.'
  }

  return hits
    .map(hit => [hit.title, hit.url, hit.summary].join('\n'))
    .join('\n\n')
}

export async function runSearch(
  params: SearchParams,
  signal: AbortSignal | undefined,
  ctx: ExtensionContext,
): Promise<AgentToolResult<undefined>> {
  const apiKey = await resolveApiKey(ctx)
  const hits = await search(
    apiKey,
    {
      query: params.query,
      count: params.count,
      ori_question: params.question,
    },
    signal,
  )

  return {
    content: [
      {
        type: 'text',
        text: formatSearch(hits),
      },
    ],
    details: undefined,
  }
}
