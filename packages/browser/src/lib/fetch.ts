import unfetch from 'unfetch'
import { getGlobal } from './get-global'

/**
 * Wrapper around native `fetch` containing `unfetch` fallback.
 */
export const fetch: typeof global.fetch = (
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> => {
  const global = getGlobal()
  const fetchFn = (global && global.fetch) || unfetch
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return fetchFn(input as string, init as any) as Promise<Response>
}
