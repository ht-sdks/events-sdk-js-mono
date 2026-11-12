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

  it('replays an unacknowledged keepalive request after pagehide', async () => {
    fetch.mockReturnValueOnce(createDeferred<Response>().promise)
    const original = client({ config: { keepalive: true } })
    void original.track!(event())
    window.dispatchEvent(
      new PageTransitionEvent('pagehide', { persisted: true })
    )

    client()
    await jest.advanceTimersByTimeAsync(5000)

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(
      fetch.mock.calls.map(
        ([, init]) => JSON.parse(init!.body as string).messageId
      )
    ).toEqual(['message', 'message'])
  })

  it('acknowledges only the delivered event in a recovery snapshot', async () => {
    const request = createDeferred<Response>()
    fetch.mockReturnValueOnce(request.promise)
    fetch.mockReturnValueOnce(createDeferred<Response>().promise)
    const original = client()
    const sent = original.track!(event('acknowledged'))
    void original.track!(event('pending'))
    window.dispatchEvent(new Event('pagehide'))
    request.resolve(response)
    await sent

    client()
    await jest.advanceTimersByTimeAsync(5000)
    expect(
      fetch.mock.calls.map(
        ([, init]) => JSON.parse(init!.body as string).messageId
      )
    ).toEqual(['acknowledged', 'pending', 'pending'])
  })

  it('does not acknowledge an unsuccessful HTTP response', async () => {
    const request = createDeferred<Response>()
    fetch.mockReturnValueOnce(request.promise)
    const original = client()
    const sent = original.track!(event())
    window.dispatchEvent(new Event('pagehide'))
    request.resolve({ ok: false, status: 503 } as Response)
    await sent

    client()
    await jest.advanceTimersByTimeAsync(5000)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('retries a rejected request without leaving a successful retry to replay', async () => {
    const request = createDeferred<Response>()
    fetch.mockReturnValueOnce(request.promise)
    const original = client()
    const sent = original.track!(event())
    window.dispatchEvent(new Event('pagehide'))
    request.reject(new TypeError('Network error'))
    await sent
    await jest.advanceTimersByTimeAsync(10000)

    expect(fetch).toHaveBeenCalledTimes(2)
    client()
    await jest.advanceTimersByTimeAsync(5000)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('retries every event in a failed lifecycle batch', async () => {
    const request = createDeferred<Response>()
    fetch.mockReturnValueOnce(request.promise)
    const original = client({ strategy: 'batching' })
    await original.track!(event('first'))
    await original.track!(event('second'))
    window.dispatchEvent(new Event('pagehide'))
    request.reject(new TypeError('Network error'))
    await jest.advanceTimersByTimeAsync(15000)

    expect(fetch).toHaveBeenCalledTimes(3)
    expect(
      fetch.mock.calls.map(([, init]) =>
        JSON.parse(init!.body as string).batch.map(
          (item: { messageId: string }) => item.messageId
        )
      )
    ).toEqual([['first', 'second'], ['first'], ['second']])

    client()
    await jest.advanceTimersByTimeAsync(5000)
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('retries only the failed chunk of a lifecycle flush', async () => {
    fetch.mockResolvedValueOnce(response)
    fetch.mockRejectedValueOnce(new TypeError('Network error'))
    const original = client({ strategy: 'batching' })
    for (const messageId of ['first', 'second', 'third']) {
      const ctx = event(messageId)
      ctx.event.properties = { padding: 'x'.repeat(40000) }
      await original.track!(ctx)
    }
    window.dispatchEvent(new Event('pagehide'))
    await jest.advanceTimersByTimeAsync(15000)

    expect(
      fetch.mock.calls.map(([, init]) =>
        JSON.parse(init!.body as string).batch.map(
          (item: { messageId: string }) => item.messageId
        )
      )
    ).toEqual([['first', 'second'], ['third'], ['third']])
    client()
    await jest.advanceTimersByTimeAsync(5000)
    expect(fetch).toHaveBeenCalledTimes(3)
  })
})
