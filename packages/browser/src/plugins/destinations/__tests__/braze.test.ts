import * as BrazeSdk from '@braze/web-sdk'
import { HtEventsBrowser } from '../../../browser'
import { Context } from '../../../core/context'
import type { DestinationPlugin } from '../../../core/plugin'
import brazeDestination from '../braze'

jest.mock('@braze/web-sdk', () => {
  const setter = () => jest.fn(() => true)
  const user = {
    setFirstName: setter(),
    setLastName: setter(),
    setEmail: setter(),
    setPhoneNumber: setter(),
    setGender: setter(),
    setDateOfBirth: setter(),
    setHomeCity: setter(),
    setCountry: setter(),
    setEmailNotificationSubscriptionType: setter(),
    setPushNotificationSubscriptionType: setter(),
    setCustomUserAttribute: setter(),
  }
  return {
    __esModule: true,
    initialize: jest.fn(() => true),
    automaticallyShowInAppMessages: jest.fn(),
    openSession: jest.fn(),
    changeUser: jest.fn(),
    getUser: jest.fn(() => user),
    logCustomEvent: jest.fn(() => true),
    logPurchase: jest.fn(() => true),
  }
})

const braze = jest.mocked(BrazeSdk)
const user = jest.mocked(BrazeSdk.getUser()!)

const setup = async (settings = {}, currentUserId?: string) => {
  let onReady!: jest.Mock
  const ready = new Promise((resolve) => {
    onReady = jest.fn(resolve)
  })
  const plugin = brazeDestination({
    apiKey: 'API_KEY',
    baseUrl: 'sdk.iad-03.braze.com',
    sdk: () => import('@braze/web-sdk'),
    onReady,
    ...settings,
  })
  const analytics = { user: () => ({ id: () => currentUserId }), on: jest.fn() }
  await (plugin as DestinationPlugin).load(
    new Context({ type: 'track' }),
    analytics as any
  )
  return { plugin, ready, onReady, analytics }
}

const identify = (userId: string | undefined, traits: object) =>
  new Context({ type: 'identify', userId, traits })

const track = (event: string, properties: object = {}) =>
  new Context({ type: 'track', event, properties })

beforeEach(() => {
  jest.clearAllMocks()
  localStorage.clear()
})

describe('Braze destination startup', () => {
  it('initializes Braze and opens the session after onReady', async () => {
    const { ready, onReady } = await setup({
      sessionTimeoutInSeconds: 60,
      initOptions: { enableLogging: true },
    })
    await ready

    expect(braze.initialize).toHaveBeenCalledWith('API_KEY', {
      enableLogging: true,
      sessionTimeoutInSeconds: 60,
      baseUrl: 'sdk.iad-03.braze.com',
    })
    expect(braze.automaticallyShowInAppMessages).toHaveBeenCalled()
    expect(onReady).toHaveBeenCalledWith(braze)
    expect(onReady.mock.invocationCallOrder[0]).toBeLessThan(
      braze.openSession.mock.invocationCallOrder[0]
    )
  })

  it('can leave in-app message display to the customer', async () => {
    const { ready } = await setup({ automaticallyShowInAppMessages: false })
    await ready

    expect(braze.automaticallyShowInAppMessages).not.toHaveBeenCalled()
    expect(braze.openSession).toHaveBeenCalled()
  })

  it('uses a customer-provided instance without initializing it', async () => {
    const { plugin, ready, onReady } = await setup({
      apiKey: undefined,
      sdk: undefined,
      instance: braze,
    })
    await ready
    await plugin.track(track('Clicked'))

    expect(onReady).toHaveBeenCalledWith(braze)
    expect(braze.initialize).not.toHaveBeenCalled()
    expect(braze.openSession).not.toHaveBeenCalled()
    expect(braze.logCustomEvent).toHaveBeenCalledWith('Clicked', {})
  })

  it('changes to the current user before opening the session', async () => {
    const { ready } = await setup({}, 'user-1')
    await ready

    expect(braze.changeUser).toHaveBeenCalledWith('user-1')
    expect(braze.changeUser.mock.invocationCallOrder[0]).toBeLessThan(
      braze.openSession.mock.invocationCallOrder[0]
    )
  })

  it('queues events until Braze is ready, then replays them in order', async () => {
    let resolve!: (sdk: typeof braze) => void
    const { plugin, ready } = await setup({
      sdk: () => new Promise((r) => (resolve = r)),
    })

    await plugin.track(track('First'))
    await plugin.track(track('Second'))
    expect(plugin.isLoaded()).toBe(false)
    expect(braze.logCustomEvent).not.toHaveBeenCalled()

    resolve(braze)
    await ready

    expect(plugin.isLoaded()).toBe(true)
    expect(braze.logCustomEvent.mock.calls).toEqual([
      ['First', {}],
      ['Second', {}],
    ])
  })

  it('drops events without throwing when Braze fails to load', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const { plugin } = await setup({
      sdk: () => Promise.reject(new Error('blocked')),
    })
    await new Promise((r) => setTimeout(r, 0))

    await expect(plugin.track(track('Clicked'))).resolves.toBeDefined()
    expect(plugin.isLoaded()).toBe(false)
    expect(braze.logCustomEvent).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
  })

  it('does not throw when a Braze call throws', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    const { plugin, ready } = await setup()
    await ready
    braze.logCustomEvent.mockImplementationOnce(() => {
      throw new Error('boom')
    })

    await expect(plugin.track(track('Clicked'))).resolves.toBeDefined()
  })
})

