import { PriorityQueue } from '@ht-sdks/events-sdk-js-core'
import { Context, SerializedContext } from '../../core/context'
import { HightouchEvent } from '../../core/events'
import { isBrowser } from '../../core/environment'

let loc:
  | Storage
  | { getItem: () => void; setItem: () => void; removeItem: () => void } = {
  getItem() {},
  setItem() {},
  removeItem() {},
}

try {
  loc = isBrowser() && window.localStorage ? window.localStorage : loc
} catch (err) {
  console.warn('Unable to access localStorage', err)
}

type Checkpoint = SerializedContext & {
  normalized?: boolean
  deferred?: boolean
  retryAt?: number
}

function persisted(key: string): Checkpoint[] {
  const items = loc.getItem(key)
  return items ? JSON.parse(items) : []
}

function persistItems(key: string, items: Checkpoint[]): void {
  const existing = persisted(key)
  const all = [...existing, ...items]

  const merged = all.reduce(
    (acc, item) => {
      return {
        ...acc,
        [item.id]: item,
      }
    },
    {} as Record<string, Checkpoint>
  )

  loc.setItem(key, JSON.stringify(Object.values(merged)))
}

function seen(key: string): Record<string, number> {
  const stored = loc.getItem(key)
  return stored ? JSON.parse(stored) : {}
}

function persistSeen(key: string, memory: Record<string, number>): void {
  const stored = seen(key)

  loc.setItem(
    key,
    JSON.stringify({
      ...stored,
      ...memory,
    })
  )
}

function remove(key: string): void {
  loc.removeItem(key)
}

const now = (): number => new Date().getTime()

function mutex(
  key: string,
  onUnlock: Function,
  attempt = 0
): Promise<void> | undefined {
  const lockTimeout = 50
  const lockKey = `persisted-queue:v1:${key}:lock`

  const expired = (lock: number): boolean => new Date().getTime() > lock
  const rawLock = loc.getItem(lockKey)
  const lock = rawLock ? (JSON.parse(rawLock) as number) : null

  const allowed = lock === null || expired(lock)
  if (allowed) {
    loc.setItem(lockKey, JSON.stringify(now() + lockTimeout))
    onUnlock()
    loc.removeItem(lockKey)
    return
  }

  if (!allowed && attempt < 3) {
    return new Promise((resolve) => {
      setTimeout(() => resolve(mutex(key, onUnlock, attempt + 1)), lockTimeout)
    })
  } else {
    console.error('Unable to retrieve lock')
  }
}

export class PersistedPriorityQueue extends PriorityQueue<Context> {
  readonly waiting = new Set<Context>()
  restoring?: Promise<void>
  retryAt = 0
  private persistedIds = new Set<string>()

  constructor(
    maxAttempts: number,
    private key: string,
    pending: () => Context[] = () => [],
    held?: Set<Context>,
    snapshots?: WeakMap<Context, HightouchEvent>
  ) {
    super(maxAttempts, [])

    const itemsKey = `persisted-queue:v1:${key}:items`
    const seenKey = `persisted-queue:v1:${key}:seen`
    const waitingPrefix = `${itemsKey}:waiting:`

    const wasDeferred = new WeakSet<Context>()
    const saved: Context[] = []
    let lastSeen: Record<string, number> = {}

    this.restoring = mutex(key, () => {
      try {
        for (const entry of Object.keys(loc).filter((name) =>
          name.startsWith(waitingPrefix)
        )) {
          persistItems(itemsKey, persisted(entry))
          remove(entry)
        }
        for (const { event, id, normalized, deferred, retryAt } of persisted(
          itemsKey
        )) {
          if (retryAt && retryAt > this.retryAt) this.retryAt = retryAt
          if (this.persistedIds.has(id)) continue // Already waiting on this page.
          const ctx = new Context(event, id)
          if (normalized) snapshots?.set(ctx, event)
          if (deferred && held) {
            held.add(ctx)
            wasDeferred.add(ctx)
          } else saved.push(ctx)
        }
        lastSeen = seen(seenKey)
        remove(itemsKey)
        remove(seenKey)

        this.queue = [...saved, ...this.queue]
        this.seen = { ...lastSeen, ...this.seen }
      } catch (err) {
        console.error(err)
      }
    })

    if (this.restoring)
      void this.restoring.then(() => {
        this.restoring = undefined
      })

    window.addEventListener('pagehide', () => {
      // Checkpoint pending requests without adding them to the live retry queue.
      held?.forEach((ctx) => wasDeferred.add(ctx))
      const items = [...this.queue, ...this.future, ...Array.from(held ?? [])]
      // A closing page cannot wait for another tab's storage lock.
      const waiting = Array.from(this.waiting)
      if (waiting.length) {
        const records = waiting.map((ctx) => {
          this.persistedIds.add(ctx.id)
          return {
            ...ctx.toJSON(),
            event: snapshots?.get(ctx) ?? ctx.event,
            normalized: !!snapshots?.has(ctx),
          }
        })
        loc.setItem(waitingPrefix + waiting[0].id, JSON.stringify(records))
      }
      const attempts = { ...this.seen }
      // Reserve recovery attempts without consuming the live retry budget.
      for (const item of pending()) {
        if (wasDeferred.has(item)) {
          items.push(item)
          continue
        }
        attempts[item.id] = this.getAttempts(item) + 1
        if (attempts[item.id] <= this.maxAttempts) items.push(item)
      }
      if (items.length > 0) {
        items.forEach((item) => this.persistedIds.add(item.id))
        try {
          void mutex(key, () => {
            // Requests may be acknowledged while the checkpoint waits for the lock.
            persistItems(
              itemsKey,
              items
                .filter((item) => this.persistedIds.has(item.id))
                .map((item) => {
                  const event = snapshots?.get(item)
                  const stored = {
                    ...item.toJSON(),
                    deferred: wasDeferred.has(item) || undefined,
                    retryAt: this.retryAt > now() ? this.retryAt : undefined,
                  }
                  return event ? { ...stored, event, normalized: true } : stored
                })
            )
            for (const id of Object.keys(this.seen)) {
              attempts[id] = Math.max(attempts[id] ?? 0, this.seen[id])
            }
            persistSeen(seenKey, attempts)
          })
        } catch (err) {
          console.error(err)
        }
      }
    })
  }

  acknowledge(item: Context): void {
    if (!this.persistedIds.delete(item.id)) return

    try {
      void mutex(this.key, () => {
        const itemsKey = `persisted-queue:v1:${this.key}:items`
        const remaining = persisted(itemsKey).filter(
          (ctx) => ctx.id !== item.id
        )
        loc.setItem(itemsKey, JSON.stringify(remaining))
      })
    } catch (err) {
      console.error(err)
    }
  }
}
