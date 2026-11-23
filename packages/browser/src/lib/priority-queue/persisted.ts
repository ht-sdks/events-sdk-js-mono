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

function persisted(key: string): Context[] {
  const items = loc.getItem(key)
  return (items ? JSON.parse(items) : []).map(
    (p: SerializedContext) => new Context(p.event, p.id)
  )
}

function persistItems(key: string, items: Context[]): void {
  const existing = persisted(key)
  const all = [...items, ...existing]

  const merged = all.reduce(
    (acc, item) => {
      return {
        ...acc,
        [item.id]: item,
      }
    },
    {} as Record<string, Context>
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
    pending: () => Context[] = () => []
  ) {
    super(maxAttempts, [])

    const itemsKey = `persisted-queue:v1:${key}:items`
    const seenKey = `persisted-queue:v1:${key}:seen`

    let saved: Context[] = []
    let lastSeen: Record<string, number> = {}

    mutex(key, () => {
      try {
        saved = persisted(itemsKey)
        lastSeen = seen(seenKey)
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
        if (attempts[item.id] <= this.maxAttempts) items.push(item)
      }
      if (items.length > 0) {
        items.forEach((item) => this.persistedIds.add(item.id))
        try {
          mutex(key, () => {
            // Requests may be acknowledged while the checkpoint waits for the lock.
            persistItems(
              itemsKey,
              items.filter((item) => this.persistedIds.has(item.id))
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

// One storage key per context lets an acknowledgment remove its own record
// without rewriting a snapshot another tab may be updating.
export class DurablePriorityQueue extends PriorityQueue<Context> {
  readonly restored: Context[] = []
  private prefix: string

  constructor(
    maxAttempts: number,
    key: string,
    private snapshots?: WeakMap<Context, HightouchEvent>
  ) {
    super(maxAttempts, [])
    this.prefix = `persisted-queue:v2:${encodeURIComponent(key)}:`
    try {
      for (const name of Object.keys(window.localStorage)) {
        if (!name.startsWith(this.prefix)) continue
        try {
          const record = JSON.parse(window.localStorage.getItem(name)!)
          const ctx = new Context(record.event, record.id)
          if (!record.event?.type || name !== this.prefix + ctx.id) {
            throw new Error('Invalid persisted event')
          }
          if (record.recoveries >= maxAttempts) {
            this.acknowledge(ctx)
            console.error(
              'Recovery attempts exhausted for',
              ctx.event.messageId
            )
            continue
          }
          if (record.normalized) this.snapshots?.set(ctx, record.event)
          this.restored.push(ctx)
          this.seen[ctx.id] = record.attempts ?? 0
          this.recoveries[ctx.id] = (record.recoveries ?? 0) + 1
        } catch (error) {
          console.error('Unable to restore persisted event', error)
        }
      }
      const legacy = `persisted-queue:v1:${key}`
      const items = persisted(legacy + ':items')
      const attempts = seen(legacy + ':seen')
      let migrated = true
      for (const ctx of items) {
        if (this.restored.some((item) => item.id === ctx.id)) continue
        this.restored.push(ctx)
        this.seen[ctx.id] = attempts[ctx.id] ?? 0
        migrated = this.retain(ctx) && migrated
      }
      if (migrated && items.length) {
        remove(legacy + ':items')
        remove(legacy + ':seen')
      }
    } catch (error) {
      console.error('Unable to read the persisted queue', error)
    }
  }

  private recoveries: Record<string, number> = {}

  retain(ctx: Context): boolean {
    try {
      window.localStorage.setItem(
        this.prefix + ctx.id,
        JSON.stringify({
          id: ctx.id,
          event: this.snapshots?.get(ctx) ?? ctx.event,
          normalized: this.snapshots?.has(ctx) || undefined,
          attempts: this.getAttempts(ctx),
          recoveries: this.recoveries[ctx.id] ?? 0,
        })
      )
      return true
    } catch (error) {
      console.error('Unable to persist queued event', error)
      return false
    }
  }

  acknowledge(ctx: Context): void {
    try {
      window.localStorage.removeItem(this.prefix + ctx.id)
      delete this.recoveries[ctx.id]
    } catch (error) {
      console.error('Unable to remove acknowledged event', error)
    }
  }
}
