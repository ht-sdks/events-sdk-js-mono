# Braze browser example

From this directory:

```bash
npm install
cp .env.example .env
npm run dev
```

Fill in `.env`. `VITE_BRAZE_BASE_URL` is optional and defaults to `sdk.iad-03.braze.com`.

`perOrder` in `src/main.ts` defaults to `false` (one Braze purchase per product). Flip it to `true` and reload to log one purchase per order.

`purchaseDetection` selects purchase event names (or accepts a predicate). `purchaseGrouping` selects per-product purchases with SKU/name identifiers or one purchase per order. `pageTracking` is `false`, `"name"`, or `"path"`. For legacy mappings, use `transformPurchase` and convert only the fields that need string values.

This sandbox has no Event User Log. Check results on the Braze user profile, and in the browser console and Network tab.
