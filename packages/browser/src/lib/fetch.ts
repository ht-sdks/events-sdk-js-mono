import unfetch from 'unfetch'
import { getGlobal } from './get-global'

/**
 * Wrapper around native `fetch` containing `unfetch` fallback.
 */
export const fetch: typeof globalThis.fetch = (...args) => {
  const g = getGlobal()
  const fetchFn =
    (g && g.fetch) || (unfetch as unknown as typeof globalThis.fetch)
  return fetchFn(...args)
}