describe('Braze destination identify', () => {
  it('calls changeUser only when the userId changes', async () => {
    const { plugin, ready } = await setup()
    await ready

    await plugin.identify(identify('user-1', {}))
    await plugin.identify(identify('user-1', {}))
    await plugin.identify(identify(undefined, {}))
    await plugin.identify(identify('user-2', {}))

    expect(braze.changeUser.mock.calls).toEqual([['user-1'], ['user-2']])
  })

  it('maps reserved traits and their Braze names', async () => {
    const { plugin, ready } = await setup()
    await ready

    await plugin.identify(
      identify('user-1', {
        firstName: 'Ada',
        last_name: 'Lovelace',
        email: 'ada@example.com',
        phone: '5555555555',
        gender: 'Female',
        dob: '1990-05-01T00:00:00.000Z',
        address: {
          city: 'London',
          country: 'UK',
          postalCode: 'N1',
          state: 'LDN',
        },
        email_subscribe: 'opted_in',
        push_subscribe: 'maybe',
      })
    )

    expect(user.setFirstName).toHaveBeenCalledWith('Ada')
    expect(user.setLastName).toHaveBeenCalledWith('Lovelace')
    expect(user.setEmail).toHaveBeenCalledWith('ada@example.com')
    expect(user.setPhoneNumber).toHaveBeenCalledWith('5555555555')
    expect(user.setGender).toHaveBeenCalledWith('f')
    expect(user.setDateOfBirth).toHaveBeenCalledWith(1990, 5, 1)
    expect(user.setHomeCity).toHaveBeenCalledWith('London')
    expect(user.setCountry).toHaveBeenCalledWith('UK')
    expect(user.setEmailNotificationSubscriptionType).toHaveBeenCalledWith(
      'opted_in'
    )
    expect(user.setPushNotificationSubscriptionType).not.toHaveBeenCalled()
    expect(user.setCustomUserAttribute.mock.calls).toEqual([
      ['postalCode', 'N1'],
      ['state', 'LDN'],
    ])
  })

  it('treats mParticle names and age as custom attributes', async () => {
    const { plugin, ready } = await setup()
    await ready

    await plugin.identify(
      identify('user-1', { $FirstName: 'Ada', Email: 'a@b.co', age: 30 })
    )

    expect(user.setFirstName).not.toHaveBeenCalled()
    expect(user.setEmail).not.toHaveBeenCalled()
    expect(user.setDateOfBirth).not.toHaveBeenCalled()
    expect(user.setCustomUserAttribute.mock.calls).toEqual([
      ['$FirstName', 'Ada'],
      ['Email', 'a@b.co'],
      ['age', 30],
    ])
  })

  it('normalizes gender spellings and drops unknown genders', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    const { plugin, ready } = await setup()
    await ready

    await plugin.identify(identify('user-1', { gender: 'Prefer not to say' }))
    await plugin.identify(identify('user-1', { gender: 'robot' }))

    expect(user.setGender.mock.calls).toEqual([['p']])
  })

  it('sets custom attributes', async () => {
    const { plugin, ready } = await setup()
    await ready

    await plugin.identify(
      identify('user-1', {
        $plan: 'pro',
        seats: 3,
        vip: true,
        tags: ['a', 1],
        prefs: { theme: 'dark' },
        removed: null,
        skipped: undefined,
      })
    )

    expect(user.setCustomUserAttribute.mock.calls).toEqual([
      ['$plan', 'pro'],
      ['seats', 3],
      ['vip', true],
      ['tags', ['a', '1']],
      ['prefs', '{"theme":"dark"}'],
      ['removed', null],
    ])
  })

  it('can send attribute values as strings', async () => {
    const { plugin, ready } = await setup({ stringifyAttributeValues: true })
    await ready

    await plugin.identify(identify('user-1', { seats: 3, vip: true }))

    expect(user.setCustomUserAttribute.mock.calls).toEqual([
      ['seats', '3'],
      ['vip', 'true'],
    ])
  })

  it('only sends changed attributes, including after a page reload', async () => {
    const first = await setup()
    await first.ready
    await first.plugin.identify(identify('user-1', { plan: 'pro', seats: 1 }))
    await first.plugin.identify(identify('user-1', { plan: 'pro', seats: 2 }))

    const reloaded = await setup()
    await reloaded.ready
    await reloaded.plugin.identify(
      identify('user-1', { plan: 'pro', seats: 2 })
    )

    expect(braze.changeUser).toHaveBeenCalledTimes(1)
    expect(user.setCustomUserAttribute.mock.calls).toEqual([
      ['plan', 'pro'],
      ['seats', 1],
      ['seats', 2],
    ])
  })

  it('resends attributes after the user changes or resets', async () => {
    const { plugin, ready, analytics } = await setup()
    await ready

    await plugin.identify(identify('user-1', { plan: 'pro' }))
    await plugin.identify(identify('user-2', { plan: 'pro' }))
    const [[event, onReset]] = analytics.on.mock.calls
    expect(event).toBe('reset')
    onReset()
    await plugin.identify(identify('user-2', { plan: 'pro' }))

    expect(braze.changeUser.mock.calls).toEqual([
      ['user-1'],
      ['user-2'],
      ['user-2'],
    ])
    expect(user.setCustomUserAttribute).toHaveBeenCalledTimes(3)
  })
})

