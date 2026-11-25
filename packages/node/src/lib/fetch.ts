import type { HTTPFetchFn } from './http-client'

export class UnsupportedProtocolError extends Error {}

export const fetch: HTTPFetchFn = async (url, requestInit) => {
  if (!/^https?:/i.test(url))
    throw new UnsupportedProtocolError('Collector URL must use HTTP or HTTPS')
  if (typeof globalThis.fetch !== 'function') {
    throw new Error(
      'globalThis.fetch is not available. Use Node.js 22+ or pass a custom httpClient.'
    )
  }
  return globalThis.fetch(url, requestInit)
}
