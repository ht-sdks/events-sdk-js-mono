import { User } from '..'
import { LocalStorage } from '../../storage'
import { SessionInfo } from '../../session'

function clear(): void {
  document.cookie.split(';').forEach(function (c) {
    document.cookie = c
      .replace(/^ +/, '')
      .replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/')
  })
  localStorage.clear()
}

const now = Date.now()

let store: LocalStorage
beforeEach(function () {
  store = new LocalStorage()
  clear()
  // Restore any cookie, localstorage disable
  jest.restoreAllMocks()
  jest.spyOn(console, 'warn').mockImplementation(() => {}) // silence console spam.

  // mock system time
  jest.useFakeTimers().setSystemTime(now)
})

afterEach(() => {
  jest.useRealTimers()
})

const seshKey = 'htjs_sesh'

describe('user anonymousId migration', () => {
  describe('()', () => {
    it('should create a session', () => {
      const user = new User()
      const session = user.getAndUpdateSession()
      expect(session?.sessionStart).toEqual(true)
      expect(session?.sessionId).toBeTruthy()

      const sesh = store.get(seshKey) as unknown as SessionInfo
      expect(sesh.expiresAt).toBeTruthy()
      expect(sesh.autoTrack).toBeTruthy()
    })

    it('should refresh expiration on session update', () => {
      const user = new User()
      user.getAndUpdateSession()
      const sesh = store.get(seshKey) as unknown as SessionInfo
      expect(sesh.expiresAt).toEqual(now + sesh.timeout!)
      // subsequent calls should refresh the expiration relative to `now`
      user.getAndUpdateSession()
      const updatedSesh = store.get(seshKey) as unknown as SessionInfo
      expect(updatedSesh.expiresAt).toEqual(now + sesh.timeout!)
    })

    it('should update an existing session', () => {
      const user = new User()
      const session = user.getAndUpdateSession()
      const sesh = store.get(seshKey) as unknown as SessionInfo
      expect(session?.sessionStart).toEqual(true)
      expect(session?.sessionId).toBeTruthy()

      const updated = user.getAndUpdateSession()
      const updatedSesh = store.get(seshKey) as unknown as SessionInfo
      expect(updated?.sessionStart).toEqual(undefined)
      expect(updated?.sessionId).toEqual(session?.sessionId)
      expect(updatedSesh.expiresAt).toEqual(now + sesh.timeout!)
    })

    it('should not create a session if autoTrack is disabled', () => {
      const user = new User({ sessions: { autoTrack: false } })
      const session = user.getAndUpdateSession()
      expect(session).toEqual({})
    })

    it('should be able to start and end manual sessions', () => {
      const user = new User({ sessions: { autoTrack: false } })
      const session = user.getAndUpdateSession()
      expect(session).toEqual({})

      user.startManualSession()
      const sessionId = user.sessionId()
      const sesh = store.get(seshKey) as unknown as SessionInfo

      expect(sesh).toEqual({
        id: sessionId,
        manualTrack: true,
        sessionStart: true,
      })

      // first call sets it as no longer being the start of the session
      const firstCall = user.getAndUpdateSession()
      expect(firstCall).toEqual({ sessionId })
      // subsequent calls do not change the session
      const secondCall = user.getAndUpdateSession()
      expect(secondCall).toEqual({ sessionId })
      const thirdCall = user.getAndUpdateSession()
      expect(thirdCall).toEqual({ sessionId })

      // ending the session should clear the session
      user.endManualSession()
      // this should NOT auto create another session
      // autoTrack was disabled during User init
      const ended = user.getAndUpdateSession()
      expect(ended).toEqual({})
    })

    it('should end an autoTrack session when manualSession is called', () => {
      const user = new User()
      const session = user.getAndUpdateSession()
      const sesh = store.get(seshKey) as unknown as SessionInfo
      expect(session?.sessionStart).toEqual(true)
      expect(session?.sessionId).toBeTruthy()
      expect(sesh?.sessionStart).toEqual(true)
      expect(sesh?.expiresAt).toBeTruthy()
      expect(sesh?.autoTrack).toBeTruthy()

      user.startManualSession(23114123412)
      const newSesh = store.get(seshKey) as unknown as SessionInfo
      const newSession = user.getAndUpdateSession()
      expect(newSession?.sessionId === session?.sessionId).toBe(false)
      expect(newSesh).toEqual({
        id: newSession?.sessionId,
        manualTrack: true,
        sessionStart: true,
      })

      // ending the manual session should return to auto track
      user.endManualSession()
      const autoSession = user.getAndUpdateSession()
      const autoSesh = store.get(seshKey) as unknown as SessionInfo
      expect(autoSession?.sessionStart).toEqual(true)
      expect(autoSession?.sessionId).toBeTruthy()
      expect(autoSesh?.sessionStart).toEqual(true)
      expect(autoSesh?.expiresAt).toBeTruthy()
      expect(autoSesh?.autoTrack).toBeTruthy()
    })

    it('should get a sessionId without affecting the session', () => {
      const user = new User()
      const session = user.getAndUpdateSession()
      const sesh = store.get(seshKey) as unknown as SessionInfo
      expect(session?.sessionId).toBeTruthy()

      user.sessionId()
      user.sessionId()
      user.sessionId()
      const notUpdated = store.get(seshKey) as unknown as SessionInfo
      expect(user.sessionId()).toEqual(session?.sessionId)
      expect(notUpdated.expiresAt).toEqual(sesh.expiresAt)
      expect(notUpdated.id).toEqual(sesh.id)
    })
  })
})
