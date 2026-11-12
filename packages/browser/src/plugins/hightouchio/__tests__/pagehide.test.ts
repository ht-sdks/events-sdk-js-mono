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

  function client(deliveryStrategy?: HightouchioSettings['deliveryStrategy']) {
    return hightouchio(
      new Analytics({ writeKey: 'pagehide' }, { retryQueue: true }),
      { apiKey: 'pagehide', deliveryStrategy }
    )
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

  function failNextRequest(failure: 'network error' | 503) {
    if (failure === 'network error') {
      fetch.mockRejectedValueOnce(new TypeError('Network error'))
    } else {
      fetch.mockResolvedValueOnce({ ok: false, status: failure } as Response)
    }
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

  it.each([
    ['standard', false],
    ['standard', true],
    ['batching', false],
    ['batching', true],
  ] as const)(
    'does not replay an acknowledged %s request after pagehide (persisted=%s)',
    async (strategy, persisted) => {
      const request = createDeferred<Response>()
      fetch.mockReturnValueOnce(request.promise)
      const original = client(
        strategy === 'batching' ? { strategy } : { config: { keepalive: true } }
      )
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

  it.each(['network error', 503] as const)(
    'retains a recovery snapshot until retry succeeds (%s)',
    async (failure) => {
      failNextRequest(failure)
      const sent = client().track!(event())
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
    }
  )

  it.each([
    [408, 2],
    [429, 2],
    [500, 2],
    [503, 2],
    [599, 2],
    [400, 1],
    [401, 1],
    [403, 1],
    [413, 1],
    [422, 1],
  ])('HTTP %s results in %s send attempts', async (status, attempts) => {
    fetch.mockResolvedValueOnce({ ok: false, status } as Response)
    await client().track!(event())
    await jest.advanceTimersByTimeAsync(10000)

    expect(requestIds()).toEqual(Array(attempts).fill(['message']))
  })

  it('bounds repeated HTTP retries using the existing attempt limit', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5)
    fetch.mockResolvedValue({ ok: false, status: 503 } as Response)
    await client().track!(event())
    await jest.advanceTimersByTimeAsync(60000)

    expect(fetch).toHaveBeenCalledTimes(5)
    expect(jest.getTimerCount()).toBe(0)
  })

  it.each([
    ['pagehide', 'network error'],
    ['visibilitychange', 503],
  ] as const)('retries every event after %s with %s', async (type, failure) => {
    failNextRequest(failure)
    const original = client({ strategy: 'batching' })
    await original.track!(event('first'))
    await original.track!(event('second'))
    jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const target = type === 'pagehide' ? window : document
    target.dispatchEvent(new Event(type))
    await jest.advanceTimersByTimeAsync(15000)

    expect(requestIds()).toEqual([['first', 'second'], ['first'], ['second']])

    client()
    await jest.advanceTimersByTimeAsync(5000)
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it.each(['network error', 503] as const)(
    'retries only the failed chunk of a lifecycle flush (%s)',
    async (failure) => {
      fetch.mockResolvedValueOnce(response)
      failNextRequest(failure)
      const original = client({ strategy: 'batching' })
      for (const messageId of ['first', 'second', 'third']) {
        const ctx = event(messageId)
        ctx.event.properties = { padding: 'x'.repeat(40000) }
        await original.track!(ctx)
      }
      window.dispatchEvent(new Event('pagehide'))
      await jest.advanceTimersByTimeAsync(15000)

      expect(requestIds()).toEqual([['first', 'second'], ['third'], ['third']])
      client()
      await jest.advanceTimersByTimeAsync(5000)
      expect(fetch).toHaveBeenCalledTimes(3)
    }
  )
})
