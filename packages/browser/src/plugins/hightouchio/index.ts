import { Facade } from '@segment/facade'
import { Analytics } from '../../core/analytics'
import { LegacySettings } from '../../browser'
import { isOffline } from '../../core/connection'
import { Context } from '../../core/context'
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
  let probeScheduled = false
  let probeDelay = 1000
  const writeKey = settings?.apiKey ?? ''

  const buffer = analytics.options.disableClientPersistence
    ? new PriorityQueue<Context>(analytics.queue.queue.maxAttempts, [])
    : new PersistedPriorityQueue(
        analytics.queue.queue.maxAttempts,
        `${writeKey}:dest-Hightouch.io`,
        () => Array.from(inflightEvents),
        () => Array.from(held)
      )

  const flushing = false

  const apiHost = settings?.apiHost ?? HIGHTOUCH_API_HOST
  const protocol = settings?.protocol ?? 'https'
  const remote = `${protocol}://${apiHost}`

  const deliveryStrategy = settings?.deliveryStrategy
  const client =
    deliveryStrategy?.strategy === 'batching'
      ? batch(apiHost, deliveryStrategy.config, protocol)
      : standard(deliveryStrategy?.config as StandardDispatcherConfig)

  function pauseSource(ctx: Context): void {
    held.add(ctx)
    scheduleProbe()
  }

  function scheduleProbe(): void {
    if (probeScheduled || held.size === 0) return
    probeScheduled = true
    setTimeout(async () => {
      try {
        const first = held.values().next().value
        if (first) await deliver(first, true)
      } finally {
        probeScheduled = false
        scheduleProbe()
      }
    }, probeDelay)
    probeDelay = Math.min(probeDelay * 2, 60000)
  }

  const send = (ctx: Context): Promise<Context> => deliver(ctx, false)

  async function deliver(ctx: Context, probe: boolean): Promise<Context> {
    if (held.size > 0 && !probe) {
      held.add(ctx)
      return ctx
    }
    if (probe && isOffline()) {
      pauseSource(ctx)
      return ctx
    }
    if (isOffline()) {
      buffer.push(ctx)
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      scheduleFlush(flushing, buffer, hightouch, scheduleFlush)
      return ctx
    }

    inflightEvents.add(ctx)

    const eventType = ctx.event.type

    let json = toFacade(ctx.event).json()

    if (ctx.event.type === 'track') {
      delete json.traits
    }

    if (ctx.event.type === 'alias') {
      json = onAlias(analytics, json)
    }

    return client
      .dispatch(
        `${remote}/v1/${eventType}`,
        normalize(analytics, json, settings, integrations)
      )
      .then((response) => {
        const result = response as Response | undefined
        const sourceRejected = result && [401, 403, 404].includes(result.status)
        if (result?.ok === false) {
          const { status } = result
          const reason = `HTTP ${status} for message ${ctx.event.messageId}`
          if (
            status === 408 ||
            status === 429 ||
            (status >= 500 && status < 600)
          ) {
            throw new Error(reason)
          }
          if (!sourceRejected) {
            ctx.setFailedDelivery({ reason })
            ctx.log('error', reason)
          }
        }
        if (probe && result) {
          probeDelay = 1000
          held.delete(ctx)
          const ready = Array.from(held)
          held.clear()
          ready.forEach((item) => void send(item))
        }
        if (
          result &&
          !sourceRejected &&
          buffer instanceof PersistedPriorityQueue
        ) {
          buffer.acknowledge(ctx)
        }
        return ctx
      })
      .catch((error) => {
        if (held.size > 0) {
          pauseSource(ctx)
          return ctx
        }
        if (!buffer.pushWithBackoff(ctx)) {
          if (analytics.options.retryQueue) {
            pauseSource(ctx)
            return ctx
          }
          ctx.setFailedDelivery({ reason: error })
          if (buffer instanceof PersistedPriorityQueue) buffer.acknowledge(ctx)
          return ctx
        }
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        scheduleFlush(flushing, buffer, hightouch, scheduleFlush)
        return ctx
      })
      .finally(() => {
        inflightEvents.delete(ctx)
      })
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
  if (buffer.todo) {
    scheduleFlush(flushing, buffer, hightouch, scheduleFlush)
  }

  return hightouch
}
