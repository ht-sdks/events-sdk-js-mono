import unfetch from 'unfetch'
import { hightouchio, HightouchioSettings } from '..'
import { Analytics } from '../../../core/analytics'
import { Context } from '../../../core/context'
import { createDeferred } from '../../../lib/create-deferred'

jest.mock('unfetch', () => jest.fn())

describe('Hightouch.io pagehide delivery', () => {
  const fetch = jest.mocked(unfetch)
  const response = { ok: true } as Response
  let listeners: Array<
    [EventTarget, string, EventListenerOrEventListenerObject]
  >

  function client(
    deliveryStrategy?: HightouchioSettings['deliveryStrategy'],
    retryQueue = true,
    analytics = new Analytics({ writeKey: 'pagehide' }, { retryQueue })
  ) {
    return hightouchio(analytics, { apiKey: 'pagehide', deliveryStrategy })
  }

  function event(messageId = 'message') {
    return new Context({
      type: 'track',
      event: 'test',
      messageId,
      timestamp: new Date(),
    })
  }

  function requestIds() {
    return fetch.mock.calls.map(([, init]) => {
      const body = JSON.parse(init!.body as string)
      return (body.batch ?? [body]).map(
        (item: { messageId: string }) => item.messageId
      )
    })
  }

  beforeEach(() => {
    jest.useFakeTimers()
    fetch.mockReset().mockResolvedValue(response)
    localStorage.clear()
    listeners = []
    for (const target of [window, document] as EventTarget[]) {
      const addEventListener = target.addEventListener.bind(target)
      jest
        .spyOn(target, 'addEventListener')
        .mockImplementation((type, listener) => {
          if (listener) listeners.push([target, type, listener])
          addEventListener(type, listener)
        })
    }
  })

  afterEach(() => {
    for (const [target, type, listener] of listeners) {
      target.removeEventListener(type, listener)
    }
    jest.restoreAllMocks()
    jest.clearAllTimers()
    jest.useRealTimers()
    localStorage.clear()
  })

  it.each([408, 429, 503, 522])(
    'retries a live HTTP %s response',
    async (status) => {
      fetch.mockResolvedValueOnce({ ok: false, status } as Response)
      await client().track!(event())
      await jest.advanceTimersByTimeAsync(5000)
      expect(requestIds()).toEqual([['message'], ['message']])
    }
  )

  it('does not retry a transient HTTP response when retries are disabled', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 503 } as Response)
    const ctx = event()
    await client(undefined, false).track!(ctx)
    await jest.advanceTimersByTimeAsync(60000)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(ctx.failedDelivery()?.reason).toContain('HTTP 503')
  })

  it('completes a buffered track before the batch timer and retries its HTTP failure', async () => {
    const analytics = new Analytics(
      { writeKey: 'pagehide' },
      { retryQueue: true }
    )
    await analytics.register(
      client(
        { strategy: 'batching', config: { timeout: 1000 } },
        true,
        analytics
      )
    )
    fetch.mockResolvedValueOnce({ ok: false, status: 503 } as Response)
    const tracked = analytics.track('buffered')
    await jest.advanceTimersByTimeAsync(50)
    const ctx = await tracked
    expect(fetch).not.toHaveBeenCalled()
    await jest.advanceTimersByTimeAsync(10000)
    expect(requestIds()).toEqual([[ctx.event.messageId], [ctx.event.messageId]])
  })

  it.each([401, 403, 404])(
    'completes a live HTTP %s without retry',
    async (status) => {
      fetch.mockResolvedValueOnce({ ok: false, status } as Response)
      const ctx = event()
      const sent = client().track!(ctx)
      window.dispatchEvent(new Event('pagehide'))
      await sent
      client()
      await jest.advanceTimersByTimeAsync(60000)
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(ctx.failedDelivery()).toBeFalsy()
    }
  )

  it.each([200, 401, 403, 404])(
    'finishes deferred delivery after HTTP %s',
    async (status) => {
      fetch.mockResolvedValue({ ok: false, status: 503 } as Response)
      const ctx = event()
      await client().track!(ctx)
      await jest.advanceTimersByTimeAsync(300000)
      expect(fetch.mock.calls.length).toBeGreaterThan(5)
      expect(ctx.failedDelivery()).toBeFalsy()
      window.dispatchEvent(new Event('pagehide'))
      fetch.mockResolvedValue({ ok: status === 200, status } as Response)
      const count = fetch.mock.calls.length
      await jest.advanceTimersByTimeAsync(120000)
      client()
      await jest.advanceTimersByTimeAsync(5000)
      expect(requestIds()).toEqual(Array(count + 1).fill(['message']))
    }
  )

  it.each([false, true])(
    'preserves deferred identity (reload=%s)',
    async (reload) => {
      const analytics = new Analytics(
        { writeKey: 'pagehide' },
        { retryQueue: true }
      )
      analytics.reset()
      analytics.setAnonymousId('original')
      const original = client(undefined, true, analytics)
      fetch.mockResolvedValue({ ok: false, status: 503 } as Response)
      await original.track!(event('first'))
      await jest.advanceTimersByTimeAsync(300000)
      await original.track!(event('second'))
      analytics.user().id('later-user')
      analytics.setAnonymousId('later-anonymous')
      if (reload) {
        window.dispatchEvent(new Event('pagehide'))
        jest.clearAllTimers()
        client()
      }
      fetch.mockClear().mockResolvedValue(response)
      await jest.advanceTimersByTimeAsync(120000)
      expect(requestIds().flat().sort()).toEqual(['first', 'second'])
      for (const [, init] of fetch.mock.calls) {
        expect(JSON.parse(init!.body as string)).toMatchObject({
          anonymousId: 'original',
          userId: null,
        })
      }
      analytics.reset()
    }
  )

  it('reports the rejected message and clears its checkpoint', async () => {
    const request = createDeferred<Response>()
    fetch.mockReturnValueOnce(request.promise)
    const ctx = event('rejected')
    const sent = client().track!(ctx)
    window.dispatchEvent(new Event('pagehide'))
    request.resolve({ ok: false, status: 400 } as Response)
    await sent
    expect(ctx.failedDelivery()?.reason).toEqual(
      'HTTP 400 for message rejected'
    )
    client()
    await jest.advanceTimersByTimeAsync(5000)
    expect(requestIds()).toEqual([['rejected']])
  })

  it('bounds deferred events and drains them one at a time past a failing event', async () => {
    fetch.mockResolvedValue({ ok: false, status: 503 } as Response)
    const dest = client()
    await dest.track!(event('failing'))
    await jest.advanceTimersByTimeAsync(300000)
    for (let i = 1; i < 100; i++) await dest.track!(event(String(i)))
    const overflow = event('overflow')
    await dest.track!(overflow)
    expect(overflow.failedDelivery()?.reason).toContain('queue is full')

    const pending = createDeferred<Response>()
    fetch
      .mockClear()
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue(response)
    await jest.advanceTimersByTimeAsync(180000)
    expect(requestIds()).toEqual([['failing'], ['1']])
    pending.resolve(response)
    await jest.advanceTimersByTimeAsync(1000)
    expect(requestIds()).toEqual([['failing'], ['1'], ['2']])
  })

  it.each([false, true])(
    'does not replay an acknowledged request after pagehide (persisted=%s)',
    async (persisted) => {
      const request = createDeferred<Response>()
      fetch.mockReturnValueOnce(request.promise)
      const original = client({ config: { keepalive: true } })
      const sent = original.track!(event())

      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted }))
      request.resolve(response)
      await sent
      await jest.advanceTimersByTimeAsync(0)

      client()
      await jest.advanceTimersByTimeAsync(5000)
      // A restored page must not save the acknowledged event again either.
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted }))
      client()
      await jest.advanceTimersByTimeAsync(5000)

      expect(fetch).toHaveBeenCalledTimes(1)
    }
  )

  it.each(['uncontended', 'acknowledgment first', 'checkpoint first'])(
    'preserves only undelivered snapshot events (%s)',
    async (order) => {
      const request = createDeferred<Response>()
      fetch.mockReturnValueOnce(request.promise)
      fetch.mockReturnValueOnce(createDeferred<Response>().promise)
      const original = client({ config: { keepalive: true } })
      const sent = original.track!(event('acknowledged'))
      void original.track!(event('pending'))

      const lockKey = 'persisted-queue:v1:pagehide:dest-Hightouch.io:lock'
      if (order !== 'uncontended') {
        localStorage.setItem(lockKey, JSON.stringify(Date.now() + 1000))
      }
      window.dispatchEvent(
        new PageTransitionEvent('pagehide', { persisted: true })
      )
      // Release the other tab's lock while the checkpoint awaits its retry.
      localStorage.removeItem(lockKey)
      if (order === 'checkpoint first') await jest.advanceTimersByTimeAsync(50)

      request.resolve(response)
      await sent
      await jest.advanceTimersByTimeAsync(50)
      client()
      await jest.advanceTimersByTimeAsync(5000)

      expect(requestIds()).toEqual([['acknowledged'], ['pending'], ['pending']])
    }
  )

  it.each([false, true])(
    'bounds recovery attempts across page loads (retryQueue=%s)',
    async (retryQueue) => {
      fetch.mockReturnValue(createDeferred<Response>().promise)
      void client(undefined, retryQueue).track!(event())

      for (let page = 0; page < 8; page++) {
        window.dispatchEvent(new Event('pagehide'))
        for (const [target, type, listener] of listeners.splice(0)) {
          target.removeEventListener(type, listener)
        }
        client(undefined, retryQueue)
        await jest.advanceTimersByTimeAsync(5000)
      }

      expect(requestIds()).toEqual(Array(retryQueue ? 5 : 2).fill(['message']))
    }
  )

  it('retains a recovery snapshot until a network retry succeeds', async () => {
    fetch.mockRejectedValueOnce(new TypeError('Network error'))
    const sent = client(undefined, false).track!(event())
    window.dispatchEvent(new Event('pagehide'))
    await sent
    expect(
      localStorage.getItem(
        'persisted-queue:v1:pagehide:dest-Hightouch.io:items'
      )
    ).toContain('"messageId":"message"')
    await jest.advanceTimersByTimeAsync(10000)
    expect(requestIds()).toEqual([['message'], ['message']])
    client()
    await jest.advanceTimersByTimeAsync(5000)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
