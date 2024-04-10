import { fetch } from '../../lib/fetch'

type DeferredRequest = () => Promise<Response>

export type HTTPCookieServiceOptions = {
  renewUrl: string
  clearUrl: string
  retries?: number
  backoff?: number
  flushInterval?: number
}

/**
 * `HTTPCookieService.load(...)` should be awaited inside `loadAnalytics(...)`.
 * If the server can recreate an expired "Browser Cookie", by inspecting existing
 * "Server Cookies", we should delay dispatching events until receiving the Cookie.
 *
 *  dispatch$Method class methods should be used after any cookie interactions:
 * `dispatchCreate()` should be called after creating any new browser cookies.
 * `dispatchClear()` should be called after clearing any browser cookies.
 *
 * Manual `startQueueConsumer()` or `stopQueueConsumer()` is not usually necessary.
 *
 * Glossary:
 * "Server Cookies": `HTTPOnly:true`, stored on client, but only server can access.
 * "Browser Cookies": `HTTPOnly:false`, stored on client, and both client and server can access.
 */
export class HTTPCookieService {
  private queue: DeferredRequest[]
  private renewUrl: string
  private clearUrl: string
  private retries: number
  private backoff: number
  private flushInterval: number
  private flushIntervalId?: NodeJS.Timer

  private constructor(options: HTTPCookieServiceOptions) {
    const urls = HTTPCookieService.urlHelper(options)
    this.renewUrl = urls.renewUrl
    this.clearUrl = urls.clearUrl

    this.backoff = options.backoff ?? 300
    this.retries = options.retries ?? 3
    this.flushInterval = options.flushInterval ?? 1000
    this.queue = []
  }

  static urlHelper(options: HTTPCookieServiceOptions): {
    renewUrl: string
    clearUrl: string
  } {
    const origin = window.location.origin
    return {
      renewUrl: new URL(options.renewUrl, origin).href,
      clearUrl: new URL(options.clearUrl, origin).href,
    }
  }

  static async load(
    options: HTTPCookieServiceOptions
  ): Promise<HTTPCookieService> {
    const cookieService = new HTTPCookieService(options)

    // renew any existing HTTPCookies already on the device
    // we want `load()` to block on this, so await directly instead of calling dispatch
    const req = cookieService.sendHTTPCookies(cookieService.renewUrl)
    await retry(req, cookieService.retries, cookieService.backoff).catch(
      console.error
    )

    // consume HTTPCookie actions, sequentially, as needed
    cookieService.startQueueConsumer()

    return cookieService
  }

  dispatchCreate() {
    this.queue.push(this.sendHTTPCookies(this.renewUrl))
  }

  dispatchClear() {
    this.queue.push(this.sendHTTPCookies(this.clearUrl))
  }

  startQueueConsumer() {
    if (this.flushIntervalId) {
      console.error('HTTPCookie queue consumer is already running.')
      return
    }
    const bound = this.consumeQueue.bind(this)
    this.flushIntervalId = setInterval(
      () => bound().catch(console.error),
      this.flushInterval
    )
  }

  stopQueueConsumer() {
    if (!this.flushIntervalId) {
      console.error('HTTPCookie queue consumer is already stopped.')
      return
    }
    clearInterval(this.flushIntervalId)
    this.flushIntervalId = undefined
  }

  private sendHTTPCookies(serviceUrl: string): DeferredRequest {
    return async function (): Promise<Response> {
      return await fetch(serviceUrl, {
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        method: 'post',
        body: JSON.stringify({
          sentAt: new Date().toISOString(),
        }),
      })
    }
  }

  /**
   * This queue exists to avoid race conditions.
   *
   * Customer-developers may not `await` all promises.
   *
   * Therefore, introducing async code into analytics.track(), etc
   * could create race conditions in customer code.
   *
   * The queue enforces: if someone calls analytics.clear()
   * before calling analytics.identify(), the cookie service
   * will consume those actions, sequentially, even if no promises
   * are awaited.
   */
  private async consumeQueue() {
    while (this.queue.length > 0) {
      const req = this.queue.shift() as DeferredRequest
      await retry(req, this.retries, this.backoff).catch(console.error)
    }
  }
}

async function sleep(delayMS: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMS))
}

async function retry(
  req: DeferredRequest,
  retries: number,
  backoff: number
): Promise<Response> {
  while (retries >= 0) {
    try {
      return await req().then((res) => {
        if (res.ok) return res
        throw new Error(`Status: ${res.status} ${res.statusText}`)
      })
    } catch (error) {
      retries -= 1
      if (retries <= 0) throw error
      await sleep(backoff)
    }
  }
  throw Error('HtEvents: Problem with DeferredRequest')
}
