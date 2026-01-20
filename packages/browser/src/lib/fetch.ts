import unfetch from 'unfetch'
import { getGlobal } from './get-global'

/**
 * Wrapper around native `fetch` containing `unfetch` fallback.
 * Note: unfetch is a minimal polyfill that returns a subset of Response.
 * We cast to maintain type compatibility while using unfetch as fallback.
 */
export const fetch: typeof globalThis.fetch = (
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> => {
  const g = getGlobal()
  const fetchFn =
    (g && g.fetch) || (unfetch as unknown as typeof globalThis.fetch)
  // Only pass init if defined to maintain backwards compatibility with tests
  return init !== undefined ? fetchFn(input, init) : fetchFn(input)
}
