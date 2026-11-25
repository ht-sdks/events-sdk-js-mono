import { Emitter } from '@ht-sdks/events-sdk-js-core'
import { range } from 'lodash'
import { createConfiguredNodePlugin } from '..'
import { Context } from '../../../app/context'
import { NodeEventFactory } from '../../../app/event-factory'
import { assertHttpRequestEmittedEvent } from '../../../__tests__/test-helpers/assert-shape'
import {
  createSuccess,
  createError,
} from '../../../__tests__/test-helpers/factories'
import { TestFetchClient } from '../../../__tests__/test-helpers/create-test-analytics'
import { PublisherProps } from '../publisher'
import { assertHTTPRequestOptions } from '../../../__tests__/test-helpers/assert-shape/hightouch-http-api'

let emitter: Emitter
const testClient = new TestFetchClient()
const fetcher = jest.spyOn(testClient, 'makeRequest')

const createTestNodePlugin = (props: Partial<PublisherProps> = {}) =>
  createConfiguredNodePlugin(
    {
      maxEventsInBatch: 1,
      httpClient: testClient,
      writeKey: '',
      flushInterval: 1000,
      maxRetries: 3,
      ...props,
    },
    emitter
  )

const validateFetcherInputs = (...contexts: Context[]) => {
  const [request] = fetcher.mock.lastCall!
  return assertHTTPRequestOptions(request, contexts)
}

const eventFactory = new NodeEventFactory()

beforeEach(() => {
  emitter = new Emitter()
  fetcher.mockReturnValue(createSuccess())
  jest.useFakeTimers()
})

it('supports multiple events in a batch', async () => {
  const { plugin: hightouchPlugin } = createTestNodePlugin({
    maxRetries: 3,
    maxEventsInBatch: 3,
  })

  // Create 3 events of mixed types to send.
  const contexts = [
    eventFactory.track('test event', { foo: 'bar' }, { userId: 'foo-user-id' }),
    eventFactory.alias('to', 'from'),
    eventFactory.identify('foo-user-id', {
      name: 'Chris Radek',
    }),
  ].map((event) => new Context(event))

  for (const context of contexts) {
    // We want batching to happen, so don't await.
    void hightouchPlugin[context.event.type](context)
  }

  // Expect a single fetch call for all 3 events.
  expect(fetcher).toHaveBeenCalledTimes(1)

  validateFetcherInputs(...contexts)
})

it('supports waiting a max amount of time before sending', async () => {
  const { plugin: hightouchPlugin } = createTestNodePlugin({
    maxRetries: 3,
    maxEventsInBatch: 3,
  })

  const context = new Context(eventFactory.alias('to', 'from'))

  const pendingContext = hightouchPlugin.alias(context)

  jest.advanceTimersByTime(500)

  expect(fetcher).not.toHaveBeenCalled()

  jest.advanceTimersByTime(500)

  // Expect a single fetch call for all 1 events.
  expect(fetcher).toHaveBeenCalledTimes(1)
  validateFetcherInputs(context)

  // Make sure we're returning the context in the resolved promise.
  const updatedContext = await pendingContext
  expect(updatedContext).toBe(context)
  expect(updatedContext.failedDelivery()).toBeFalsy()
})

it('sends as soon as batch fills up or max time is reached', async () => {
  const { plugin: hightouchPlugin } = createTestNodePlugin({
    maxRetries: 3,
    maxEventsInBatch: 2,
  })

  const context = new Context(eventFactory.alias('to', 'from'))

  const contexts: Context[] = []
  // Fill up 1 batch and partially fill another
  for (let i = 0; i < 3; i++) {
    contexts.push(new Context(eventFactory.alias('to', 'from')))
  }

  const pendingContexts = contexts.map((ctx) => hightouchPlugin.alias(ctx))

  // Should have seen 1 call due to 1 batch being filled.
  expect(fetcher).toHaveBeenCalledTimes(1)
  validateFetcherInputs(context, context)

  // 2nd batch is not full, so need to wait for the flushInterval to be reached before sending.
  jest.advanceTimersByTime(500)
  expect(fetcher).toHaveBeenCalledTimes(1)
  jest.advanceTimersByTime(500)
  expect(fetcher).toHaveBeenCalledTimes(2)

  // Make sure we're returning the context in the resolved promise.
  const updatedContexts = await Promise.all(pendingContexts)
  for (let i = 0; i < 3; i++) {
    expect(updatedContexts[i]).toBe(contexts[i])
    expect(updatedContexts[i].failedDelivery()).toBeFalsy()
  }
})

