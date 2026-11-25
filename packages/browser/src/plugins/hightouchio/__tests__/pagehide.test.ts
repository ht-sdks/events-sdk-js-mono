import unfetch from 'unfetch'
import { PriorityQueue } from '../../../lib/priority-queue'
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

  async function exhaustRetries(dest: ReturnType<typeof client>, ctx: Context) {
    fetch.mockResolvedValue({ ok: false, status: 503 } as Response)
    await dest.track!(ctx)
    await jest.advanceTimersByTimeAsync(300000)
  }

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
      const ctx = event()
      await exhaustRetries(client(), ctx)
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
      await exhaustRetries(original, event('first'))
      await original.track!(event('second'))
      analytics.user().id('later-user')
      analytics.setAnonymousId('later-anonymous')
      if (reload) navigate()
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

  function navigate() {
    window.dispatchEvent(new Event('pagehide'))
    for (const [target, type, listener] of listeners)
      target.removeEventListener(type, listener)
    listeners = []
    const now = Date.now()
    jest.clearAllTimers()
    jest.setSystemTime(now)
    return client()
  }

  it('restores the remaining source cooldown for saved and fresh work', async () => {
    const dest = client()
    await exhaustRetries(dest, event('A'))
    const probe = createDeferred<Response>()
    fetch.mockReturnValueOnce(probe.promise)
    await jest.advanceTimersByTimeAsync(60000)
    await dest.track!(event('B'))
    probe.resolve({ ok: false, status: 429 } as Response)
    await jest.advanceTimersByTimeAsync(10000)
    fetch.mockClear().mockResolvedValue(response)
    const restored = navigate()
    await restored.track!(event('C'))
    await jest.advanceTimersByTimeAsync(49999)
    expect(fetch).not.toHaveBeenCalled()
    await jest.advanceTimersByTimeAsync(10)
    expect(requestIds().flat().sort()).toEqual(['A', 'B', 'C'])
  })

  it('checkpoints a deferred replay interrupted by a second navigation', async () => {
    await exhaustRetries(client(), event('deferred'))
    fetch.mockClear().mockReturnValueOnce(createDeferred<Response>().promise)
    navigate()
    await jest.advanceTimersByTimeAsync(60000)
    expect(requestIds()).toEqual([['deferred']])
    fetch.mockResolvedValue(response)
    navigate()
    await jest.advanceTimersByTimeAsync(5000)
    expect(requestIds()).toEqual([['deferred'], ['deferred']])
  })

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

  it.each(['standard', 'batching'] as const)(
    'holds both events through the source cooldown with %s delivery',
    async (strategy) => {
      const dest = client(
        strategy === 'batching' ? { strategy, config: { size: 1 } } : undefined
      )
      await exhaustRetries(dest, event('failing'))

      const probe = createDeferred<Response>()
      fetch
        .mockClear()
        .mockReturnValueOnce(probe.promise)
        .mockResolvedValue(response)
      await jest.advanceTimersByTimeAsync(60000)
      await dest.track!(event('healthy'))
      probe.resolve({ ok: false, status: 429 } as Response)

      await jest.advanceTimersByTimeAsync(59999)
      expect(requestIds()).toEqual([['failing']])
      await jest.advanceTimersByTimeAsync(1)
      expect(requestIds()).toEqual([['failing'], ['healthy']])
      await jest.advanceTimersByTimeAsync(1000)
      expect(requestIds()).toEqual([['failing'], ['healthy'], ['failing']])
    }
  )

  it.each(['timer', 'pagehide'])(
    'defers a partial batch when a cooldown begins before its %s flush',
    async (trigger) => {
      jest
        .spyOn(PriorityQueue.prototype, 'pushWithBackoff')
        .mockReturnValue(false)
      const dest = client({
        strategy: 'batching',
        config: { size: 2, timeout: 100 },
      })
      const lastAttempt = createDeferred<Response>()
      fetch.mockReturnValueOnce(lastAttempt.promise)
      await dest.track!(event('A'))
      await jest.advanceTimersByTimeAsync(100)
      await dest.track!(event('B'))
      lastAttempt.resolve({ ok: false, status: 429 } as Response)
      await jest.advanceTimersByTimeAsync(0)
      if (trigger === 'pagehide') window.dispatchEvent(new Event('pagehide'))
      await jest.advanceTimersByTimeAsync(999)
      expect(requestIds()).toEqual([['A']])
      await jest.advanceTimersByTimeAsync(1001)
      expect(requestIds()).toEqual([['A'], ['A'], ['B']])
    }
  )

  it('bounds deferred events and drains them one at a time past a failing event', async () => {
    const dest = client()
    await exhaustRetries(dest, event('failing'))
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
    await jest.advanceTimersByTimeAsync(200)
    expect(requestIds().flat()).toEqual([
      'failing',
      ...Array.from({ length: 99 }, (_, i) => String(i + 1)),
      'failing',
    ])
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
