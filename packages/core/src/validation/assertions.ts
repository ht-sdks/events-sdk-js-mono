import { CoreHightouchEvent } from '../events'
import { ValidationError } from './errors'
import { isString, isPlainObject, exists } from './helpers'

const stringError = 'is not a string'
const objError = 'is not an object'
const nilError = 'is nil'

export function assertUserIdentity(event: CoreHightouchEvent): void {
  const USER_FIELD_NAME = '.userId/anonymousId/previousId/groupId'

  const getAnyUserId = (event: CoreHightouchEvent) =>
    event.userId ?? event.anonymousId ?? event.groupId ?? event.previousId

  const id = getAnyUserId(event)
  if (!exists(id)) {
    throw new ValidationError(USER_FIELD_NAME, nilError)
  } else if (!isString(id)) {
    throw new ValidationError(USER_FIELD_NAME, stringError)
  }
}

export function assertEventExists(
  event?: CoreHightouchEvent | null
): asserts event is CoreHightouchEvent {
  if (!exists(event)) {
    throw new ValidationError('Event', nilError)
  }
  if (typeof event !== 'object') {
    throw new ValidationError('Event', objError)
  }
}

export function assertEventType(event: CoreHightouchEvent): void {
  if (!isString(event.type)) {
    throw new ValidationError('.type', stringError)
  }
}

export function assertTrackEventName(event: CoreHightouchEvent): void {
  if (!isString(event.event)) {
    throw new ValidationError('.event', stringError)
  }
}

export function assertTrackEventProperties(event: CoreHightouchEvent): void {
  if (!isPlainObject(event.properties)) {
    throw new ValidationError('.properties', objError)
  }
}

export function assertTraits(event: CoreHightouchEvent): void {
  if (!isPlainObject(event.traits)) {
    throw new ValidationError('.traits', objError)
  }
}

export function validateEvent(event?: CoreHightouchEvent | null) {
  assertEventExists(event)
  assertEventType(event)

  if (event.type === 'track') {
    assertTrackEventName(event)
    assertTrackEventProperties(event)
  }

  if (['group', 'identify'].includes(event.type)) {
    assertTraits(event)
  }

  assertUserIdentity(event)
}
