// https://github.com/rudderlabs/rudder-sdk-js/blob/3a818accd24e6b3667c75a6b60fb12aba36bdf7e/packages/analytics-js/LICENSE
// MIT License

// Copyright (c) 2021 RudderStack

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

export type SessionInfo = {
  autoTrack?: boolean
  manualTrack?: boolean
  timeout?: number
  expiresAt?: number
  id?: number
  sessionStart?: boolean
}

export type SessionContext = {
  sessionId?: number
  sessionStart?: boolean
}

/**
 * A function to validate current session and return true/false depending on that
 * @returns boolean
 */
export const hasSessionExpired = (expiresAt: number): boolean => {
  const timestamp = Date.now()
  return Boolean(timestamp > expiresAt)
}

const generateSessionId = (): number => Date.now()

export const isManualSessionIdValid = (sessionId?: number): boolean => {
  if (
    !sessionId ||
    sessionId.toString().startsWith('-') ||
    sessionId.toString().length < 10
  ) {
    return false
  }
  return true
}

const MIN_SESSION_TIMEOUT_MS = 10 * 1000 // 10 seconds
const DEFAULT_SESSION_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

/**
 * A function to generate new auto tracking session
 * @param sessionTimeout current timestamp
 * @returns SessionInfo
 */
export const generateAutoTrackingSession = (
  sessionTimeout?: number
): SessionInfo => {
  const timestamp = Date.now()
  const timeout: number = sessionTimeout || DEFAULT_SESSION_TIMEOUT_MS
  if (timeout < MIN_SESSION_TIMEOUT_MS) {
    console.warn('Session timeouts of less than 10 seconds are not recommended')
  }
  return {
    id: timestamp, // set the current timestamp
    expiresAt: timestamp + timeout, // set the expiry time of the session
    timeout,
    sessionStart: true,
    autoTrack: true,
  }
}

/**
 * A function to generate new manual tracking session
 * @param id Provided sessionId
 * @returns SessionInfo
 */
export const generateManualTrackingSession = (id?: number): SessionInfo => {
  const sessionId: number = isManualSessionIdValid(id)
    ? (id as number)
    : generateSessionId()
  return {
    id: sessionId,
    sessionStart: true,
    manualTrack: true,
  }
}

export const updateSessionExpiration = (session: SessionInfo): SessionInfo => {
  session.sessionStart = false
  if (session.autoTrack) {
    session.expiresAt = session.expiresAt! + session.timeout!
  }
  return session
}
