import type { Context } from '../../core/context'
import type * as BrazeSdk from '@braze/web-sdk'
import type { Analytics } from '../../core/analytics'
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

type BrazeSettings = {
  /**
   * Braze Web SDK API key. Required unless `instance` is set.
   */
  apiKey?: string

  /**
   * Braze SDK endpoint, e.g. `sdk.iad-03.braze.com`. Required unless `instance` is set.
   */
  baseUrl?: string

  /**
   * The Braze Web SDK for the destination to initialize, or a function that loads it,
   * e.g. `() => import('@braze/web-sdk')`
   */
  sdk?: Braze | (() => Promise<Braze>)

  /**
   * A Braze instance you already initialized. The destination skips `initialize` and `openSession`.
   */
  instance?: Braze

  /**
   * If `braze.automaticallyShowInAppMessages()` should be called. Ignored when `instance` is set.
   */
  automaticallyShowInAppMessages?: boolean

  sessionTimeoutInSeconds?: number

  /**
   * Extra options passed to `braze.initialize`
   */
  initOptions?: Partial<BrazeSdk.InitializationOptions>

  /**
   * Called with the Braze instance once it is initialized, before the session opens and queued events are sent
   */
  onReady?: (braze: Braze) => void

  /**
   * Which product field becomes the purchase `productId`
   */
  purchaseProductIdentifier?: 'name' | 'sku'

  /**
   * If `Order Completed` should log one purchase for the whole order instead of one per product
   */
  bundleCommerceEvents?: boolean

  /**
   * If any `track` call with `revenue` should be logged as a purchase
   */
  logPurchaseWhenRevenuePresent?: boolean

  /**
   * If `page` calls should be logged as custom events
   */
  forwardScreenViews?: boolean

  /**
   * Page view event name: the URL path, or the `page` call's name
   */
  pageViewEventName?: 'path' | 'name'

  /**
   * If attribute and property values should be sent as strings
   */
  stringifyAttributeValues?: boolean
}

type AttributeCache = {
  userId?: string
  attributes: Record<string, string>
}

const CACHE_KEY = 'htjs_braze_attributes'

const PURCHASE_EVENTS = ['Order Completed', 'Completed Order']

const STANDARD_PRODUCT_FIELDS = [
  'product_id',
  'sku',
  'category',
  'name',
  'brand',
  'variant',
  'price',
  'quantity',
  'coupon',
  'position',
  'url',
  'image_url',
]

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
  ['setFirstName', ['firstName', 'first_name', '$FirstName']],
  ['setLastName', ['lastName', 'last_name', '$LastName']],
  ['setEmail', ['email', 'Email']],
  ['setPhoneNumber', ['phone', '$Mobile']],
  ['setHomeCity', ['address.city', 'home_city', '$City']],
  ['setCountry', ['address.country', 'country', '$Country']],
] as const

const SUBSCRIPTION_TRAITS = [
  ['setEmailNotificationSubscriptionType', 'email_subscribe'],
  ['setPushNotificationSubscriptionType', 'push_subscribe'],
] as const

const stripDollar = (key: string) => key.replace(/^\$+/, '')

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

/**
 * https://github.com/mparticle-integrations/mparticle-javascript-integration-braze/blob/v5.0.0/src/BrazeKit-dev.js
 */
