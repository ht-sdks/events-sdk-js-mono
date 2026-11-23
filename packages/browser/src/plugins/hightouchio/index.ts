import { Facade } from '@segment/facade'
import { Analytics } from '../../core/analytics'
import { LegacySettings } from '../../browser'
import { isOffline } from '../../core/connection'
import { Context } from '../../core/context'
import { HightouchEvent } from '../../core/events'
import { Plugin } from '../../core/plugin'
import { PriorityQueue } from '../../lib/priority-queue'
import {
  DurablePriorityQueue,
  PersistedPriorityQueue,
} from '../../lib/priority-queue/persisted'
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
  const snapshots = new WeakMap<Context, HightouchEvent>()
  const writeKey = settings?.apiKey ?? ''

  const buffer =
    analytics.options.disableClientPersistence ||
    (analytics.options.storage !== undefined &&
      !analytics.options.storage.stores.includes('localStorage'))
      ? new PriorityQueue<Context>(analytics.queue.queue.maxAttempts, [])
      : analytics.options.retryQueue
        ? new DurablePriorityQueue(
            analytics.queue.queue.maxAttempts,
            `${writeKey}:dest-Hightouch.io`,
            snapshots
          )
        : new PersistedPriorityQueue(
            analytics.queue.queue.maxAttempts,
            `${writeKey}:dest-Hightouch.io`,
            () => Array.from(inflightEvents)
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
    if (buffer instanceof DurablePriorityQueue) snapshots.set(ctx, event)
    return event
  }

  async function send(ctx: Context): Promise<Context> {
    const event = snapshot(ctx)
    if (buffer instanceof DurablePriorityQueue && buffer.retain(ctx)) {
      const previous = analytics.queue.queue
      if (previous instanceof DurablePriorityQueue) previous.acknowledge(ctx)
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
        if (result && buffer instanceof DurablePriorityQueue)
          buffer.acknowledge(ctx)
        else if (result?.ok && buffer instanceof PersistedPriorityQueue)
          buffer.acknowledge(ctx)
        snapshots.delete(ctx)
      } catch {
        if (buffer.pushWithBackoff(ctx)) {
          // eslint-disable-next-line @typescript-eslint/no-use-before-define
          scheduleFlush(flushing, buffer, hightouch, scheduleFlush)
        } else if (buffer instanceof DurablePriorityQueue) {
          buffer.acknowledge(ctx)
          snapshots.delete(ctx)
        }
      } finally {
        inflightEvents.delete(ctx)
      }
    }
    const url = `${remote}/v1/${event.type}`
    const body = { ...event, sentAt: new Date() }
    if (batched) await batched.dispatch(url, body, handle)
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
  if (buffer instanceof DurablePriorityQueue) {
    for (const ctx of buffer.restored.splice(0)) void send(ctx)
  }
  if (buffer.todo) {
    scheduleFlush(flushing, buffer, hightouch, scheduleFlush)
  }

  return hightouch
}
