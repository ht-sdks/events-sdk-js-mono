import { HtEventsBrowser, type InitOptions } from '@ht-sdks/events-sdk-js-browser'
import './style.css'

const apiKey = import.meta.env.VITE_BRAZE_API_KEY ?? ''
const baseUrl = import.meta.env.VITE_BRAZE_BASE_URL || 'sdk.iad-03.braze.com'
const writeKey = import.meta.env.VITE_HT_WRITE_KEY ?? ''

// Flip and reload to log one purchase per order.
const perOrder = false

const brazeSettings: NonNullable<
  NonNullable<InitOptions['destinations']>['Braze']
> = {
  apiKey,
  baseUrl,
  sdk: () => import('@braze/web-sdk'),
  automaticallyShowInAppMessages: true,
  forwardScreenViews: true,
  purchaseEventNames: [
    'Order Completed',
    'Completed Order',
    'Membership Purchased',
  ],
  ...(perOrder ? { bundleCommerceEvents: true as const } : {}),
}

const htevents = HtEventsBrowser.load(
  { writeKey },
  {
    apiHost: 'us-east-1.hightouch-events.com',
    destinations: { Braze: brazeSettings },
  }
)

const userA = {
  email: 'jane@example.com',
  firstName: 'Jane',
  gender: 'male',
  plan: 'pro',
  address: { city: 'New York', country: 'US' },
}

const twoProducts = [
  {
    sku: 'RB-100',
    name: 'Resistance Band',
    price: 15,
    quantity: 2,
    brand: 'Equinox',
    category: 'Gear',
  },
  {
    sku: 'MB-200',
    name: 'Mat',
    price: 12,
    quantity: 1,
    brand: 'Equinox',
    category: 'Gear',
  },
]

const lastAction = document.querySelector<HTMLParagraphElement>('#last-action')

function onClick(id: string, action: () => void) {
  const button = document.getElementById(id)
  if (!(button instanceof HTMLButtonElement) || !lastAction) return
  button.addEventListener('click', () => {
    lastAction.textContent = button.textContent
    action()
  })
}

onClick('identify-a', () => {
  void htevents.identify('user-a', userA)
})

onClick('identify-a-again', () => {
  void htevents.identify('user-a', userA)
})

onClick('change-plan', () => {
  void htevents.identify('user-a', { ...userA, plan: 'enterprise' })
})

onClick('custom-event', () => {
  void htevents.track('Class Booked', { class_type: 'Yoga' })
})

onClick('purchase-two', () => {
  void htevents.track('Order Completed', {
    order_id: 'order-123',
    revenue: 42,
    tax: 3,
    currency: 'USD',
    products: twoProducts,
  })
})

onClick('purchase-custom', () => {
  void htevents.track('Membership Purchased', {
    order_id: 'order-456',
    revenue: 99,
    currency: 'USD',
    products: [
      {
        sku: 'MEM-1',
        name: 'Monthly Membership',
        price: 99,
        quantity: 1,
      },
    ],
  })
})

onClick('page', () => {
  void htevents.page('Schedule')
})

onClick('opt-out', () => {
  void htevents.track('Private Event', {}, { integrations: { Appboy: false } })
})

onClick('reset', () => {
  htevents.reset()
})

onClick('identify-b', () => {
  void htevents.identify('user-b', {
    email: 'bob@example.com',
    firstName: 'Bob',
  })
})
