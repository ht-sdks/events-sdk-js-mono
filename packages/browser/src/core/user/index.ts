import { v4 as uuid } from '@lukeed/uuid'
import autoBind from '../../lib/bind-all'
import { Traits } from '../events'
import {
  CookieOptions,
  UniversalStorage,
  MemoryStorage,
  StorageObject,
  StorageSettings,
  StoreType,
  applyCookieOptions,
  initializeStorages,
  isArrayOfStoreType,
} from '../storage'
import { decryptRudderValue, decryptRudderHtValue } from './migrate'
import {
  SessionContext,
  SessionInfo,
  generateAutoTrackingSession,
  generateManualTrackingSession,
  hasSessionExpired,
  updateSessionExpiration,
} from '../session'
import type { HTTPCookieService } from '../http-cookies'

export type ID = string | null | undefined

export interface UserOptions {
  /**
   * Disables storing any data about the user.
   */
  disable?: boolean
  localStorageFallbackDisabled?: boolean
  persist?: boolean

  /**
   * Replicates "BrowserCookie" actions against a matching "ServerCookie".
   */
  httpCookieService?: HTTPCookieService

  cookie?: {
    key?: string
    oldKey?: string
  }

  localStorage?: {
    key: string
  }

  sessions?: {
    autoTrack?: boolean
    timeout?: number // milliseconds
  }

  /**
   * Store priority
   * @example stores: [StoreType.Cookie, StoreType.Memory]
   */
  storage?: StorageSettings
}

const defaults = {
  persist: true,
  cookie: {
    key: 'htjs_user_id',
    oldKey: 'ajs_user',
  },
  localStorage: {
    key: 'htjs_user_traits',
  },
  sessions: {
    autoTrack: true,
  },
}

const sessionKey = 'htjs_sesh'
const anonymousIdKey = 'htjs_anonymous_id'
const rudderHtAnonymousIdKey = 'htev_anonymous_id'
const segmentAnonymousIdKey = 'ajs_anonymous_id'
const rudderAnonymousIdKey = 'rl_anonymous_id'

export class User {
  static defaults = defaults

  private idKey: string
  private traitsKey: string
  private anonKey: string
  private seshKey: string
  private cookieOptions?: CookieOptions

  private legacyUserStore: UniversalStorage<{
    [k: string]:
      | {
          id?: string
          traits?: Traits
        }
      | string
  }>
  private traitsStore: UniversalStorage<{
    [k: string]: Traits
  }>

  private identityStore: UniversalStorage<{
    [k: string]: string
  }>

  private sessionStore: UniversalStorage<{ [k: string]: SessionInfo }>

  options: UserOptions = {}

  constructor(options: UserOptions = defaults, cookieOptions?: CookieOptions) {
    this.options = { ...defaults, ...options }
    this.cookieOptions = cookieOptions

    this.idKey = options.cookie?.key ?? defaults.cookie.key
    this.traitsKey = options.localStorage?.key ?? defaults.localStorage.key
    this.anonKey = anonymousIdKey
    this.seshKey = sessionKey

    this.identityStore = this.createStorage(this.options, cookieOptions)

    this.sessionStore = this.createStorage(this.options, cookieOptions)

    // using only cookies for legacy user store
    this.legacyUserStore = this.createStorage(
      this.options,
      cookieOptions,
      (s) => s === StoreType.Cookie
    )

    // using only localStorage / memory for traits store
    this.traitsStore = this.createStorage(
      this.options,
      cookieOptions,
      (s) => s !== StoreType.Cookie
    )

    const legacyUser = this.legacyUserStore.get(defaults.cookie.oldKey)
    if (legacyUser && typeof legacyUser === 'object') {
      legacyUser.id && this.id(legacyUser.id)
      legacyUser.traits && this.traits(legacyUser.traits)
    }

    // HTTPCookies require that localStorage values be synced to cookies
    if (this.options.httpCookieService) {
      this.identityStore.getAndSync(this.anonKey)
      this.identityStore.getAndSync(this.idKey)
      this.options.httpCookieService?.dispatchCreate()
    }

    autoBind(this)
  }

