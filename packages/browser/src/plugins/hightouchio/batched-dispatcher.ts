import { HightouchEvent } from '../../core/events'
import { onPageChange } from '../../lib/on-page-change'
import { post, byteLength, keepaliveLimit } from './fetch-dispatcher'

export type BatchingDispatchConfig = {
  size?: number
  timeout?: number
}

type Entry = {
  data: string
  onRequest?: (request: Promise<Response>) => Promise<void>
}

export default function batch(
  apiHost: string,
  config?: BatchingDispatchConfig,
  protocol = 'https'
) {
  let entries: Entry[] = []
  let bytes = 0
  let writeKey: string | undefined
  let pageUnloaded = false
  let timer: ReturnType<typeof setTimeout> | undefined

  async function flush(): Promise<void> {
    clearTimeout(timer)
    timer = undefined
    if (!entries.length) return
    const group = entries
    entries = []
    bytes = 0
    const header =
      writeKey === undefined ? '' : `"writeKey":${JSON.stringify(writeKey)},`
    const prefix = `{${header}"batch":[`
    const suffix = `],"sentAt":"${new Date().toISOString()}"}`
    const overhead = byteLength(prefix + suffix)
    let chunk: Entry[] = []
    let length = overhead
    const requests: Promise<unknown>[] = []
    const send = (items: Entry[]): void => {
      const body = prefix + items.map((item) => item.data).join(',') + suffix
      const request = post(
        `${protocol}://${apiHost}/v1/batch`,
        body,
        pageUnloaded
      )
      for (const { onRequest } of items)
        requests.push(onRequest ? onRequest(request) : request)
    }
    for (const item of group) {
      const size = byteLength(item.data)
      if (pageUnloaded && chunk.length && length + 1 + size > keepaliveLimit) {
        send(chunk)
        chunk = []
        length = overhead
      }
      length += size + (chunk.length ? 1 : 0)
      chunk.push(item)
    }
    send(chunk)
    await Promise.all(requests)
  }

  onPageChange((unloaded) => {
    pageUnloaded = unloaded
    if (unloaded) void flush().catch(console.error)
  })

  async function dispatch(
    _url: string,
    body: object,
    onRequest?: Entry['onRequest']
  ): Promise<void> {
    const { sentAt, ...event } = body as HightouchEvent
    const data = JSON.stringify(event)
    if (!entries.length) writeKey = event.writeKey
    entries.push({ data, onRequest })
    bytes += byteLength(data) + 1
    if (
      pageUnloaded ||
      entries.length >= (config?.size ?? 10) ||
      bytes >= 450 * 1024
    ) {
      await flush()
    } else if (!timer) {
      timer = setTimeout(
        () => void flush().catch(console.error),
        config?.timeout ?? 5000
      )
    }
  }
  return { dispatch }
}
