import { Analytics } from '../../analytics'
import { HTTPCookieService } from '..'
import * as fetchLib from '../../../lib/fetch'

async function sleep(delayMS: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMS))
}

describe('HTTPCookieService', () => {
  it('handles different combinations of origin and url path', async () => {
    // HTTPCookieService constructor uses `new URL(path, origin).href to normalize URLs

    // if the user passes a slash prefix
    expect(
      HTTPCookieService.urlHelper({
        renewUrl: '/renew',
        clearUrl: '/clear',
      }).renewUrl
    ).toEqual('http://localhost/renew')

    // if the user passes no slash prefix
    expect(
      HTTPCookieService.urlHelper({
        renewUrl: 'renew',
        clearUrl: 'clear',
      }).renewUrl
    ).toEqual('http://localhost/renew')

    // if the user omits all slashes
    expect(
      HTTPCookieService.urlHelper({
        renewUrl: 'renew',
        clearUrl: 'clear',
      }).renewUrl
    ).toEqual('http://localhost/renew')

    // if the user passes a full URL to the renewUrl, that will be used as the renewUrl
    expect(
      HTTPCookieService.urlHelper({
        renewUrl: 'http://localhost:808/renew',
        clearUrl: '/clear',
      }).renewUrl
    ).toEqual('http://localhost:808/renew')
  })

  it('renews cookie on load', async () => {
    const spy = jest.spyOn(fetchLib, 'fetch')
    spy.mockImplementation(
      jest.fn(() => Promise.resolve({ ok: true })) as jest.Mock
    )

    await HTTPCookieService.load({
      renewUrl: 'ht/renewtest',
      clearUrl: 'ht/cleartest',
    })

    expect(spy).toHaveBeenCalledWith('http://localhost/ht/renewtest', {
      body: expect.anything(),
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      method: 'post',
    })
    spy.mockRestore()
  })

  it('renews cookie on load, with retries', async () => {
    const spy = jest.spyOn(fetchLib, 'fetch')
    spy.mockImplementation(
      jest.fn(() =>
        Promise.resolve({ status: 500, statusText: 'text', ok: false })
      ) as jest.Mock
    )

    await HTTPCookieService.load({
      renewUrl: 'ht/renewtest',
      clearUrl: 'ht/cleartest',
    })

    expect(spy).toHaveBeenCalledTimes(3)
    expect(spy.mock.calls[0]).toEqual([
      'http://localhost/ht/renewtest',
      expect.anything(),
    ])
    expect(spy.mock.calls[1]).toEqual([
      'http://localhost/ht/renewtest',
      expect.anything(),
    ])
    expect(spy.mock.calls[2]).toEqual([
      'http://localhost/ht/renewtest',
      expect.anything(),
    ])
    spy.mockRestore()
  })

  it('renews cookie on load, with retries set to 0', async () => {
    const spy = jest.spyOn(fetchLib, 'fetch')
    spy.mockImplementation(
      jest.fn(() =>
        Promise.resolve({ status: 500, statusText: 'text', ok: false })
      ) as jest.Mock
    )

    await HTTPCookieService.load({
      renewUrl: 'ht/renewtest',
      clearUrl: 'ht/cleartest',
      retries: 0,
    })

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]).toEqual([
      'http://localhost/ht/renewtest',
      expect.anything(),
    ])
    spy.mockRestore()
  })

  it('dispatches further cookie requests', async () => {
    const spy = jest.spyOn(fetchLib, 'fetch')
    spy.mockImplementation(
      jest.fn(() => Promise.resolve({ ok: true })) as jest.Mock
    )

    const cookieService = await HTTPCookieService.load({
      renewUrl: 'ht/renewtest',
      clearUrl: 'ht/cleartest',
      flushInterval: 10,
    })

    cookieService.dispatchCreate()

    await sleep(20).then(async () => {
      await expect(spy).toHaveBeenCalledTimes(2)
      // this one is from HTTPCookieService.load(...)
      expect(spy.mock.calls[0]).toEqual([
        'http://localhost/ht/renewtest',
        expect.anything(),
      ])
      // this one is from the dispatch
      expect(spy.mock.calls[1]).toEqual([
        'http://localhost/ht/renewtest',
        expect.anything(),
      ])
      spy.mockRestore()
    })
  })

  it('dispatches further cookie requests, in the order received', async () => {
    const spy = jest.spyOn(fetchLib, 'fetch')
    spy.mockImplementation(
      jest.fn(() => Promise.resolve({ ok: true })) as jest.Mock
    )

    const cookieService = await HTTPCookieService.load({
      renewUrl: 'ht/renewtest',
      clearUrl: 'ht/cleartest',
      flushInterval: 10,
    })

    cookieService.dispatchCreate()
    cookieService.dispatchClear()
    cookieService.dispatchClear()
    cookieService.dispatchCreate()
    cookieService.dispatchCreate()
    cookieService.dispatchClear()
    cookieService.dispatchCreate()
    cookieService.dispatchCreate()

    await sleep(20).then(async () => {
      await expect(spy).toHaveBeenCalledTimes(9)
      // this one is from HTTPCookieService.load(...)
      expect(spy.mock.calls[0]).toEqual([
        'http://localhost/ht/renewtest',
        expect.anything(),
      ])
      // these are from the dispatch
      expect(spy.mock.calls[1]).toEqual([
        'http://localhost/ht/renewtest',
        expect.anything(),
      ])
      expect(spy.mock.calls[2]).toEqual([
        'http://localhost/ht/cleartest',
        expect.anything(),
      ])
      expect(spy.mock.calls[3]).toEqual([
        'http://localhost/ht/cleartest',
        expect.anything(),
      ])
      expect(spy.mock.calls[4]).toEqual([
        'http://localhost/ht/renewtest',
        expect.anything(),
      ])
      expect(spy.mock.calls[5]).toEqual([
        'http://localhost/ht/renewtest',
        expect.anything(),
      ])
      expect(spy.mock.calls[6]).toEqual([
        'http://localhost/ht/cleartest',
        expect.anything(),
      ])
      expect(spy.mock.calls[7]).toEqual([
        'http://localhost/ht/renewtest',
        expect.anything(),
      ])
      expect(spy.mock.calls[8]).toEqual([
        'http://localhost/ht/renewtest',
        expect.anything(),
      ])
      spy.mockRestore()
    })
  })

  it('dispatches to a queue that can be stopped and started', async () => {
    const spy = jest.spyOn(fetchLib, 'fetch')
    spy.mockImplementation(
      jest.fn(() => Promise.resolve({ ok: true })) as jest.Mock
    )

    const cookieService = await HTTPCookieService.load({
      renewUrl: 'ht/renewtest',
      clearUrl: 'ht/cleartest',
      flushInterval: 10,
      retries: 0,
      backoff: 0,
    })

    cookieService.stopQueueConsumer()

    cookieService.dispatchClear()

    await sleep(20).then(async () => {
      // call from HTTPCookieService.load(...)
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0]).toEqual([
        'http://localhost/ht/renewtest',
        expect.anything(),
      ])
    })

    cookieService.startQueueConsumer()

    await sleep(20).then(async () => {
      // call from the queueConsumer
      expect(spy).toHaveBeenCalledTimes(2)
      expect(spy.mock.calls[1]).toEqual([
        'http://localhost/ht/cleartest',
        expect.anything(),
      ])
      spy.mockRestore()
    })
  })
})

