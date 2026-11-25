import { HightouchEvent } from '../../core/events'
import { fetch } from '../../lib/fetch'
import { onPageChange } from '../../lib/on-page-change'

export type BatchingDispatchConfig = {
  size?: number
  timeout?: number
}

type Entry = {
  deferIfPaused?: () => boolean
  body: object
  onRequest?: (request: Promise<Response>) => Promise<void>
}

const MAX_PAYLOAD_SIZE = 500

function kilobytes(buffer: unknown): number {
  const size = encodeURI(JSON.stringify(buffer)).split(/%..|./).length - 1
  return size / 1024
}

/**
 * Checks if the payload is over or close to
 * the maximum payload size allowed by tracking
 * API.
 */
function approachingTrackingAPILimit(buffer: unknown): boolean {
  return kilobytes(buffer) >= MAX_PAYLOAD_SIZE - 50
}

function chunks(batch: Entry[]): Entry[][] {
  const result: Entry[][] = []
  let index = 0

  batch.forEach((item) => {
    const size = kilobytes(result[index]?.map((entry) => entry.body))
    if (size >= 64) {
      index++
    }

    if (result[index]) {
      result[index].push(item)
    } else {
      result[index] = [item]
    }
  })

  return result
}

export default function batch(
  apiHost: string,
  config?: BatchingDispatchConfig,
  protocol = 'https'
) {
  let buffer: Entry[] = []
  let pageUnloaded = false

  const limit = config?.size ?? 10
  const timeout = config?.timeout ?? 5000

  async function upload(batch: object[]) {
    const writeKey = (batch[0] as HightouchEvent)?.writeKey

    // Remove sentAt from every event as batching only needs a single timestamp
    const updatedBatch = batch.map((event) => {
      const { sentAt, ...newEvent } = event as HightouchEvent
      return newEvent
    })

    return fetch(`${protocol}://${apiHost}/v1/batch`, {
      keepalive: pageUnloaded,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      method: 'post',
      body: JSON.stringify({
        writeKey,
        batch: updatedBatch,
        sentAt: new Date().toISOString(),
      }),
    })
  }

  function sendBatch(entries: Entry[]) {
    const batch = entries.filter((entry) => !entry.deferIfPaused?.())
    if (!batch.length) return Promise.resolve([])
    const request = upload(batch.map((entry) => entry.body))
    return Promise.all(
      batch.map(({ onRequest }) => (onRequest ? onRequest(request) : request))
    )
  }

  async function flush(): Promise<unknown> {
    if (buffer.length) {
      const batch = buffer
      buffer = []
      return sendBatch(batch)
    }
  }

  let schedule: NodeJS.Timeout | undefined

  function scheduleFlush(): void {
    if (schedule) {
      return
    }

    schedule = setTimeout(() => {
      schedule = undefined
      flush().catch(console.error)
    }, timeout)
  }

  const pageChanged = (unloaded: boolean) => {
    pageUnloaded = unloaded

    if (pageUnloaded && buffer.length) {
      const reqs = chunks(buffer).map(sendBatch)
      buffer = []
      Promise.all(reqs).catch(console.error)
    }
  }
  let stopWatching = onPageChange(pageChanged)

  async function dispatch(
    _url: string,
    body: object,
    onRequest?: Entry['onRequest'],
    flushNow = false,
    deferIfPaused?: Entry['deferIfPaused']
  ): Promise<unknown> {
    buffer.push({ body, onRequest, deferIfPaused })

    const bufferOverflow =
      buffer.length >= limit ||
      approachingTrackingAPILimit(buffer.map((entry) => entry.body))

    return bufferOverflow || pageUnloaded || flushNow
      ? flush()
      : scheduleFlush()
  }

  return {
    dispatch,
    pause() {
      stopWatching()
      clearTimeout(schedule)
      schedule = undefined
    },
    resume() {
      pageUnloaded = false
      stopWatching = onPageChange(pageChanged)
      if (buffer.length) scheduleFlush()
    },
  }
}
