import unfetch from 'unfetch'

// Type for unfetch response (subset of Response)
type UnfetchResponse = Awaited<ReturnType<typeof unfetch>>

export const createSuccess = (
  body: unknown,
  overrides: Partial<UnfetchResponse> = {}
): Promise<UnfetchResponse> => {
  return Promise.resolve({
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    ok: true,
    status: 200,
    statusText: 'OK',
    ...overrides,
  } as UnfetchResponse)
}

export const createError = (
  overrides: Partial<UnfetchResponse> = {}
): Promise<UnfetchResponse> => {
  return Promise.resolve({
    json: () => Promise.reject(new Error('Not Found')),
    text: () => Promise.resolve('Not Found'),
    ok: false,
    status: 404,
    statusText: 'Not Found',
    ...overrides,
  } as UnfetchResponse)
}

// Helper for creating typed mock fetch implementations
export const createMockFetch = (
  response: Promise<UnfetchResponse>
): typeof unfetch => {
  return (() => response) as typeof unfetch
}

export type { UnfetchResponse }