let analytics: Analytics
let cookieService: HTTPCookieService
let fetchSpy: jest.SpyInstance

describe('Analytics - HTTPCookieService - Integration', () => {
  beforeEach(async () => {
    fetchSpy = jest.spyOn(fetchLib, 'fetch')
    fetchSpy.mockImplementation(
      jest.fn(() => Promise.resolve({ ok: true })) as jest.Mock
    )
    cookieService = await HTTPCookieService.load({
      renewUrl: 'ht/renewtest',
      clearUrl: 'ht/cleartest',
      flushInterval: 10,
      retries: 0,
      backoff: 0,
    })

    analytics = new Analytics(
      {
        writeKey: 'abc',
      },
      { httpCookieService: cookieService }
    )
    analytics.storage.clear('htjs_anonymous_id')
    analytics.storage.clear('htjs_user_id')
  })

  afterEach(async () => {
    analytics.storage.clear('htjs_anonymous_id')
    analytics.storage.clear('htjs_user_id')
  })

  it('does not stop normal functioning on wrong url', async () => {
    // this will not throw an error
    new Analytics(
      {
        writeKey: 'abc',
      },
      {
        httpCookieServiceOptions: {
          renewUrl: 'http::invalid://ht/renewtest',
          clearUrl: 'ht/cleartest',
        },
      }
    )
  })

  it('calls dispatchCreate() when calling anonymousId() for the first time', async () => {
    const spyCreate = jest.spyOn(cookieService, 'dispatchCreate')
    const spyClear = jest.spyOn(cookieService, 'dispatchClear')

    // we expect 1 call to dispatchCreate to create the anonymousId cookie
    // we don't expect to set the userId cookie
    await analytics.user().anonymousId()

    expect(spyClear).toHaveBeenCalledTimes(0)
    spyClear.mockRestore()

    expect(spyCreate).toHaveBeenCalledTimes(1)
    spyCreate.mockRestore()

    expect(analytics.storage.get('htjs_anonymous_id')).toBeTruthy()
    expect(analytics.storage.get('htjs_user_id')).toBe(null)
  })

  it('calls dispatchCreate() when calling track without a current user', async () => {
    const spyCreate = jest.spyOn(cookieService, 'dispatchCreate')
    const spyClear = jest.spyOn(cookieService, 'dispatchClear')

    // we expect 1 call to dispatchCreate through the anonymousId codepath
    // we dont expect to set a userId cookie
    await analytics.track('Checkout')

    expect(spyClear).toHaveBeenCalledTimes(0)
    spyClear.mockRestore()

    expect(spyCreate).toHaveBeenCalledTimes(1)
    spyCreate.mockRestore()

    expect(analytics.storage.get('htjs_anonymous_id')).toBeTruthy()
    expect(analytics.storage.get('htjs_user_id')).toBe(null)
  })

  it('calls dispatchCreate() when calling userId for the first time', async () => {
    const spyCreate = jest.spyOn(cookieService, 'dispatchCreate')
    const spyClear = jest.spyOn(cookieService, 'dispatchClear')

    // we expect 1 call to dispatchCreate through the userId codepath.
    // we dont expect to set an anonymousId cookie.
    await analytics.user().id('bob')

    expect(spyClear).toHaveBeenCalledTimes(0)
    spyClear.mockRestore()

    expect(spyCreate).toHaveBeenCalledTimes(1)
    spyCreate.mockRestore()

    expect(analytics.storage.get('htjs_anonymous_id')).toBe(null)
    expect(analytics.storage.get('htjs_user_id')).toBeTruthy()
  })

  it('calls dispatchCreate() when calling identify without a current user', async () => {
    const spyCreate = jest.spyOn(cookieService, 'dispatchCreate')
    const spyClear = jest.spyOn(cookieService, 'dispatchClear')

    // calling identify, means both anonymousId and userId are set.
    // these are two separate codepaths (that *could* be called independently).
    // therefore, we expect 2 calls to dispatchCreate.
    await analytics.identify('123')

    expect(spyClear).toHaveBeenCalledTimes(0)
    spyClear.mockRestore()

    expect(spyCreate).toHaveBeenCalledTimes(2)
    spyCreate.mockRestore()

    expect(analytics.storage.get('htjs_anonymous_id')).toBeTruthy()
    expect(analytics.storage.get('htjs_user_id')).toBeTruthy()
  })

  it('calls no additional dispatchCreate()s when calling track with a current user', async () => {
    const spyCreate = jest.spyOn(cookieService, 'dispatchCreate')
    const spyClear = jest.spyOn(cookieService, 'dispatchClear')

    // calling identify, means both anonymousId and userId are set,
    // therefore, we expect 2 calls to dispatchCreate (2 different code paths)
    await analytics.identify('123')

    expect(spyClear).toHaveBeenCalledTimes(0)
    expect(spyCreate).toHaveBeenCalledTimes(2)

    expect(analytics.storage.get('htjs_anonymous_id')).toBeTruthy()
    expect(analytics.storage.get('htjs_user_id')).toBeTruthy()

    // we expect NO ADDITIONAL dispatchCreates or dispatchClears
    await analytics.track('Checkout')

    expect(spyClear).toHaveBeenCalledTimes(0)
    spyClear.mockRestore()

    expect(spyCreate).toHaveBeenCalledTimes(2)
    spyCreate.mockRestore()

    expect(analytics.storage.get('htjs_anonymous_id')).toBeTruthy()
    expect(analytics.storage.get('htjs_user_id')).toBeTruthy()
  })

  it('calls dispatchClear() when manually clearing anonymousId()', async () => {
    await analytics.user().anonymousId()
    expect(analytics.storage.get('htjs_anonymous_id')).toBeTruthy()
    expect(analytics.storage.get('htjs_user_id')).toBe(null)

    const spyCreate = jest.spyOn(cookieService, 'dispatchCreate')
    const spyClear = jest.spyOn(cookieService, 'dispatchClear')

    // we expect 1 call to dispatchClear
    await analytics.user().anonymousId(null)

    expect(spyClear).toHaveBeenCalledTimes(1)
    spyClear.mockRestore()

    expect(spyCreate).toHaveBeenCalledTimes(0)
    spyCreate.mockRestore()

    expect(analytics.storage.get('htjs_user_id')).toBe(null)
    expect(analytics.storage.get('htjs_anonymous_id')).toBe(null)
  })

  it('calls dispatchClear() when manually clearing userId()', async () => {
    await analytics.user().id('bob')
    expect(analytics.storage.get('htjs_anonymous_id')).toBe(null)
    expect(analytics.storage.get('htjs_user_id')).toBeTruthy()

    const spyCreate = jest.spyOn(cookieService, 'dispatchCreate')
    const spyClear = jest.spyOn(cookieService, 'dispatchClear')

    // we expect 1 call to dispatchClear
    await analytics.user().id(null)

    expect(spyClear).toHaveBeenCalledTimes(1)
    spyClear.mockRestore()

    expect(spyCreate).toHaveBeenCalledTimes(0)
    spyCreate.mockRestore()

    expect(analytics.storage.get('htjs_user_id')).toBe(null)
    expect(analytics.storage.get('htjs_anonymous_id')).toBe(null)
  })

  it('calls dispatchClear() when reseting the user info', async () => {
    await analytics.user().id('bob')
    await analytics.user().anonymousId()
    expect(analytics.storage.get('htjs_anonymous_id')).toBeTruthy()
    expect(analytics.storage.get('htjs_user_id')).toBeTruthy()

    const spyCreate = jest.spyOn(cookieService, 'dispatchCreate')
    const spyClear = jest.spyOn(cookieService, 'dispatchClear')

    // we expect 2 calls to dispatchClear
    // we have to call both codepaths for clearing anonymousId and userId
    await analytics.reset()

    expect(spyClear).toHaveBeenCalledTimes(2)
    spyClear.mockRestore()

    expect(spyCreate).toHaveBeenCalledTimes(0)
    spyCreate.mockRestore()

    expect(analytics.storage.get('htjs_user_id')).toBe(null)
    expect(analytics.storage.get('htjs_anonymous_id')).toBe(null)
  })

  it('calls dispatchClear() when reseting the user info--even with no pre-existing user', async () => {
    expect(analytics.storage.get('htjs_anonymous_id')).toBe(null)
    expect(analytics.storage.get('htjs_user_id')).toBe(null)

    const spyCreate = jest.spyOn(cookieService, 'dispatchCreate')
    const spyClear = jest.spyOn(cookieService, 'dispatchClear')

    // we expect 2 calls to dispatchClear
    // we have to call both codepaths for clearing anonymousId and userId
    await analytics.reset()

    expect(spyClear).toHaveBeenCalledTimes(2)
    spyClear.mockRestore()

    expect(spyCreate).toHaveBeenCalledTimes(0)
    spyCreate.mockRestore()

    expect(analytics.storage.get('htjs_user_id')).toBe(null)
    expect(analytics.storage.get('htjs_anonymous_id')).toBe(null)
  })

  it('calls dispatch methods when changing the identity of a user', async () => {
    await analytics.user().id('bob')
    await analytics.user().anonymousId()
    expect(analytics.storage.get('htjs_anonymous_id')).toBeTruthy()
    expect(analytics.storage.get('htjs_user_id')).toBeTruthy()

    const spyCreate = jest.spyOn(cookieService, 'dispatchCreate')
    const spyClear = jest.spyOn(cookieService, 'dispatchClear')

    // we expect 1 call to dispatchClear
    // we expect 1 call to dispatchCreate
    // they should happen in this order
    await analytics.user().id('tim')

    expect(spyClear).toHaveBeenCalledTimes(1)
    spyClear.mockRestore()

    expect(spyCreate).toHaveBeenCalledTimes(1)
    spyCreate.mockRestore()

    // we expect that the dispatchClear comes before the dispatchCreate
    await sleep(30).then(async () => {
      // these are our last two dispatch calls (ignore setup stuff)
      expect(fetchSpy.mock.calls[fetchSpy.mock.calls.length - 2]).toEqual([
        'http://localhost/ht/cleartest',
        expect.anything(),
      ])
      expect(fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1]).toEqual([
        'http://localhost/ht/renewtest',
        expect.anything(),
      ])
    })

    expect(analytics.storage.get('htjs_user_id')).toBeTruthy()
    // pre-existing behavior clears anonymousId when changing userId.
    // can use analytics.alias('bob', 'tim') if customer-dev wants to workaround this
    expect(analytics.storage.get('htjs_anonymous_id')).toBe(null)
  })

  it('calls dispatchCreate() when migrating anonymousId from segment', async () => {
    const spyCreate = jest.spyOn(cookieService, 'dispatchCreate')
    const spyClear = jest.spyOn(cookieService, 'dispatchClear')

    analytics.storage.set('ajs_anonymous_id', '456-789')
    analytics.storage.set('ajs_user_id', 'timothy')

    // we expect 1 call to dispatchCreate
    await analytics.track('Checkout')

    expect(spyClear).toHaveBeenCalledTimes(0)
    spyClear.mockRestore()

    expect(spyCreate).toHaveBeenCalledTimes(1)
    spyCreate.mockRestore()

    expect(analytics.storage.get('htjs_anonymous_id')).toBe('456-789')
    // pre-existing behavior is to not migrate the userId
    expect(analytics.storage.get('htjs_user_id')).toBe(null)

    analytics.storage.clear('ajs_anonymous_id')
    analytics.storage.clear('ajs_user_id')
  })
})
