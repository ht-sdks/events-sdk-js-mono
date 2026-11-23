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
    status: 503,
    statusText: 'Service Unavailable',
    ...overrides,
  }) as Promise<Response>
}
