import { Facade } from '@segment/facade'
import { Analytics } from '../../core/analytics'
import { LegacySettings } from '../../browser'
import { isOffline } from '../../core/connection'
import { Context } from '../../core/context'
import { HightouchEvent } from '../../core/events'
import { Plugin } from '../../core/plugin'
import { PriorityQueue } from '../../lib/priority-queue'
import { PersistedPriorityQueue } from '../../lib/priority-queue/persisted'
import { toFacade } from '../../lib/to-facade'
import batch, { BatchingDispatchConfig } from './batched-dispatcher'
import standard, { StandardDispatcherConfig } from './fetch-dispatcher'
import { normalize } from './normalize'
import { scheduleFlush } from './schedule-flush'
import { HIGHTOUCH_API_HOST } from '../../core/constants'

type DeliveryStrategy =
  | {
      strategy?: 'standard'
      config?: StandardDispatcherConfig
    }
  | {
      strategy?: 'batching'
      config?: BatchingDispatchConfig
    }

export type HightouchioSettings = {
  apiKey: string
  apiHost?: string
  protocol?: 'http' | 'https'

  addBundledMetadata?: boolean
  unbundledIntegrations?: string[]
  bundledConfigIds?: string[]
  unbundledConfigIds?: string[]

  maybeBundledConfigIds?: Record<string, string[]>

  deliveryStrategy?: DeliveryStrategy
}

type JSON = ReturnType<Facade['json']>

const MAX_DEFERRED_EVENTS = 100

function onAlias(analytics: Analytics, json: JSON): JSON {
  const user = analytics.user()
  json.previousId =
    json.previousId ?? json.from ?? user.id() ?? user.anonymousId()
  json.userId = json.userId ?? json.to
  delete json.from
  delete json.to
  return json
}

