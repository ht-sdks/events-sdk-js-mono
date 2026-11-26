import { PriorityQueue } from './index'
import { Context, SerializedContext } from '../../core/context'
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

type Checkpoint = SerializedContext & { recovering?: boolean }

function persisted(key: string): Checkpoint[] {
  const items = loc.getItem(key)
  return items ? JSON.parse(items) : []
}

function persistItems(
  key: string,
  items: Context[],
  recovering?: WeakSet<Context>
): void {
  const all = [
    ...persisted(key),
    ...items.map((item) => ({
      ...item.toJSON(),
      recovering: recovering?.has(item) || undefined,
    })),
  ]

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

function mutex(key: string, onUnlock: Function, attempt = 0): void {
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
    setTimeout(() => {
      mutex(key, onUnlock, attempt + 1)
    }, lockTimeout)
  } else {
    console.error('Unable to retrieve lock')
  }
}

export class PersistedPriorityQueue extends PriorityQueue<Context> {
  private persistedIds = new Set<string>()

  constructor(
    maxAttempts: number,
    private key: string,
    pending: () => Context[] = () => [],
    recovering?: WeakSet<Context>
  ) {
    super(maxAttempts, [])

    const itemsKey = `persisted-queue:v1:${key}:items`
    const seenKey = `persisted-queue:v1:${key}:seen`

    mutex(key, () => {
      try {
        const saved = persisted(itemsKey).map((item) => {
          const ctx = new Context(item.event, item.id)
          if (item.recovering) recovering?.add(ctx)
          return ctx
        })
        const lastSeen = seen(seenKey)
        remove(itemsKey)
        remove(seenKey)

        this.queue = [...saved, ...this.queue]
        this.seen = { ...lastSeen, ...this.seen }
      } catch (err) {
        console.error(err)
      }
    })

    window.addEventListener('pagehide', () => {
      // Checkpoint pending requests without adding them to the live retry queue.
      const items = [...this.queue, ...this.future]
      const attempts = { ...this.seen }
      // Reserve recovery attempts without consuming the live retry budget.
      for (const item of pending()) {
        attempts[item.id] = this.getAttempts(item) + 1
        if (recovering?.has(item))
          attempts[item.id] = Math.min(attempts[item.id], this.maxAttempts)
        if (attempts[item.id] <= this.maxAttempts) items.push(item)
      }
      if (items.length > 0) {
        items.forEach((item) => this.persistedIds.add(item.id))
        try {
          mutex(key, () => {
            // Requests may be acknowledged while the checkpoint waits for the lock.
            persistItems(
              itemsKey,
              items.filter((item) => this.persistedIds.has(item.id)),
              recovering
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
      mutex(this.key, () => {
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
