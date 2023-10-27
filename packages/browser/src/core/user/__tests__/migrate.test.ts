import jar from 'js-cookie'
import { User } from '..'
import { LocalStorage } from '../../storage'

function clear(): void {
  document.cookie.split(';').forEach(function (c) {
    document.cookie = c
      .replace(/^ +/, '')
      .replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/')
  })
  localStorage.clear()
}

let store: LocalStorage
beforeEach(function () {
  store = new LocalStorage()
  clear()
  // Restore any cookie, localstorage disable
  jest.restoreAllMocks()
  jest.spyOn(console, 'warn').mockImplementation(() => {}) // silence console spam.
})

const anonymousIdKey = 'htjs_anonymous_id'
const rudderHtAnonymousIdKey = 'htev_anonymous_id'
const segmentAnonymousIdKey = 'ajs_anonymous_id'
const rudderAnonymousIdKey = 'rl_anonymous_id'

describe.skip('user anonymousId migration', () => {
  describe('()', () => {
    it('should get the hightouch anonymousId', () => {
      store.set(anonymousIdKey, '1234')
      const user = new User()
      expect(user.anonymousId()).toEqual('1234')
    })

    it('should decrypt the "legacy" hightouch anonymousId', () => {
      store.set(
        rudderHtAnonymousIdKey,
        'HtEvEncrypt:U2FsdGVkX1+BxLsjF52p24D/rVEQfG9ACRjvLRoSgbnfLYlWBmBCWABZPMsDHWySVO4c26kYs2hxrT13q8amlw=='
      )
      const user = new User()
      expect(user.anonymousId()).toEqual('c027ce91-f759-4f91-96d4-985eaa146346')

      store.remove(rudderHtAnonymousIdKey)
      const user2 = new User()
      expect(user2.anonymousId()).toEqual(
        'c027ce91-f759-4f91-96d4-985eaa146346'
      )
      expect(store.get(anonymousIdKey)).toEqual(
        'c027ce91-f759-4f91-96d4-985eaa146346'
      )
      expect(store.get(rudderHtAnonymousIdKey)).toEqual(null)
    })

    it('should get the segment anonymousId', () => {
      store.set(segmentAnonymousIdKey, '56789')
      const user = new User()
      expect(user.anonymousId()).toEqual('56789')
    })

    it('should get the unencrypted rudder anonymousId', () => {
      jar.set(rudderAnonymousIdKey, '56789')
      const user = new User()
      expect(user.anonymousId()).toEqual('56789')
    })

    it('should get the v3 "encrypted" rudder anonymousId', () => {
      jar.set(rudderAnonymousIdKey, 'RS_ENC_v3_dGVzdC1kYXRh')
      const user = new User()
      expect(user.anonymousId()).toEqual('test-data')
    })

    it('should get the v1 "encrypted" rudder anonymousId', () => {
      jar.set(
        rudderAnonymousIdKey,
        'RudderEncrypt:U2FsdGVkX1+5q5jikppUASe8AdIH6O2iORyF41sYXgxzIGiX9whSeVxxww0OK5h/'
      )
      const user = new User()
      expect(user.anonymousId()).toEqual('1wefk7M3Y1D6EDX4ZpIE00LpKAE')
    })

    it('should always choose the hightouch anonymousId when present', () => {
      store.set(segmentAnonymousIdKey, '56789')
      jar.set(anonymousIdKey, '1234')
      const user = new User()
      expect(user.anonymousId()).toEqual('1234')
    })

    it('should migrate the anonymousId', () => {
      store.set(segmentAnonymousIdKey, '56789')
      const user = new User()
      expect(user.anonymousId()).toEqual('56789')

      store.remove(segmentAnonymousIdKey)
      const user2 = new User()
      expect(user2.anonymousId()).toEqual('56789')
      expect(store.get(anonymousIdKey)).toEqual('56789')
      expect(store.get(segmentAnonymousIdKey)).toEqual(null)
    })
  })
})
