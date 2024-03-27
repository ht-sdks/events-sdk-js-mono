import { Context } from '../../../app/context'
import { HTTPClientRequest } from '../../../lib/http-client'

/**
 * These map to the data properties of the HTTPClient options (the input value of 'makeRequest')
 */
export const httpClientOptionsBodyMatcher = {
  messageId: expect.stringMatching(/^\d*-\w*-\w*-\w*-\w*-\w*/),
  timestamp: expect.any(Date),
  _metadata: expect.any(Object),
  context: {
    library: {
      name: '@ht-sdks/events-sdk-js-node',
      version: expect.any(String),
    },
  },
  integrations: {},
}

export function assertHTTPRequestOptions(
  { data, headers, method, url }: HTTPClientRequest,
  contexts: Context[]
) {
  expect(url).toBe('https://us-east-1.hightouch-events.com/v1/batch')
  expect(method).toBe('POST')
  expect(headers).toMatchInlineSnapshot(`
    {
      "Authorization": "Basic Og==",
      "Content-Type": "application/json",
      "User-Agent": "events-sdk-js-node/latest",
    }
  `)

  expect(data.batch).toHaveLength(contexts.length)
  let idx = 0
  for (const context of contexts) {
    expect(data.batch[idx]).toEqual({
      ...context.event,
      ...httpClientOptionsBodyMatcher,
    })
    idx += 1
  }
}
