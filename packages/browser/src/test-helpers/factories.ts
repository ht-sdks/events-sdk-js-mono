import type unfetch from 'unfetch'

/**
 * The response type returned by unfetch. We derive it here because unfetch
 * does not export its UnfetchResponse type directly.
 */
export type UnfetchResponse = Awaited<ReturnType<typeof unfetch>>

export const createSuccess = (
  body: any,
  overrides: Partial<UnfetchResponse> = {}
) => {
  return Promise.resolve({
    json: () => Promise.resolve(body),
    ok: true,
    status: 200,
    statusText: 'OK',
    ...overrides,
  }) as Promise<UnfetchResponse>
}

export const createError = (overrides: Partial<UnfetchResponse> = {}) => {
  return Promise.resolve({
    ok: false,
    status: 404,
    statusText: 'Not Found',
    ...overrides,
  }) as Promise<UnfetchResponse>
}