export function hightouchio(
  analytics: Analytics,
  settings?: HightouchioSettings,
  integrations?: LegacySettings['integrations']
): Plugin {
  const inflightEvents = new Set<Context>()
  const held = new Set<Context>()
  const snapshots = new WeakMap<Context, HightouchEvent>()
  let probeScheduled = false
  let probeDelay = 1000
  const writeKey = settings?.apiKey ?? ''

  const buffer = analytics.options.disableClientPersistence
    ? new PriorityQueue<Context>(analytics.queue.queue.maxAttempts, [])
    : new PersistedPriorityQueue(
        analytics.queue.queue.maxAttempts,
        `${writeKey}:dest-Hightouch.io`,
        () => Array.from(inflightEvents),
        held,
        snapshots
      )

  const flushing = false

  const apiHost = settings?.apiHost ?? HIGHTOUCH_API_HOST
  const protocol = settings?.protocol ?? 'https'
  const remote = `${protocol}://${apiHost}`

  const deliveryStrategy = settings?.deliveryStrategy
  const batched =
    deliveryStrategy?.strategy === 'batching'
      ? batch(apiHost, deliveryStrategy.config, protocol)
      : undefined
  const client = standard(deliveryStrategy?.config as StandardDispatcherConfig)

  function defer(ctx: Context): void {
    // A failed probe goes to the back so another message can make progress.
    if (!held.delete(ctx) && held.size >= MAX_DEFERRED_EVENTS) {
      ctx.setFailedDelivery({ reason: 'Deferred delivery queue is full' })
      if (buffer instanceof PersistedPriorityQueue) buffer.acknowledge(ctx)
      snapshots.delete(ctx)
      return
    }
    held.add(ctx)
    scheduleProbe()
  }

  function remainingCooldown(): number {
    return buffer instanceof PersistedPriorityQueue
      ? Math.max(0, buffer.retryAt - Date.now())
      : 0
  }

  function scheduleProbe(immediate = false): void {
    if (probeScheduled || held.size === 0) return
    probeScheduled = true
    const delay = remainingCooldown() || (immediate ? 0 : probeDelay)
    if (buffer instanceof PersistedPriorityQueue)
      buffer.retryAt = Date.now() + delay
    setTimeout(async () => {
      const first = held.values().next().value
      try {
        if (first) await deliver(first, true)
      } finally {
        probeScheduled = false
        scheduleProbe(first && !held.has(first))
      }
    }, delay)
    if (!immediate) probeDelay = Math.min(probeDelay * 2, 60000)
  }

  const restoring =
    buffer instanceof PersistedPriorityQueue ? buffer.restoring : undefined
  const send = (ctx: Context): Promise<Context> =>
    restoring ? restoring.then(() => deliver(ctx, false)) : deliver(ctx, false)

  function snapshot(ctx: Context): HightouchEvent {
    const existing = snapshots.get(ctx)
    if (existing) return existing
    let json = toFacade(ctx.event).json()

    if (ctx.event.type === 'track') {
      delete json.traits
    }

    if (ctx.event.type === 'alias') {
      json = onAlias(analytics, json)
    }

    const event = {
      type: ctx.event.type,
      ...normalize(analytics, json, settings, integrations),
    }
    snapshots.set(ctx, event)
    return event
  }

  async function deliver(ctx: Context, probe: boolean): Promise<Context> {
    const event = snapshot(ctx)
    function deferIfPaused(): boolean {
      if (probe || (held.size === 0 && !remainingCooldown())) return false
      inflightEvents.delete(ctx)
      defer(ctx)
      return true
    }
    if (deferIfPaused()) return ctx
    if (probe && isOffline()) {
      defer(ctx)
      return ctx
    }
    if (isOffline()) {
      buffer.push(ctx)
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      scheduleFlush(flushing, buffer, hightouch, scheduleFlush)
      return ctx
    }

    inflightEvents.add(ctx)
    async function handle(request: Promise<unknown>): Promise<void> {
      try {
        const result = (await request) as Response | undefined
        if (result?.ok === false) {
          const { status } = result
          const reason = `HTTP ${status} for message ${ctx.event.messageId}`
          const transient =
            status === 408 || status === 429 || (status >= 500 && status < 600)
          if (transient && analytics.options.retryQueue) throw new Error(reason)
          if (![401, 403, 404].includes(status)) {
            ctx.setFailedDelivery({ reason })
            ctx.log('error', reason)
          }
        }
        if (probe) {
          probeDelay = 1000
          held.delete(ctx)
        }
        if (result && buffer instanceof PersistedPriorityQueue)
          buffer.acknowledge(ctx)
        snapshots.delete(ctx)
      } catch (error) {
        if (probe && !analytics.options.retryQueue) held.delete(ctx)
        if (held.size && analytics.options.retryQueue) {
          defer(ctx)
        } else if (buffer.pushWithBackoff(ctx)) {
          // eslint-disable-next-line @typescript-eslint/no-use-before-define
          scheduleFlush(flushing, buffer, hightouch, scheduleFlush)
        } else if (analytics.options.retryQueue) {
          defer(ctx)
        } else {
          ctx.setFailedDelivery({ reason: error })
          if (buffer instanceof PersistedPriorityQueue) buffer.acknowledge(ctx)
          snapshots.delete(ctx)
        }
      } finally {
        inflightEvents.delete(ctx)
      }
    }
    const url = `${remote}/v1/${event.type}`
    const body = { ...event, sentAt: new Date() }
    if (batched) await batched.dispatch(url, body, handle, probe, deferIfPaused)
    else await handle(client.dispatch(url, body))
    return ctx
  }

  const hightouch: Plugin = {
    name: 'Hightouch.io',
    type: 'after',
    version: '0.1.0',
    isLoaded: (): boolean => true,
    load: (): Promise<void> => Promise.resolve(),
    track: send,
    identify: send,
    page: send,
    alias: send,
    group: send,
    screen: send,
  }

  // Buffer may already have items if they were previously stored in localStorage.
  // Start flushing them immediately.
  function resume(): void {
    scheduleProbe(true)
    if (buffer.todo) scheduleFlush(flushing, buffer, hightouch, scheduleFlush)
  }
  if (restoring) void restoring.then(resume)
  else resume()

  return hightouch
}
