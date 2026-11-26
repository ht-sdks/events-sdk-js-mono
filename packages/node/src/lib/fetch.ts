import type { HTTPFetchFn } from './http-client'

export class LocalFetchError extends Error {}

export const fetch: HTTPFetchFn = (url, requestInit) => {
  const endpoint = new URL(url)
  if (
    !['http:', 'https:'].includes(endpoint.protocol) ||
    endpoint.username ||
    endpoint.password
  ) {
    throw new LocalFetchError(
      'Collector must use an HTTP(S) URL without credentials'
    )
  }
  if (typeof globalThis.fetch !== 'function') {
    throw new LocalFetchError(
      'globalThis.fetch is not available. Use Node.js 22+ or pass a custom httpClient.'
    )
  }
  return globalThis.fetch(url, requestInit)
}