  id = (id?: ID): ID => {
    if (this.options.disable) {
      return null
    }

    const prevId = this.identityStore.getAndSync(this.idKey)

    if (id !== undefined) {
      const clearingIdentity = id === null
      const changingIdentity = id !== prevId && prevId !== null && id !== null
      const creatingIdentity = id !== prevId && prevId === null && id !== null

      this.identityStore.set(this.idKey, id)

      if (clearingIdentity) {
        this.options?.httpCookieService?.dispatchClear()
      }

      if (changingIdentity) {
        this.anonymousId(null) // this also runs dispatchClear()
      }

      if (changingIdentity || creatingIdentity) {
        this.options?.httpCookieService?.dispatchCreate()
      }
    }

    const retId = this.identityStore.getAndSync(this.idKey)
    if (retId) return retId

    const retLeg = this.legacyUserStore.get(defaults.cookie.oldKey)
    return retLeg ? (typeof retLeg === 'object' ? retLeg.id : retLeg) : null
  }

  private legacySIO(): [string, string] | null {
    const val = this.legacyUserStore.get('_sio') as string
    if (!val) {
      return null
    }
    const [anon, user] = val.split('----')
    return [anon, user]
  }

  anonymousId = (id?: ID): ID => {
    if (this.options.disable) {
      return null
    }

    if (id === undefined) {
      let val = this.identityStore.getAndSync(this.anonKey)
      let migrated = false

      // support anonymousId migration from other analytics providers
      if (!val) {
        val = decryptRudderHtValue(
          this.identityStore.getAndSync(rudderHtAnonymousIdKey) ?? ''
        )
        migrated = Boolean(val)
        if (val) this.identityStore.set(this.anonKey, val)
      }
      if (!val) {
        val = this.identityStore.getAndSync(segmentAnonymousIdKey)
        migrated = Boolean(val)
        if (val) this.identityStore.set(this.anonKey, val)
      }
      if (!val) {
        val = decryptRudderValue(
          this.identityStore.getAndSync(rudderAnonymousIdKey) ?? ''
        )
        migrated = Boolean(val)
        if (val) this.identityStore.set(this.anonKey, val)
      }
      if (!val) {
        val = this.legacySIO()?.[0] ?? null
      }

      if (migrated) {
        this.options?.httpCookieService?.dispatchCreate()
      }

      if (val) {
        return val
      }
    }

    if (id === null) {
      this.identityStore.set(this.anonKey, null)
      const clearedVal = this.identityStore.getAndSync(this.anonKey)
      this.options?.httpCookieService?.dispatchClear()
      return clearedVal
    }

    this.identityStore.set(this.anonKey, id ?? uuid())
    const syncedVal = this.identityStore.getAndSync(this.anonKey)

    this.options?.httpCookieService?.dispatchCreate()
    return syncedVal
  }

  traits = (traits?: Traits | null): Traits | undefined => {
    if (this.options.disable) {
      return
    }

    if (traits === null) {
      traits = {}
    }

    if (traits) {
      this.traitsStore.set(this.traitsKey, traits ?? {})
    }

    return this.traitsStore.get(this.traitsKey) ?? {}
  }

  identify(id?: ID, traits?: Traits): void {
    if (this.options.disable) {
      return
    }

    traits = traits ?? {}
    const currentId = this.id()

    if (currentId === null || currentId === id) {
      traits = {
        ...this.traits(),
        ...traits,
      }
    }

    if (id) {
      this.id(id)
    }

    this.traits(traits)
  }

  startManualSession(sessionId?: number) {
    if (this.options.disable) {
      return
    }
    this.sessionStore.clear(this.seshKey)
    const session = generateManualTrackingSession(sessionId)
    this.sessionStore.set(this.seshKey, session)
  }

