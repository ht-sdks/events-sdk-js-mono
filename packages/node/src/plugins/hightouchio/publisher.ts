import { backoff } from '@ht-sdks/events-sdk-js-core'
import type { Context } from '../../app/context'
import { tryCreateFormattedUrl } from '../../lib/create-url'
import { extractPromiseParts } from '../../lib/extract-promise-parts'
import { ContextBatch } from './context-batch'
import { NodeEmitter } from '../../app/emitter'
import { InvalidCollectorUrlError } from '../../lib/fetch'
import { b64encode } from '../../lib/base-64-encode'
import {
  HTTPClient,
  HTTPClientRequest,
  HTTPResponse,
} from '../../lib/http-client'

function sleep(timeoutInMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, timeoutInMs))
}

// Some HTTP clients reject non-2xx responses instead of resolving with them.
function rejectedResponse(error: unknown): HTTPResponse {
  const response = (error as { response?: HTTPResponse } | null)?.response
  if (typeof response?.status === 'number') return response
  throw error
}

function noop() {}

const MAX_DEFERRED_BATCHES = 100

interface PendingItem {
  resolver: (ctx: Context) => void
  context: Context
}

export interface PublisherProps {
  host?: string
  path?: string
  flushInterval: number
  maxEventsInBatch: number
  maxRetries: number
  writeKey: string
  httpRequestTimeout?: number
  disable?: boolean
  httpClient: HTTPClient
}

/**
 * The Publisher is responsible for batching events and sending them to the Hightouch API.
 */
export class Publisher {
  private pendingFlushTimeout?: ReturnType<typeof setTimeout>
  private _batch?: ContextBatch

  private _flushInterval: number
  private _maxEventsInBatch: number
  private _maxRetries: number
  private _auth: string
  private _url: string
  private _closeAndFlushPendingItemsCount?: number
  private _httpRequestTimeout: number
  private _emitter: NodeEmitter
  private _disable: boolean
  private readonly recoveryQueue: Array<() => void> = []
  private recoveryDeadline = 0
  private recoveryAttempt = 0
  private _httpClient: HTTPClient
  constructor(
    {
      host,
      path,
      maxRetries,
      maxEventsInBatch,
      flushInterval,
      writeKey,
      httpRequestTimeout,
      httpClient,
      disable,
    }: PublisherProps,
    emitter: NodeEmitter
  ) {
    this._emitter = emitter
    this._maxRetries = maxRetries
    this._maxEventsInBatch = Math.max(maxEventsInBatch, 1)
    this._flushInterval = flushInterval
    this._auth = b64encode(`${writeKey}:`)
    this._url = tryCreateFormattedUrl(
      host ?? 'https://us-east-1.hightouch-events.com',
      path ?? '/v1/batch'
    )
    this._httpRequestTimeout = httpRequestTimeout ?? 10000
    this._disable = Boolean(disable)
    this._httpClient = httpClient
  }

  private createBatch(): ContextBatch {
    this.pendingFlushTimeout && clearTimeout(this.pendingFlushTimeout)
    const batch = new ContextBatch(this._maxEventsInBatch)
    this._batch = batch
    this.pendingFlushTimeout = setTimeout(() => {
      if (batch === this._batch) {
        this._batch = undefined
      }
      this.pendingFlushTimeout = undefined
      if (batch.length) {
        this.send(batch).catch(noop)
      }
    }, this._flushInterval)
    return batch
  }

  private clearBatch() {
    this.pendingFlushTimeout && clearTimeout(this.pendingFlushTimeout)
    this._batch = undefined
  }

  flushAfterClose(pendingItemsCount: number) {
    this._closeAndFlushPendingItemsCount = pendingItemsCount
    if (!pendingItemsCount) {
      // if number of pending items is 0, there will never be anything else entering the batch, since the app is closed.
      return
    }

    // if batch is empty, there's nothing to flush, and when things come in, enqueue will handle them.
    if (!this._batch) return

    // the number of globally pending items will always be larger or the same as batch size.
    // Any mismatch is because some globally pending items are in plugins.
    const isExpectingNoMoreItems = this._batch.length === pendingItemsCount
    if (isExpectingNoMoreItems) {
      this.send(this._batch).catch(noop)
      this.clearBatch()
    }
  }

  /**
   * Enqueues the context for future delivery.
   * @param ctx - Context containing a Hightouch event.
   * @returns a promise that resolves with the context after the event has been delivered.
   */
  enqueue(ctx: Context): Promise<Context> {
    const batch = this._batch ?? this.createBatch()

    const { promise: ctxPromise, resolve } = extractPromiseParts<Context>()

    const pendingItem: PendingItem = {
      context: ctx,
      resolver: resolve,
    }

    /*
      The following logic ensures that a batch is never orphaned,
      and is always sent before a new batch is created.

      Add an event to the existing batch.
        Success: Check if batch is full or no more items are expected to come in (i.e. closing). If so, send batch.
        Failure: Assume event is too big to fit in current batch - send existing batch.
          Add an event to the new batch.
            Success: Check if batch is full and send if it is.
            Failure: Event exceeds maximum size (it will never fit), fail the event.
    */
    const addStatus = batch.tryAdd(pendingItem)
    if (addStatus.success) {
      const isExpectingNoMoreItems =
        batch.length === this._closeAndFlushPendingItemsCount
      const isFull = batch.length === this._maxEventsInBatch
      if (isFull || isExpectingNoMoreItems) {
        this.send(batch).catch(noop)
        this.clearBatch()
      }
      return ctxPromise
    }

    // If the new item causes the maximimum event size to be exceeded, send the current batch and create a new one.
    if (batch.length) {
      this.send(batch).catch(noop)
      this.clearBatch()
    }

    const fallbackBatch = this.createBatch()

    const fbAddStatus = fallbackBatch.tryAdd(pendingItem)

    if (fbAddStatus.success) {
      const isExpectingNoMoreItems =
        fallbackBatch.length === this._closeAndFlushPendingItemsCount
      if (isExpectingNoMoreItems) {
        this.send(fallbackBatch).catch(noop)
        this.clearBatch()
      }
      return ctxPromise
    } else {
      // this should only occur if max event size is exceeded
      ctx.setFailedDelivery({
        reason: new Error(fbAddStatus.message),
      })
      return Promise.resolve(ctx)
    }
  }