const brazeDestination: DestinationFactory<BrazeSettings> = ({
  apiKey,
  baseUrl,
  sdk,
  instance,
  automaticallyShowInAppMessages = true,
  sessionTimeoutInSeconds,
  initOptions,
  onReady,
  purchaseProductIdentifier = 'name',
  bundleCommerceEvents = false,
  logPurchaseWhenRevenuePresent = false,
  forwardScreenViews = false,
  pageViewEventName = 'path',
  stringifyAttributeValues = false,
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

  const toValue = (value: unknown) =>
    stringifyAttributeValues && value !== null ? toStringValue(value) : value

  const eventProperties = (properties: Properties) => {
    const result: Properties = {}
    Object.keys(properties).forEach((key) => {
      if (properties[key] !== undefined) {
        result[stripDollar(key)] = toValue(properties[key])
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
      return toValue(attribute)
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
    const address = isPlainObject(traits.address) ? traits.address : undefined
    if (address) delete traits.address

    const pick = (keys: readonly string[]) => {
      let result: unknown
      keys.forEach((key) => {
        const trait = key.startsWith('address.')
          ? address?.[key.slice('address.'.length)]
          : traits[key]
        delete traits[key]
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

    const gender = pick(['gender', '$Gender'])
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
    const age = pick(['age', '$Age'])
    let dateOfBirth: [number | null, number | null, number | null] | undefined
    if (birthday === null) {
      dateOfBirth = [null, null, null]
    } else if (birthday !== undefined) {
      dateOfBirth = parseDateOfBirth(birthday)
    } else if (typeof age === 'number') {
      dateOfBirth = [new Date().getFullYear() - age, 1, 1]
    }
    if (dateOfBirth) {
      const [year, month, day] = dateOfBirth
      set('setDateOfBirth', dateOfBirth, () =>
        user.setDateOfBirth(year, month, day)
      )
    } else if (birthday !== undefined || age !== undefined) {
      warn('dropped date of birth: expected an ISO 8601 date or numeric age')
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

    const zip = pick(['address.postalCode', '$Zip'])
    if (zip !== undefined) setCustom('Zip', zip)

    Object.keys(traits).forEach((key) =>
      setCustom(stripDollar(key), traits[key])
    )
    save()
  }

  const logPurchase = (braze: Braze, name: string, properties: Properties) => {
    const currency =
      typeof properties.currency === 'string' &&
      properties.currency.length === 3
        ? properties.currency
        : 'USD'
    const total =
      toNumber(properties.revenue) ?? toNumber(properties.total) ?? 0
    const products = Array.isArray(properties.products)
      ? properties.products.filter(isPlainObject)
      : []

    if (bundleCommerceEvents) {
      braze.logPurchase(
        'eCommerce - purchase',
        total,
        currency,
        1,
        eventProperties({
          ...properties,
          'Transaction Id': properties.order_id,
          products: products.map(({ sku, coupon, ...product }) => ({
            ...product,
            Id: sku,
            'Coupon Code': coupon,
            'Total Product Amount':
              (toNumber(product.price) ?? 0) *
              (toNumber(product.quantity) ?? 1),
          })),
        })
      )
    } else if (products.length) {
      products.forEach((product) => {
        const custom: Properties = {}
        Object.keys(product).forEach((key) => {
          if (STANDARD_PRODUCT_FIELDS.indexOf(key) < 0) {
            custom[key] = product[key]
          }
        })
        const productId =
          purchaseProductIdentifier === 'sku'
            ? (product.sku ?? product.product_id)
            : product.name
        braze.logPurchase(
          stripDollar(String(productId ?? '')),
          toNumber(product.price) ?? 0,
          currency,
          toNumber(product.quantity) ?? 1,
          eventProperties({
            ...custom,
            Sku: product.sku,
            'Transaction Id': properties.order_id,
          })
        )
      })
    } else {
      braze.logPurchase(
        stripDollar(name),
        total,
        currency,
        1,
        eventProperties(properties)
      )
    }
  }

  const track = (braze: Braze, name: string, properties: Properties) => {
    if (
      PURCHASE_EVENTS.indexOf(name) >= 0 ||
      (logPurchaseWhenRevenuePresent && toNumber(properties.revenue))
    ) {
      logPurchase(braze, name, properties)
    } else {
      braze.logCustomEvent(stripDollar(name), eventProperties(properties))
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
        if (!forwardScreenViews) return
        const name =
          (pageViewEventName === 'name' && ctx.event.name) ||
          window.location.pathname
        const properties = {
          ...ctx.event.properties,
          hostname: window.location.hostname,
          title: document.title,
        }
        run((braze) =>
          braze.logCustomEvent(stripDollar(name), eventProperties(properties))
        )
      },

      track: (ctx: Context) =>
        run((braze) =>
          track(braze, ctx.event.event ?? '', ctx.event.properties ?? {})
        ),
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
