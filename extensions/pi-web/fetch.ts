import type { AgentToolResult, ExtensionContext } from '@earendil-works/pi-coding-agent'
import type { Static } from 'typebox'
import type { FetchResponse } from './types.ts'
import { Type } from 'typebox'
import { resolveApiKey } from './auth.ts'
import { fetchPage } from './client.ts'

export const FetchSchema = Type.Object({
  url: Type.String({
    minLength: 1,
    maxLength: 8192,
    description:
      'Required. Public HTTP or HTTPS URL of an HTML page to fetch, 1-8192 characters. '
      + 'It must include a host and must not contain a username or password.',
  }),
})

export type FetchParams = Static<typeof FetchSchema>

function formatFetch(url: string, page: FetchResponse): string {
  return [page.title, url, page.content].join('\n')
}

export async function runFetch(
  params: FetchParams,
  signal: AbortSignal | undefined,
  ctx: ExtensionContext,
): Promise<AgentToolResult<undefined>> {
  const apiKey = await resolveApiKey(ctx)
  const page = await fetchPage(apiKey, params.url, signal)

  return {
    content: [
      {
        type: 'text',
        text: formatFetch(params.url, page),
      },
    ],
    details: undefined,
  }
}
