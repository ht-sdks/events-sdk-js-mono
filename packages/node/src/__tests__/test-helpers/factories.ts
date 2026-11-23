export const createSuccess = (body?: any) => {
  return Promise.resolve({
    json: () => Promise.resolve(body),
    ok: true,
    status: 200,
    statusText: 'OK',
  }) as Promise<Response>
}

export const createError = (overrides: Partial<Response> = {}) => {
  return Promise.resolve({
    ok: false,
    status: 302,
    statusText: 'Found',
    ...overrides,
  }) as Promise<Response>
}
