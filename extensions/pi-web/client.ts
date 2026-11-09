import type { FetchResponse, Hit, SearchRequest, SearchResponse } from './types.ts'

const API_ROOT = 'https://api.deepseek.com'

async function post<T>(path: string, apiKey: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    throw new Error(`${response.status}: ${await response.text()}`)
  }

  return (await response.json()) as T
}

export async function search(
  apiKey: string,
  body: SearchRequest,
  signal?: AbortSignal,
): Promise<Hit[]> {
  const data = await post<SearchResponse>('/v1/tools/search', apiKey, body, signal)
  return data.results ?? []
}

export function fetchPage(apiKey: string, url: string, signal?: AbortSignal): Promise<FetchResponse> {
  return post<FetchResponse>('/v1/tools/fetch', apiKey, { url }, signal)
}
