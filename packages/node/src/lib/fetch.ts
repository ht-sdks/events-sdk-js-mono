import type { HTTPFetchFn } from './http-client'

export class InvalidCollectorUrlError extends Error {}

export const fetch: HTTPFetchFn = async (url, requestInit) => {
  const { protocol, username, password } = new URL(url)
  if (protocol !== 'http:' && protocol !== 'https:')
    throw new InvalidCollectorUrlError('Collector URL must use HTTP or HTTPS')
  if (username || password)
    throw new InvalidCollectorUrlError(
      'Collector URL cannot include credentials'
    )
  if (typeof globalThis.fetch !== 'function') {
    throw new Error(
      'globalThis.fetch is not available. Use Node.js 22+ or pass a custom httpClient.'
    )
  }
  return globalThis.fetch(url, requestInit)
}