describe('Braze destination track', () => {
  const order = {
    order_id: 'order-1',
    currency: 'EUR',
    revenue: 30,
    products: [
      {
        product_id: 'p1',
        sku: 'SKU1',
        name: 'Shirt',
        brand: 'Acme',
        price: 10,
        quantity: 2,
        coupon: 'SAVE',
        color: 'blue',
      },
      { sku: 'SKU2', name: 'Hat', price: '10' },
    ],
  }

  it('logs custom events with names and keys unchanged', async () => {
    const { plugin, ready } = await setup()
    await ready

    await plugin.track(track('$Signed Up', { $plan: 'pro', nested: { a: 1 } }))

    expect(braze.logCustomEvent).toHaveBeenCalledWith('$Signed Up', {
      $plan: 'pro',
      nested: { a: 1 },
    })
  })

  it('can send property values as strings', async () => {
    const { plugin, ready } = await setup({ stringifyAttributeValues: true })
    await ready

    await plugin.track(track('Signed Up', { seats: 1, nested: { a: 1 } }))

    expect(braze.logCustomEvent).toHaveBeenCalledWith('Signed Up', {
      seats: '1',
      nested: '{"a":1}',
    })
  })

  it('logs one purchase per product for Order Completed', async () => {
    const { plugin, ready } = await setup()
    await ready

    await plugin.track(track('Order Completed', order))

    const shared = { order_id: 'order-1', currency: 'EUR', revenue: 30 }
    expect(braze.logPurchase.mock.calls).toEqual([
      [
        'SKU1',
        10,
        'EUR',
        2,
        {
          ...shared,
          product_id: 'p1',
          sku: 'SKU1',
          name: 'Shirt',
          brand: 'Acme',
          coupon: 'SAVE',
          color: 'blue',
        },
      ],
      ['SKU2', 10, 'EUR', 1, { ...shared, sku: 'SKU2', name: 'Hat' }],
    ])
  })

  it('lets product fields win over order fields', async () => {
    const { plugin, ready } = await setup()
    await ready

    await plugin.track(
      track('Order Completed', {
        coupon: 'ORDER',
        products: [{ sku: 'SKU1', coupon: 'ITEM' }],
      })
    )

    expect(braze.logPurchase).toHaveBeenCalledWith('SKU1', 0, 'USD', 1, {
      sku: 'SKU1',
      coupon: 'ITEM',
    })
  })

  it('falls back to product_id, then name, and skips products without either', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const { plugin, ready } = await setup()
    await ready

    await plugin.track(
      track('Order Completed', {
        products: [
          { product_id: 'p1', name: 'Shirt' },
          { name: 'Hat' },
          { price: 5 },
        ],
      })
    )

    expect(braze.logPurchase.mock.calls.map(([id]) => id)).toEqual([
      'p1',
      'Hat',
    ])
    expect(warn).toHaveBeenCalled()
  })

  it('can use the product name as the purchase productId', async () => {
    const { plugin, ready } = await setup({
      purchaseProductIdentifier: 'name',
    })
    await ready

    await plugin.track(track('Order Completed', order))

    expect(braze.logPurchase.mock.calls.map(([id]) => id)).toEqual([
      'Shirt',
      'Hat',
    ])
  })

  it('passes a leading $ in product IDs through', async () => {
    const { plugin, ready } = await setup()
    await ready

    await plugin.track(
      track('$Order Completed', { products: [{ sku: '$SKU1' }] })
    )
    await plugin.track(
      track('Order Completed', { products: [{ sku: '$SKU1' }] })
    )

    expect(braze.logCustomEvent).toHaveBeenCalledWith('$Order Completed', {
      products: [{ sku: '$SKU1' }],
    })
    expect(braze.logPurchase.mock.calls.map(([id]) => id)).toEqual(['$SKU1'])
  })

  it('can bundle the order into a single purchase', async () => {
    const { plugin, ready } = await setup({ bundleCommerceEvents: true })
    await ready

    await plugin.track(track('Order Completed', order))

    expect(braze.logPurchase.mock.calls).toEqual([
      ['Order Completed', 30, 'EUR', 1, order],
    ])
  })

  it('logs a single purchase when there are no products', async () => {
    const { plugin, ready } = await setup()
    await ready

    await plugin.track(track('Completed Order', { total: '15' }))

    expect(braze.logPurchase).toHaveBeenCalledWith(
      'Completed Order',
      15,
      'USD',
      1,
      { total: '15' }
    )
  })

  it('logs purchases for custom purchase event names', async () => {
    const { plugin, ready } = await setup({
      purchaseEventNames: ['Membership Purchased'],
    })
    await ready

    await plugin.track(track('Membership Purchased', { revenue: 5 }))
    await plugin.track(track('membership purchased', { revenue: 5 }))
    await plugin.track(track('Order Completed', { revenue: 5 }))

    expect(braze.logPurchase.mock.calls.map(([id]) => id)).toEqual([
      'Membership Purchased',
    ])
    expect(braze.logCustomEvent.mock.calls.map(([name]) => name)).toEqual([
      'membership purchased',
      'Order Completed',
    ])
  })

  it('lets isPurchaseEvent override purchaseEventNames', async () => {
    const isPurchaseEvent = jest.fn(
      (event) => event.properties?.kind === 'purchase'
    )
    const { plugin, ready } = await setup({
      isPurchaseEvent,
      purchaseEventNames: ['Upgraded'],
    })
    await ready

    await plugin.track(track('Renewed', { kind: 'purchase', revenue: 5 }))
    await plugin.track(track('Upgraded', { revenue: 5 }))
    await plugin.track(track('Order Completed', order))

    expect(isPurchaseEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'Renewed' })
    )
    expect(braze.logPurchase.mock.calls.map(([id]) => id)).toEqual(['Renewed'])
    expect(braze.logCustomEvent.mock.calls.map(([name]) => name)).toEqual([
      'Upgraded',
      'Order Completed',
    ])
  })

  it('logs a custom event when isPurchaseEvent throws', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const { plugin, ready } = await setup({
      isPurchaseEvent: () => {
        throw new Error('boom')
      },
    })
    await ready

    await plugin.track(track('Order Completed', { revenue: 5 }))

    expect(braze.logPurchase).not.toHaveBeenCalled()
    expect(braze.logCustomEvent).toHaveBeenCalledWith('Order Completed', {
      revenue: 5,
    })
    expect(warn).toHaveBeenCalled()
  })

  it('lets transformPurchase change each purchase', async () => {
    const transformPurchase = jest.fn(
      ({ properties: { order_id, ...rest }, ...purchase }) => ({
        ...purchase,
        productId: `${purchase.productId}-x`,
        properties: { ...rest, 'Transaction Id': order_id },
      })
    )
    const { plugin, ready } = await setup({ transformPurchase })
    await ready

    const event = track('Order Completed', order)
    await plugin.track(event)

    expect(transformPurchase).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 'SKU2' }),
      { event: event.event, order, product: order.products[1] }
    )
    expect(braze.logPurchase.mock.calls[1]).toEqual([
      'SKU2-x',
      10,
      'EUR',
      1,
      {
        currency: 'EUR',
        revenue: 30,
        sku: 'SKU2',
        name: 'Hat',
        'Transaction Id': 'order-1',
      },
    ])
  })

  it('passes no product to transformPurchase for per-order purchases', async () => {
    const transformPurchase = jest.fn((purchase) => purchase)
    const { plugin, ready } = await setup({
      transformPurchase,
      bundleCommerceEvents: true,
    })
    await ready

    await plugin.track(track('Order Completed', order))

    expect(transformPurchase).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ order, product: undefined })
    )
    expect(braze.logPurchase).toHaveBeenCalledTimes(1)
  })

  it('skips purchases when transformPurchase returns null or no productId', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const { plugin, ready } = await setup({
      transformPurchase: (purchase: { productId: string }) =>
        purchase.productId === 'SKU1' ? null : { ...purchase, productId: '' },
    })
    await ready

    await plugin.track(track('Order Completed', order))

    expect(braze.logPurchase).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('logs the default purchase when transformPurchase throws', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const { plugin, ready } = await setup({
      transformPurchase: (purchase: { properties: object }) => {
        purchase.properties = {}
        throw new Error('boom')
      },
    })
    await ready

    await plugin.track(track('Completed Order', { total: '15' }))

    expect(braze.logPurchase).toHaveBeenCalledWith(
      'Completed Order',
      15,
      'USD',
      1,
      { total: '15' }
    )
    expect(warn).toHaveBeenCalled()
  })
})

