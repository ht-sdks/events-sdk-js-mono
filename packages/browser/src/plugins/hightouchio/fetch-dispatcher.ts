import { fetch } from '../../lib/fetch'

export type Dispatcher = (url: string, body: object) => Promise<unknown>

export type StandardDispatcherConfig = {
  keepalive?: boolean
}

export const keepaliveLimit = 64 * 1024
export const byteLength = (body: string): number => new Blob([body]).size
let reserved = 0
const pending = new Set<Promise<Response>>()

export async function post(
  url: string,
  body: string,
  keepalive?: boolean
): Promise<Response> {
  const size = keepalive ? byteLength(body) : 0
  const useKeepalive = keepalive && size <= keepaliveLimit
  if (useKeepalive) {
    while (reserved + size > keepaliveLimit) {
      await Promise.race(Array.from(pending)).catch(() => {})
    }
    reserved += size
  }
  let request: Promise<Response> | undefined
  try {
    request = Promise.resolve(
      fetch(url, {
        keepalive: useKeepalive,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        method: 'post',
        body,
      })
    )
    if (useKeepalive) pending.add(request)
    return await request
  } finally {
    if (useKeepalive) {
      reserved -= size
      if (request) pending.delete(request)
    }
  }
}

export default function (config?: StandardDispatcherConfig): {
  dispatch: Dispatcher
} {
  return {
    dispatch: (url, body) => post(url, JSON.stringify(body), config?.keepalive),
  }
}
