import { ValidationError } from '@ht-sdks/events-sdk-js-core'
import { HTTPClient, HTTPFetchFn } from '../lib/http-client'

export interface HtEventsSettings {
  /**
   * Key that corresponds to your Hightouch.io project
   */
  writeKey: string
  /**
   * The base URL of the API. Default: "https://us-east-1.hightouch-events.com"
   */
  host?: string
  /**
   * The API path route. Default: "/v1/batch"
   */
  path?: string
  /**
   * The number of times to retry flushing a batch. Default: 3
   */
  maxRetries?: number
  /** Maximum number of events retained after ordinary retries. Defaults to unlimited.
   * Use zero to finish delivery at retry exhaustion. A batch must fit in full.
   */
  maxDeferredEvents?: number
  /**
   * The number of messages to enqueue before flushing. Default: 15
   */
  maxEventsInBatch?: number
  /**
   * The number of milliseconds to wait before flushing the queue automatically. Default: 10000
   */
  flushInterval?: number
  /**
   * The maximum number of milliseconds to wait for an http request. Default: 10000
   */
  httpRequestTimeout?: number
  /**
   * Disable the analytics library. All calls will be a noop. Default: false.
   */
  disable?: boolean
  /**
   * Supply a default http client implementation (such as one supporting proxy).
   * Accepts either an HTTPClient instance or a fetch function.
   * Default: an HTTP client that uses globalThis.fetch.
   */
  httpClient?: HTTPFetchFn | HTTPClient
}

export const validateSettings = (settings: HtEventsSettings) => {
  const limit = settings.maxDeferredEvents
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 0)) {
    throw new ValidationError(
      'maxDeferredEvents',
      'Expected a non-negative integer.'
    )
  }
  if (!settings.writeKey) {
    throw new ValidationError('writeKey', 'writeKey is missing.')
  }
}