it('sends if batch will exceed max size in bytes when adding event', async () => {
  const { plugin: hightouchPlugin } = createTestNodePlugin({
    maxRetries: 3,
    maxEventsInBatch: 20,
    flushInterval: 100,
  })

  const contexts: Context[] = []
  // Max batch size is ~480KB, so adding 16 events with 30KB buffers will hit the limit.
  for (let i = 0; i < 16; i++) {
    contexts.push(
      new Context(
        eventFactory.track(
          'Test Event',
          {
            smallBuffer: Buffer.alloc(30 * 1024).toString(),
            index: i,
          },
          { anonymousId: 'foo' }
        )
      )
    )
  }

  const pendingContexts = contexts.map((ctx) => hightouchPlugin.track(ctx))
  expect(fetcher).toHaveBeenCalledTimes(1)
  jest.advanceTimersByTime(100)
  expect(fetcher).toHaveBeenCalledTimes(2)

  const updatedContexts = await Promise.all(pendingContexts)
  for (let i = 0; i < 16; i++) {
    expect(updatedContexts[i]).toBe(contexts[i])
    expect(updatedContexts[i].failedDelivery()).toBeFalsy()
  }
})

describe('flushAfterClose', () => {
  const _createTrackCtx = () =>
    new Context(
      eventFactory.track(
        'test event',
        { foo: 'bar' },
        { userId: 'foo-user-id' }
      )
    )

  it('sends immediately once all pending events reach the hightouch plugin, regardless of settings like batch size', async () => {
    const _createTrackCtx = () =>
      new Context(
        eventFactory.track(
          'test event',
          { foo: 'bar' },
          { userId: 'foo-user-id' }
        )
      )

    const { plugin: hightouchPlugin, publisher } = createTestNodePlugin({
      maxEventsInBatch: 20,
    })

    publisher.flushAfterClose(3)

    void hightouchPlugin.track(_createTrackCtx())
    void hightouchPlugin.track(_createTrackCtx())
    expect(fetcher).toHaveBeenCalledTimes(0)
    void hightouchPlugin.track(_createTrackCtx())
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('continues to flush on each event if batch size is 1', async () => {
    const { plugin: hightouchPlugin, publisher } = createTestNodePlugin({
      maxEventsInBatch: 1,
    })

    publisher.flushAfterClose(3)

    void hightouchPlugin.track(_createTrackCtx())
    void hightouchPlugin.track(_createTrackCtx())
    void hightouchPlugin.track(_createTrackCtx())
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('sends immediately once there are no pending items, even if pending events exceeds batch size', async () => {
    const { plugin: hightouchPlugin, publisher } = createTestNodePlugin({
      maxEventsInBatch: 3,
    })

    publisher.flushAfterClose(5)
    range(3).forEach(() => hightouchPlugin.track(_createTrackCtx()))
    expect(fetcher).toHaveBeenCalledTimes(1)
    range(2).forEach(() => hightouchPlugin.track(_createTrackCtx()))
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('works if there are previous items in the batch', async () => {
    const { plugin: hightouchPlugin, publisher } = createTestNodePlugin({
      maxEventsInBatch: 7,
    })

    range(3).forEach(() => hightouchPlugin.track(_createTrackCtx())) // should not flush
    expect(fetcher).toHaveBeenCalledTimes(0)
    publisher.flushAfterClose(5)
    expect(fetcher).toHaveBeenCalledTimes(0)
    range(2).forEach(() => hightouchPlugin.track(_createTrackCtx()))
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('works if there are previous items in the batch AND pending items > batch size', async () => {
    const { plugin: hightouchPlugin, publisher } = createTestNodePlugin({
      maxEventsInBatch: 7,
    })

    range(3).forEach(() => hightouchPlugin.track(_createTrackCtx())) // should not flush
    expect(fetcher).toHaveBeenCalledTimes(0)
    publisher.flushAfterClose(10)
    expect(fetcher).toHaveBeenCalledTimes(0)
    range(4).forEach(() => hightouchPlugin.track(_createTrackCtx())) // batch is full, send.
    expect(fetcher).toHaveBeenCalledTimes(1)
    range(2).forEach(() => hightouchPlugin.track(_createTrackCtx()))
    expect(fetcher).toHaveBeenCalledTimes(1)
    void hightouchPlugin.track(_createTrackCtx()) // pending items limit has been reached, send.
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})

describe('error handling', () => {
  it('excludes events that are too large', async () => {
    const { plugin: hightouchPlugin } = createTestNodePlugin({
      maxEventsInBatch: 1,
    })

    const context = new Context(
      eventFactory.track(
        'Test Event',
        {
          largeBuffer: Buffer.alloc(500 * 1024).toString(),
        },
        {
          anonymousId: 'foo',
        }
      )
    )

    expect(context.failedDelivery()).toBeFalsy()
    const updatedContext = await hightouchPlugin.track(context)
    expect(updatedContext).toBe(context)
    expect(updatedContext.failedDelivery()).toBeTruthy()
    expect(updatedContext.failedDelivery()).toMatchInlineSnapshot(`
      {
        "reason": [Error: Event exceeds maximum event size of 32 KB],
      }
    `)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('does not retry 400 errors', async () => {
    fetcher.mockReturnValue(
      createError({ status: 400, statusText: 'Bad Request' })
    )

    const { plugin: hightouchPlugin } = createTestNodePlugin({
      maxEventsInBatch: 1,
    })

    const context = new Context(eventFactory.alias('to', 'from'))

    const updatedContext = await hightouchPlugin.alias(context)

    expect(fetcher).toHaveBeenCalledTimes(1)
    validateFetcherInputs(context)

    expect(updatedContext).toBe(context)
    expect(updatedContext.failedDelivery()).toBeTruthy()
    expect(updatedContext.failedDelivery()).toMatchInlineSnapshot(`
      {
        "reason": [Error: [400] Bad Request],
      }
    `)
  })

  it.each([
    ...[401, 403, 404].map((status) => ({ status, statusText: 'Rejected' })),
    { status: 300, statusText: 'Multiple Choices' },
    { status: 100, statusText: 'Continue' },
  ])('retries non-400 errors: %p', async (response) => {
    // Jest kept timing out when using fake timers despite advancing time.
    jest.useRealTimers()

    fetcher.mockReturnValue(createError(response))

    const { plugin: hightouchPlugin } = createTestNodePlugin({
      maxRetries: 2,
      maxEventsInBatch: 1,
    })

    const context = new Context(eventFactory.alias('to', 'from'))

    const pendingContext = hightouchPlugin.alias(context)
    const updatedContext = await pendingContext

    expect(fetcher).toHaveBeenCalledTimes(3)
    validateFetcherInputs(context)

    expect(updatedContext).toBe(context)
    expect(updatedContext.failedDelivery()).toBeTruthy()
    const err = updatedContext.failedDelivery()?.reason as Error
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toEqual(
      expect.stringContaining(response.status.toString())
    )
  })
  it('lets a queued batch pass a failing batch after the source cooldown', async () => {
    const { plugin } = createTestNodePlugin({ maxRetries: 0 })
    const a = new Context(eventFactory.alias('a', 'from'))
    const b = new Context(eventFactory.alias('b', 'from'))
    fetcher.mockReturnValueOnce(createError({ status: 503 }))
    fetcher.mockReturnValueOnce(createError({ status: 429 }))

    const first = plugin.alias(a)
    await jest.advanceTimersByTimeAsync(0)
    const second = plugin.alias(b)
    expect(fetcher).toHaveBeenCalledTimes(1)
    await jest.advanceTimersToNextTimerAsync()
    expect(fetcher).toHaveBeenCalledTimes(2)
    validateFetcherInputs(a)
    await jest.advanceTimersByTimeAsync(1999)
    expect(fetcher).toHaveBeenCalledTimes(2)
    await jest.advanceTimersToNextTimerAsync()
    expect(await second).toBe(b)
    expect(await first).toBe(a)
    expect(
      fetcher.mock.calls.map(([request]) => request.data.batch[0].messageId)
    ).toEqual([a, a, b, a].map((ctx) => ctx.event.messageId))
  })

  it('renews the source cooldown after a failed final probe during close', async () => {
    const { plugin, publisher } = createTestNodePlugin({ maxRetries: 0 })
    fetcher.mockReturnValueOnce(createError({ status: 429 }))
    fetcher.mockReturnValueOnce(createError({ status: 429 }))
    const first = plugin.alias(new Context(eventFactory.alias('a', 'from')))
    await jest.advanceTimersByTimeAsync(0)
    const second = plugin.alias(new Context(eventFactory.alias('b', 'from')))
    publisher.flushAfterClose(2)
    await jest.advanceTimersToNextTimerAsync()
    expect((await first).failedDelivery()).toBeTruthy()
    await jest.advanceTimersByTimeAsync(1999)
    expect(fetcher).toHaveBeenCalledTimes(2)
    await jest.advanceTimersByTimeAsync(1)
    expect((await second).failedDelivery()).toBeUndefined()
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('finishes ordinary retries when a request listener throws before transport', async () => {
    const { plugin } = createTestNodePlugin({ maxRetries: 1 })
    const error = new Error('request listener')
    const listener = jest.fn(() => {
      throw error
    })
    emitter.on('http_request', listener)
    const ctx = new Context(eventFactory.alias('to', 'from'))
    const sent = plugin.alias(ctx)
    await jest.advanceTimersByTimeAsync(120000)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(fetcher).not.toHaveBeenCalled()
    expect((await sent).failedDelivery()?.reason).toBe(error)
  })

  it.each([400, 503])(
    'classifies an HTTP %s rejected by the adapter',
    async (status) => {
      const { plugin } = createTestNodePlugin({ maxRetries: 0 })
      fetcher.mockRejectedValueOnce({
        response: { status, statusText: 'Rejected' },
      })
      const ctx = new Context(eventFactory.alias('to', 'from'))
      const sent = plugin.alias(ctx)
      await jest.advanceTimersByTimeAsync(15000)
      expect(await sent).toBe(ctx)
      expect(fetcher).toHaveBeenCalledTimes(status === 400 ? 1 : 2)
      if (status === 400)
        expect(ctx.failedDelivery()?.reason).toEqual(
          new Error('[400] Rejected')
        )
      else expect(ctx.failedDelivery()).toBeUndefined()
    }
  )

  it('continues deferred delivery when an error listener throws', async () => {
    const { plugin } = createTestNodePlugin({ maxRetries: 0 })
    const listener = jest.fn(() => {
      throw new Error('listener failed')
    })
    emitter.on('error', listener)
    fetcher.mockReturnValueOnce(createError({ status: 503 }))
    const ctx = new Context(eventFactory.alias('to', 'from'))
    const pending = plugin.alias(ctx)
    await jest.advanceTimersByTimeAsync(15000)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(await pending).toBe(ctx)
    expect(ctx.failedDelivery()).toBeUndefined()
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('fails new overflow and retains all 100 admitted batches across rotation', async () => {
    const { plugin } = createTestNodePlugin({ maxRetries: 0 })
    fetcher.mockReturnValueOnce(createError({ status: 503 }))
    fetcher.mockReturnValueOnce(createError({ status: 429 }))
    const enqueue = () =>
      plugin.alias(new Context(eventFactory.alias('to', 'from')))
    const accepted = [enqueue()]
    await jest.advanceTimersByTimeAsync(0)
    for (let i = 1; i < 100; i++) accepted.push(enqueue())
    const overflow = await enqueue()
    expect(overflow.failedDelivery()?.reason).toEqual(
      new Error('Deferred delivery queue is full')
    )
    expect(fetcher).toHaveBeenCalledTimes(1)
    await jest.advanceTimersByTimeAsync(15000)
    for (const ctx of await Promise.all(accepted))
      expect(ctx.failedDelivery()).toBeUndefined()
    expect(fetcher).toHaveBeenCalledTimes(102)
  })

  it.each([0, 2])(
    'defers a transient failure after %s fast retries',
    async (maxRetries) => {
      const { plugin } = createTestNodePlugin({
        maxRetries,
        maxEventsInBatch: 1,
      })
      for (let i = 0; i <= maxRetries; i++)
        fetcher.mockReturnValueOnce(createError({ status: 503 }))
      fetcher.mockRejectedValueOnce(new Error('Connection Error'))
      const ctx = new Context(eventFactory.alias('my', 'from'))
      const sent = plugin.alias(ctx)
      await jest.advanceTimersByTimeAsync(15000)
      expect(await sent).toBe(ctx)
      expect(ctx.failedDelivery()).toBeUndefined()
      expect(fetcher).toHaveBeenCalledTimes(maxRetries + 3)
    }
  )
})

describe('http_request emitter event', () => {
  it('should emit an http_request object', async () => {
    const { plugin: hightouchPlugin } = createTestNodePlugin({
      maxEventsInBatch: 1,
    })

    fetcher.mockReturnValueOnce(createSuccess())
    const fn = jest.fn()
    emitter.on('http_request', fn)
    const context = new Context(
      eventFactory.track('foo', undefined, { userId: 'foo-user-id' })
    )
    await hightouchPlugin.track(context)
    assertHttpRequestEmittedEvent(fn.mock.lastCall[0])
  })
})
