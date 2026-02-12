import { LegacySettings } from '../..'
import { createSuccess } from '../factories'
import { cdnSettingsMinimal } from './cdn-settings'

// Using a more generic type signature to be compatible with unfetch mock
export const createMockFetchImplementation = (
  cdnSettings: Partial<LegacySettings> = cdnSettingsMinimal
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): ((...args: any[]) => Promise<any>) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (url: any, req?: any) => {
    const reqUrl = url.toString()
    if (
      !req ||
      (req.method === 'get' && reqUrl.includes('cdn.hightouch-events.com'))
    ) {
      // GET https://cdn.hightouch-events.com/v1/projects/{writeKey}
      return createSuccess({ ...cdnSettingsMinimal, ...cdnSettings })
    }

    if (
      req?.method === 'post' &&
      reqUrl.includes('us-east-1.hightouch-events.com')
    ) {
      // POST https://us-east-1.hightouch-events.com/v1/{event.type}
      return createSuccess({ success: true }, { status: 201 })
    }

    throw new Error(
      `no match found for request (url:${url}, req:${JSON.stringify(req)})`
    )
  }
}
