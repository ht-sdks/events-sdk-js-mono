import { isOffline } from '../../core/connection'
import { Context } from '../../core/context'
import { Plugin } from '../../core/plugin'
import { attempt } from '@ht-sdks/events-sdk-js-core'
import { pWhile } from '../../lib/p-while'
import { PriorityQueue } from '../../lib/priority-queue'

async function flushQueue(
  xt: Plugin,
  queue: PriorityQueue<Context>
): Promise<PriorityQueue<Context>> {
  const failedQueue: Context[] = []
  if (isOffline()) {
    return queue
  }

  await pWhile(
    () => queue.length > 0 && !isOffline(),
    async () => {
      const ctx = queue.pop()
      if (!ctx) {
        return
      }

      const result = await attempt(ctx, xt)
      const success = result instanceof Context
      if (!success) {
        failedQueue.push(ctx)
      }
    }
  )
  // re-add failed tasks
  failedQueue.map((failed) => queue.pushWithBackoff(failed))
  return queue
}

const scheduled = new WeakSet<PriorityQueue<Context>>()

export function scheduleFlush(
  buffer: PriorityQueue<Context>,
  xt: Plugin
): void {
  if (scheduled.has(buffer)) return
  scheduled.add(buffer)
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  setTimeout(async () => {
    try {
      await flushQueue(xt, buffer)
    } finally {
      scheduled.delete(buffer)
      if (buffer.todo > 0) scheduleFlush(buffer, xt)
    }
  }, Math.random() * 5000)
}
