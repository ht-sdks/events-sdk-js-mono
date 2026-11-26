import { PriorityQueue as CorePriorityQueue } from '@ht-sdks/events-sdk-js-core'

export { ON_REMOVE_FROM_FUTURE } from '@ht-sdks/events-sdk-js-core'

export class PriorityQueue<
  Item extends { id: string },
> extends CorePriorityQueue<Item> {
  pushWithBackoff(item: Item, retainOnExhaustion = false): boolean {
    if (retainOnExhaustion && this.getAttempts(item) >= this.maxAttempts) {
      // Reuse the final retry interval for deferred attempts.
      this.seen[item.id] = this.maxAttempts - 1
    }
    return super.pushWithBackoff(item)
  }
}
