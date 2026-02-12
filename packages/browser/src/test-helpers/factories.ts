// Using `any` return type to be compatible with both native Response and unfetch's UnfetchResponse
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createSuccess = (
  body: any,
  overrides: Partial<Response> = {}
): Promise<any> => {
  return Promise.resolve({
    json: () => Promise.resolve(body),
    ok: true,
    status: 200,
    statusText: 'OK',
    ...overrides,
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createError = (
  overrides: Partial<Response> = {}
): Promise<any> => {
  return Promise.resolve({
    ok: false,
    status: 404,
    statusText: 'Not Found',
    ...overrides,
  })
}