  endManualSession() {
    this.sessionStore.clear(this.seshKey)
  }

  private getAndUpdateSessionInfo(): SessionInfo | null {
    if (this.options.disable) {
      return null
    }

    let session = this.sessionStore.getAndSync(this.seshKey)

    if (session == null) {
      if (this.options?.sessions?.autoTrack) {
        session = generateAutoTrackingSession(this.options?.sessions?.timeout)
        this.sessionStore.set(this.seshKey, session)
        return session
      }
      return null
    }

    if (session?.autoTrack && hasSessionExpired(session.expiresAt!)) {
      session = generateAutoTrackingSession(this.options?.sessions?.timeout)
      this.sessionStore.set(this.seshKey, session)
      return session
    }

    session = updateSessionExpiration(session)
    this.sessionStore.set(this.seshKey, session)
    return session
  }

  getAndUpdateSession(): SessionContext | null {
    const sessionInfo = this.getAndUpdateSessionInfo()
    const session: SessionContext = {}
    if (sessionInfo?.id) session.sessionId = sessionInfo.id
    if (sessionInfo?.sessionStart)
      session.sessionStart = sessionInfo.sessionStart
    return session
  }

  sessionId(): number | null {
    const session = this.sessionStore.getAndSync(this.seshKey)
    return session?.id ?? null
  }

  logout(): void {
    this.anonymousId(null)
    this.id(null)
    this.traits({})
  }

  reset(): void {
    this.logout()
    this.identityStore.clear(this.idKey)
    this.identityStore.clear(this.anonKey)
    this.sessionStore.clear(this.seshKey)
    this.traitsStore.clear(this.traitsKey)
  }

  load(): User {
    return new User(this.options, this.cookieOptions)
  }

  save(): boolean {
    return true
  }

  /**
   * Creates the right storage system applying all the user options, cookie options and particular filters
   * @param options UserOptions
   * @param cookieOpts CookieOptions
   * @param filterStores filter function to apply to any StoreTypes (skipped if options specify using a custom storage)
   * @returns a Storage object
   */
  private createStorage<T extends StorageObject = StorageObject>(
    options: UserOptions,
    cookieOpts?: CookieOptions,
    filterStores?: (value: StoreType) => boolean
  ): UniversalStorage<T> {
    let stores: StoreType[] = [
      StoreType.LocalStorage,
      StoreType.Cookie,
      StoreType.Memory,
    ]

    // If disabled we won't have any storage functionality
    if (options.disable) {
      return new UniversalStorage<T>([])
    }

    // If persistance is disabled we will always fallback to Memory Storage
    if (!options.persist) {
      return new UniversalStorage<T>([new MemoryStorage<T>()])
    }

    if (options.storage !== undefined && options.storage !== null) {
      if (isArrayOfStoreType(options.storage)) {
        // If the user only specified order of stores we will still apply filters and transformations e.g. not using localStorage if localStorageFallbackDisabled
        stores = options.storage.stores
      }
    }

    // Disable LocalStorage
    if (options.localStorageFallbackDisabled) {
      stores = stores.filter((s) => s !== StoreType.LocalStorage)
    }

    // Apply Additional filters
    if (filterStores) {
      stores = stores.filter(filterStores)
    }

    return new UniversalStorage(
      initializeStorages(applyCookieOptions(stores, cookieOpts))
    )
  }
}

const groupDefaults: UserOptions = {
  persist: true,
  cookie: {
    key: 'htjs_group_id',
  },
  localStorage: {
    key: 'htjs_group_properties',
  },
}

export class Group extends User {
  constructor(options: UserOptions = groupDefaults, cookie?: CookieOptions) {
    super({ ...groupDefaults, ...options }, cookie)
    autoBind(this)
  }

  anonymousId = (_id?: ID): ID => {
    return undefined
  }
}