  private recoveryTurn(batch: ContextBatch, rotating = false) {
    if (!rotating && this.recoveryQueue.length >= MAX_DEFERRED_BATCHES) {
      resolveFailedBatch(batch, new Error('Deferred delivery queue is full'))
      return
    }
    const turn = extractPromiseParts<void>()
    this.recoveryQueue.push(turn.resolve)
    if (rotating) this.releaseTurn()
    else if (this.recoveryQueue.length === 1) turn.resolve()
    return turn.promise
  }

  private releaseTurn() {
    this.recoveryQueue.shift()
    const next = this.recoveryQueue[0]
    if (next) next()
    else this.recoveryAttempt = 0
  }

  private async send(batch: ContextBatch) {
    if (this._closeAndFlushPendingItemsCount) {
      this._closeAndFlushPendingItemsCount -= batch.length
    }
    const events = batch.getEvents()
    const maxAttempts = this._maxRetries + 1

    let turn: Promise<void> | undefined
    let currentAttempt = 0
    try {
      const createRequest = () => {
        const request: HTTPClientRequest = {
          url: this._url,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${this._auth}`,
            'User-Agent': 'events-sdk-js-node/latest',
          },
          data: { batch: events, sentAt: new Date() },
          httpRequestTimeout: this._httpRequestTimeout,
        }

        this._emitter.emit('http_request', {
          body: request.data,
          method: request.method,
          url: request.url,
          headers: request.headers,
        })

        return request
      }

      while (currentAttempt < maxAttempts) {
        if (
          (this.recoveryQueue.length || this.recoveryDeadline > Date.now()) &&
          !turn
        ) {
          turn = this.recoveryTurn(batch)
          if (!turn) return
        }
        if (turn) {
          await turn
          const remaining = this.recoveryDeadline - Date.now()
          if (remaining > 0) await sleep(remaining)
          if (this._closeAndFlushPendingItemsCount !== undefined)
            currentAttempt = maxAttempts - 1
        }
        currentAttempt++

        let failureReason: unknown
        let recoverable = false
        try {
          if (this._disable) {
            return batch.resolveEvents()
          }

          const request = createRequest()
          recoverable = true
          const response = await this._httpClient
            .makeRequest(request)
            .catch(rejectedResponse)

          recoverable =
            response.status === 408 ||
            response.status === 429 ||
            (response.status >= 500 && response.status < 600)
          if (response.status >= 200 && response.status < 300) {
            // Successfully sent events, so exit!
            batch.resolveEvents()
            return
          } else if (response.status === 400) {
            // Request either malformed or size exceeded - don't retry.
            resolveFailedBatch(
              batch,
              new Error(`[${response.status}] ${response.statusText}`)
            )
            return
          } else {
            // Treat other errors as transient and retry.
            failureReason = new Error(
              `[${response.status}] ${response.statusText}`
            )
          }
        } catch (err) {
          failureReason = err
          if (err instanceof InvalidCollectorUrlError) recoverable = false
        }

        if (recoverable && (currentAttempt === maxAttempts || turn)) {
          if (!this.recoveryQueue.length || turn) {
            this.recoveryDeadline =
              Date.now() +
              backoff({
                attempt: this.recoveryAttempt++,
                minTimeout: 1000,
                maxTimeout: 60000,
              })
          }
          if (this._closeAndFlushPendingItemsCount !== undefined) {
            resolveFailedBatch(batch, failureReason)
            return
          }
          const rotating = !!turn
          turn = this.recoveryTurn(batch, rotating)
          if (!turn) return
          if (!rotating) {
            try {
              this._emitter.emit('error', {
                code: 'unknown',
                reason: failureReason as Error,
              })
            } catch {
              // An application listener must not interrupt delivery of a retained batch.
            }
          }
          currentAttempt--
          continue
        }

        // Final attempt failed, update context and resolve events.
        if (currentAttempt === maxAttempts) {
          resolveFailedBatch(batch, failureReason)
          return
        }

        // Retry after attempt-based backoff.
        await sleep(
          backoff({
            attempt: currentAttempt,
            minTimeout: 25,
            maxTimeout: 1000,
          })
        )
      }
    } finally {
      if (turn) this.releaseTurn()
    }
  }
}

function resolveFailedBatch(batch: ContextBatch, reason: unknown) {
  batch.getContexts().forEach((ctx) => ctx.setFailedDelivery({ reason }))
  batch.resolveEvents()
}
