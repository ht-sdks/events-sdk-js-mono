import type { Context } from '../../core/context'
import type * as BrazeSdk from '@braze/web-sdk'
import type { Analytics } from '../../core/analytics'
import type { HightouchEvent } from '../../core/events/interfaces'
import type { DestinationFactory } from './types'
import { LocalStorage } from '../../core/storage/localStorage'
import { Destination } from './destination'

type Braze = typeof BrazeSdk
type BrazeUser = BrazeSdk.User
type Properties = Record<string, unknown>
type Gender = Parameters<BrazeUser['setGender']>[0]
type SubscriptionType = Parameters<
  BrazeUser['setEmailNotificationSubscriptionType']
>[0]
type CustomAttributeValue = Parameters<BrazeUser['setCustomUserAttribute']>[1]

export type BrazePurchase = {
  productId: string
  price: number
  currency: string
  quantity: number
  properties: Record<string, any>
}

type StartSettings =
  | {
      /**
       * Braze Web SDK API key. Required unless `instance` is set.
       */
      apiKey: string

      /**
       * Braze SDK endpoint, e.g. `sdk.iad-03.braze.com`. Required unless `instance` is set.
       */
      baseUrl: string

      /**
       * The Braze Web SDK for the destination to initialize, or a function that loads it,
       * e.g. `() => import('@braze/web-sdk')`
       */
      sdk: Braze | (() => Promise<Braze>)

      instance?: never

      /**
       * If `braze.automaticallyShowInAppMessages()` should be called. Ignored when `instance` is set.
       */
      automaticallyShowInAppMessages?: boolean

      sessionTimeoutInSeconds?: number

      /**
       * Extra options passed to `braze.initialize`
       */
      initOptions?: Partial<BrazeSdk.InitializationOptions> & {
        baseUrl?: never
        sessionTimeoutInSeconds?: never
      }
    }
  | {
      apiKey?: never
      baseUrl?: never
      sdk?: never

      /**
       * A Braze instance you already initialized. The destination skips `initialize` and `openSession`.
       */
      instance: Braze

      automaticallyShowInAppMessages?: never
      sessionTimeoutInSeconds?: never
      initOptions?: never
    }

export type BrazeSettings = StartSettings & {
  /** Exact event names or a predicate identifying purchases. Defaults to Order Completed and Completed Order. */
  purchaseDetection?: string[] | ((event: HightouchEvent) => boolean)

  /** One purchase per product (SKU by default), or one for the whole order. */
  purchaseGrouping?:
    | { mode: 'perProduct'; identifier?: 'sku' | 'name' }
    | { mode: 'perOrder' }

  /** Forward page calls using their name (falling back to path), or their path. Off by default. */
  pageTracking?: false | 'name' | 'path'

  /**
   * Called with the Braze instance once it is initialized, before the session opens and queued events are sent
   */
  onReady?: (braze: Braze) => void

  /**
   * Changes each purchase before it is logged. Return `null` or `undefined` to skip it.
   * `product` is undefined for per-order purchases and orders without products.
   * If it throws, the unchanged purchase is logged.
   */
  transformPurchase?: (
    purchase: BrazePurchase,
    context: {
      event: HightouchEvent
      order: Record<string, any>
      product?: Record<string, any>
    }
  ) => BrazePurchase | null | undefined
}

type AttributeCache = {
  userId?: string
  attributes: Record<string, string>
}

const CACHE_KEY = 'htjs_braze_attributes'

const GENDERS = new Map<string, Gender>([
  ['m', 'm'],
  ['male', 'm'],
  ['f', 'f'],
  ['female', 'f'],
  ['o', 'o'],
  ['other', 'o'],
  ['u', 'u'],
  ['unknown', 'u'],
  ['n', 'n'],
  ['not_applicable', 'n'],
  ['p', 'p'],
  ['prefer_not_to_say', 'p'],
])

const SUBSCRIPTION_TYPES: SubscriptionType[] = [
  'opted_in',
  'subscribed',
  'unsubscribed',
]

const STRING_TRAITS = [
  ['setFirstName', ['firstName', 'first_name']],
  ['setLastName', ['lastName', 'last_name']],
  ['setEmail', ['email']],
  ['setPhoneNumber', ['phone']],
  ['setHomeCity', ['address.city', 'home_city']],
  ['setCountry', ['address.country', 'country']],
] as const

const SUBSCRIPTION_TRAITS = [
  ['setEmailNotificationSubscriptionType', 'email_subscribe'],
  ['setPushNotificationSubscriptionType', 'push_subscribe'],
] as const

const isPlainObject = (value: unknown): value is Properties =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Date)

const toNumber = (value: unknown): number | undefined => {
  const number = typeof value === 'string' ? parseFloat(value) : value
  return typeof number === 'number' && isFinite(number) ? number : undefined
}

const toStringValue = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

