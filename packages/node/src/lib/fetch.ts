import type { HTTPFetchFn } from './http-client'

export const fetch: HTTPFetchFn = (url, requestInit) => {
  if (typeof globalThis.fetch !== 'function') {
    throw new Error(
      'globalThis.fetch is not available. Use Node.js 22+ or pass a custom httpClient.'
    )
  }
  return globalThis.fetch(url, requestInit)
}