describe('Braze destination page', () => {
  const page = new Context({
    type: 'page',
    name: 'Home',
    properties: { path: '/' },
  })

  it('ignores page calls by default', async () => {
    const { plugin, ready } = await setup()
    await ready

    await plugin.page(page)

    expect(braze.logCustomEvent).not.toHaveBeenCalled()
  })

  it('logs page views named after the page name, falling back to the path', async () => {
    document.title = 'Home page'
    const { plugin, ready } = await setup({ forwardScreenViews: true })
    await ready
    await plugin.page(page)
    await plugin.page(new Context({ type: 'page', properties: { path: '/' } }))

    const properties = { path: '/', hostname: 'localhost', title: 'Home page' }
    expect(braze.logCustomEvent.mock.calls).toEqual([
      ['Home', properties],
      [window.location.pathname, properties],
    ])
  })

  it('can always name page views after the path', async () => {
    document.title = 'Home page'
    const { plugin, ready } = await setup({
      forwardScreenViews: true,
      pageViewEventName: 'path',
    })
    await ready
    await plugin.page(page)

    expect(braze.logCustomEvent).toHaveBeenCalledWith(
      window.location.pathname,
      { path: '/', hostname: 'localhost', title: 'Home page' }
    )
  })
})

describe('Braze destination in HtEventsBrowser', () => {
  it('loads from options.destinations and respects Appboy opt-outs', async () => {
    let onReady!: () => void
    const ready = new Promise<void>((resolve) => (onReady = resolve))
    const analytics = await HtEventsBrowser.standalone('WRITE_KEY', {
      destinations: {
        Braze: {
          apiKey: 'API_KEY',
          baseUrl: 'sdk.iad-03.braze.com',
          sdk: () => import('@braze/web-sdk'),
          onReady,
        },
      },
    })
    await ready

    await analytics.track('Sent')
    await analytics.track('Opted out', {}, { integrations: { Appboy: false } })
    await analytics.track('All off', {}, { integrations: { All: false } })
    await analytics.track(
      'Opted back in',
      {},
      { integrations: { All: false, Appboy: true } }
    )

    expect(braze.logCustomEvent.mock.calls.map(([name]) => name)).toEqual([
      'Sent',
      'Opted back in',
    ])
  })
})