const parseDateOfBirth = (
  value: unknown
): [number, number, number] | undefined => {
  if (value instanceof Date) {
    return isNaN(value.getTime())
      ? undefined
      : [value.getFullYear(), value.getMonth() + 1, value.getDate()]
  }
  // Read the date digits directly: `new Date('1990-05-01')` is UTC midnight,
  // which is the previous day in timezones west of UTC.
  const match =
    typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null
  return match
    ? [Number(match[1]), Number(match[2]), Number(match[3])]
    : undefined
}

const brazeDestination: DestinationFactory<BrazeSettings> = ({
  apiKey,
  baseUrl,
  sdk,
  instance,
  automaticallyShowInAppMessages = true,
  sessionTimeoutInSeconds,
  initOptions,
  onReady,
  purchaseDetection = ['Order Completed', 'Completed Order'],
  purchaseGrouping = { mode: 'perProduct', identifier: 'sku' },
  transformPurchase,
  pageTracking = false,
}) => {
  const storage = new LocalStorage<{ [CACHE_KEY]: AttributeCache }>()
  let cache: AttributeCache = storage.get(CACHE_KEY) ?? { attributes: {} }
  let client: Braze | undefined
  let failed = false
  const pending: Array<(braze: Braze) => void> = []

  const warn = (...args: unknown[]) => console.warn('[Braze]', ...args)

  const save = () => storage.set(CACHE_KEY, cache)

  const run = (fn: (braze: Braze) => void) => {
    if (failed) return
    if (!client) {
      pending.push(fn)
      return
    }
    try {
      fn(client)
    } catch (error) {
      warn(error)
    }
  }

  const eventProperties = (properties: Properties) => {
    const result: Properties = {}
    Object.keys(properties).forEach((key) => {
      if (properties[key] !== undefined) {
        result[key] = properties[key]
      }
    })
    return result
  }

  const attributeValue = (attribute: unknown) => {
    if (Array.isArray(attribute)) return attribute.map(toStringValue)
    if (isPlainObject(attribute)) return JSON.stringify(attribute)
    if (
      attribute === null ||
      attribute instanceof Date ||
      ['string', 'number', 'boolean'].indexOf(typeof attribute) >= 0
    ) {
      return attribute
    }
    return undefined
  }

  const changeUser = (braze: Braze, userId: string) => {
    if (userId === cache.userId) return
    braze.changeUser(userId)
    cache = { userId, attributes: {} }
    save()
  }

  const identify = (
    braze: Braze,
    userId: string | null | undefined,
    rawTraits: Properties
  ) => {
    if (userId) changeUser(braze, userId)
    const user = braze.getUser()
    if (!user) return

    const traits: Properties = { ...rawTraits }
    let address: Properties = {}
    if (isPlainObject(traits.address)) {
      address = { ...traits.address }
      delete traits.address
    }

    const pick = (keys: readonly string[]) => {
      let result: unknown
      keys.forEach((key) => {
        const [source, field] = key.startsWith('address.')
          ? [address, key.slice('address.'.length)]
          : [traits, key]
        const trait = source[field]
        delete source[field]
        if (result === undefined) result = trait
      })
      return result
    }

    const set = (key: string, attribute: unknown, apply: () => boolean) => {
      const serialized = JSON.stringify(attribute)
      if (cache.attributes[key] !== serialized && apply()) {
        cache.attributes[key] = serialized
      }
    }

    const setCustom = (key: string, raw: unknown) => {
      const attribute = attributeValue(raw)
      if (attribute !== undefined) {
        set(`custom:${key}`, attribute, () =>
          user.setCustomUserAttribute(key, attribute as CustomAttributeValue)
        )
      }
    }

    STRING_TRAITS.forEach(([setter, keys]) => {
      const trait = pick(keys)
      if (trait === null || typeof trait === 'string') {
        set(setter, trait, () => user[setter](trait))
      } else if (trait !== undefined) {
        warn(`dropped ${keys[0]}: expected a string`)
      }
    })

    const gender = pick(['gender'])
    if (gender !== undefined) {
      const normalized =
        gender === null
          ? null
          : GENDERS.get(
              String(gender)
                .toLowerCase()
                .replace(/[\s-]+/g, '_')
            )
      if (normalized !== undefined) {
        set('setGender', normalized, () => user.setGender(normalized))
      } else {
        warn(`dropped gender: unsupported value "${String(gender)}"`)
      }
    }

    const birthday = pick(['birthday', 'dob'])
    let dateOfBirth: [number | null, number | null, number | null] | undefined
    if (birthday === null) {
      dateOfBirth = [null, null, null]
    } else if (birthday !== undefined) {
      dateOfBirth = parseDateOfBirth(birthday)
    }
    if (dateOfBirth) {
      const [year, month, day] = dateOfBirth
      set('setDateOfBirth', dateOfBirth, () =>
        user.setDateOfBirth(year, month, day)
      )
    } else if (birthday !== undefined) {
      warn('dropped birthday: expected an ISO 8601 date')
    }

    SUBSCRIPTION_TRAITS.forEach(([setter, key]) => {
      const trait = pick([key])
      const type = SUBSCRIPTION_TYPES.find((type) => type === trait)
      if (type) {
        set(setter, type, () => user[setter](type))
      } else if (trait !== undefined) {
        warn(`dropped ${key}: unsupported value "${String(trait)}"`)
      }
    })

    Object.keys(address).forEach((key) => setCustom(key, address[key]))
    Object.keys(traits).forEach((key) => setCustom(key, traits[key]))
    save()
  }

  const logPurchase = (braze: Braze, event: HightouchEvent) => {
    const order: Properties = event.properties ?? {}
    const currency =
      typeof order.currency === 'string' && order.currency.length === 3
        ? order.currency
        : 'USD'
    const total = toNumber(order.revenue) ?? toNumber(order.total) ?? 0
    const products = Array.isArray(order.products)
      ? order.products.filter(isPlainObject)
      : []

    const log = (purchase: BrazePurchase, product?: Properties) => {
      let result: BrazePurchase | null | undefined = purchase
      if (transformPurchase) {
        try {
          result = transformPurchase(
            { ...purchase, properties: { ...purchase.properties } },
            { event, order, product }
          )
        } catch (error) {
          warn('transformPurchase threw', error)
        }
      }
      if (!result) return
      if (typeof result.productId !== 'string' || !result.productId) {
        warn('skipped purchase: missing productId')
        return
      }
      braze.logPurchase(
        result.productId,
        result.price,
        result.currency,
        result.quantity,
        eventProperties(result.properties)
      )
    }

    if (purchaseGrouping.mode === 'perOrder' || !products.length) {
      log({
        productId: event.event ?? '',
        price: total,
        currency,
        quantity: 1,
        properties: { ...order },
      })
      return
    }

    const shared = { ...order }
    delete shared.products
    products.forEach((product) => {
      const { price, quantity, ...fields } = product
      const productId =
        purchaseGrouping.identifier === 'name'
          ? product.name
          : (product.sku ?? product.product_id ?? product.name)
      log(
        {
          productId: productId == null ? '' : String(productId),
          price: toNumber(price) ?? 0,
          currency,
          quantity: toNumber(quantity) ?? 1,
          properties: { ...shared, ...fields },
        },
        product
      )
    })
  }

  const isPurchase = (event: HightouchEvent) => {
    if (typeof purchaseDetection === 'function') {
      try {
        return purchaseDetection(event)
      } catch (error) {
        warn('purchaseDetection threw', error)
        return false
      }
    }
    return purchaseDetection.indexOf(event.event ?? '') >= 0
  }

  const track = (braze: Braze, event: HightouchEvent) => {
    const name = event.event ?? ''
    const properties = event.properties ?? {}
    if (isPurchase(event)) {
      logPurchase(braze, event)
    } else {
      braze.logCustomEvent(name, eventProperties(properties))
    }
  }

  const start = async (analytics: Analytics) => {
    const braze = instance ?? (typeof sdk === 'function' ? await sdk() : sdk)
    if (!braze) throw new Error('`sdk` or `instance` is required')

    if (!instance) {
      if (!apiKey || !baseUrl) {
        throw new Error('`apiKey` and `baseUrl` are required')
      }
      const initialized = braze.initialize(apiKey, {
        ...initOptions,
        ...(sessionTimeoutInSeconds !== undefined && {
          sessionTimeoutInSeconds,
        }),
        baseUrl,
      })
      if (!initialized) throw new Error('braze.initialize returned false')
      if (automaticallyShowInAppMessages) {
        braze.automaticallyShowInAppMessages()
      }
    }

    // Braze starts a second session if changeUser runs after openSession, and
    // only shows session-start in-app messages to subscribers registered first.
    const userId = analytics.user().id()
    if (userId) changeUser(braze, userId)
    try {
      onReady?.(braze)
    } catch (error) {
      warn(error)
    }
    if (!instance) braze.openSession()

    client = braze
    pending.splice(0).forEach(run)
  }

  return Object.assign(
    new Destination('Braze', '0.0.1', {
      identify: (ctx: Context) =>
        run((braze) =>
          identify(braze, ctx.event.userId, ctx.event.traits ?? {})
        ),

      page: (ctx: Context) => {
        if (!pageTracking) return
        const name =
          (pageTracking === 'name' && ctx.event.name) ||
          window.location.pathname
        const properties = {
          ...ctx.event.properties,
          hostname: window.location.hostname,
          title: document.title,
        }
        run((braze) => braze.logCustomEvent(name, eventProperties(properties)))
      },

      track: (ctx: Context) => run((braze) => track(braze, ctx.event)),
    }),
    {
      alternativeNames: ['Appboy'],
      isLoaded: () => client !== undefined,
      load: (_ctx: Context, analytics: Analytics) => {
        analytics.on('reset', () => {
          cache = { attributes: {} }
          save()
        })
        start(analytics).catch((error) => {
          failed = true
          pending.length = 0
          warn('failed to load', error)
        })
        return Promise.resolve()
      },
    }
  )
}

export default brazeDestination
