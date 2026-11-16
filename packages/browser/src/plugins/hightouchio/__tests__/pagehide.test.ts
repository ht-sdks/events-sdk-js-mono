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
    retryQueue = true
  ) {
    return hightouchio(
      new Analytics({ writeKey: 'pagehide' }, { retryQueue }),
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
