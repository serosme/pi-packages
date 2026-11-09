import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { FetchSchema, runFetch } from './fetch.ts'
import { runSearch, SearchSchema } from './search.ts'

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'web_search',
    label: 'Web Search',
    description:
      'Search the web with DeepSeek. Returns the title, URL, and summary of each result. '
      + 'Search operators are supported in query.',
    promptSnippet: 'Search the web with DeepSeek',
    parameters: SearchSchema,
    execute: (_id, params, signal, _onUpdate, ctx) => runSearch(params, signal, ctx),
  })

  pi.registerTool({
    name: 'web_fetch',
    label: 'Web Fetch',
    description: 'Fetch a public HTML page with DeepSeek and return its content as Markdown. PDFs and other non-HTML content may be unsupported.',
    promptSnippet: 'Fetch a URL as Markdown with DeepSeek',
    parameters: FetchSchema,
    execute: (_id, params, signal, _onUpdate, ctx) => runFetch(params, signal, ctx),
  })
}
