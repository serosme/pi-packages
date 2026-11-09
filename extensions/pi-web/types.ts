/** `POST /v1/tools/search` request body */
export interface SearchRequest {
  query: string
  count?: number
  ori_question?: string
}

/** `POST /v1/tools/search` → `results[]` (the subset the tool uses) */
export interface Hit {
  title: string
  url: string
  summary: string
}

export interface SearchResponse {
  results?: Hit[]
}

/** `POST /v1/tools/fetch` */
export interface FetchResponse {
  title: string
  content: string
}
