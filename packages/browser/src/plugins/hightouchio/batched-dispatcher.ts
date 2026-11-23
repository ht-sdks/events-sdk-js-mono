import { HightouchEvent } from '../../core/events'
import { createDeferred } from '../../lib/create-deferred'
import { fetch } from '../../lib/fetch'
import { onPageChange } from '../../lib/on-page-change'

export type BatchingDispatchConfig = {
  size?: number
  timeout?: number
}

type Entry = {
  body: object
  receipt: ReturnType<typeof createDeferred<Response>>
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

  function sendBatch(batch: Entry[]) {
    if (batch.length === 0) {
      return
    }

    const writeKey = (batch[0].body as HightouchEvent)?.writeKey

    // Remove sentAt from every event as batching only needs a single timestamp
    const updatedBatch = batch.map(({ body }) => {
      const { sentAt, ...newEvent } = body as HightouchEvent
      return newEvent
    })

    return Promise.resolve(
      fetch(`${protocol}://${apiHost}/v1/batch`, {
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
    ).then(
      (response) => batch.forEach(({ receipt }) => receipt.resolve(response)),
      (error) => batch.forEach(({ receipt }) => receipt.reject(error))
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

  onPageChange((unloaded) => {
    pageUnloaded = unloaded

    if (pageUnloaded && buffer.length) {
      const reqs = chunks(buffer).map(sendBatch)
      buffer = []
      Promise.all(reqs).catch(console.error)
    }
  })

  async function dispatch(_url: string, body: object): Promise<unknown> {
    const receipt = createDeferred<Response>()
    buffer.push({ body, receipt })

    const bufferOverflow =
      buffer.length >= limit ||
      approachingTrackingAPILimit(buffer.map((entry) => entry.body))

    if (bufferOverflow || pageUnloaded) void flush()
    else scheduleFlush()
    return receipt.promise
  }

  return {
    dispatch,
  }
}
