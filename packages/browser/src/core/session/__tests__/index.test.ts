import {
  hasSessionExpired,
  isManualSessionIdValid,
  updateSessionExpiration,
} from '..'

describe('()', () => {
  it('hasSessionExpired', () => {
    const past = Date.now() - 10000
    expect(hasSessionExpired(past)).toEqual(true)
    const future = Date.now() + 10000
    expect(hasSessionExpired(future)).toEqual(false)
  })

  it('isManualSessionIdValid', () => {
    expect(isManualSessionIdValid(-100)).toBe(false)
    expect(isManualSessionIdValid(100)).toBe(false)
    expect(isManualSessionIdValid()).toBe(false)
    expect(isManualSessionIdValid(Date.now())).toBe(true)
  })

  it('updateSessionExpiration', () => {
    expect(updateSessionExpiration({})).toEqual({ sessionStart: false })
    expect(updateSessionExpiration({ sessionStart: true })).toEqual({
      sessionStart: false,
    })
    expect(
      updateSessionExpiration({
        autoTrack: true,
        expiresAt: 10,
        timeout: 15,
        sessionStart: false,
      })
    ).toEqual({
      autoTrack: true,
      expiresAt: 25,
      timeout: 15,
      sessionStart: false,
    })
  })
})
