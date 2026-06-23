/**
 * ReelMart — Storefront Load + Spike Test (k6)
 *
 * Scenario: Instagram-viral surge.
 * A seller posts a product reel; hundreds of buyers click the shared store/product link
 * within seconds. This script simulates that pattern against the deployed dev environment.
 *
 * HOT PATHS COVERED:
 *   1. Marketplace home           GET https://dev.reelmart.in/
 *   2. Store listing page         GET https://dev.reelmart.in/stores
 *   3. Storefront (seller page)   GET https://dev.reelmart.in/store/suryaboutiques
 *   4. Product page               GET https://dev.reelmart.in/store/suryaboutiques/product/<id>
 *   5. Catalog API (products)     GET https://api-dev.reelmart.in/api/catalog/stores/<id>/products
 *   6. Catalog API (public store) GET https://api-dev.reelmart.in/api/catalog/stores/suryaboutiques
 *   7. Tracking page              GET https://dev.reelmart.in/track/RMTEST001  (stub AWB — returns not-found page, not a real shipment)
 *   8. Delivery track API         GET https://api-dev.reelmart.in/api/delivery/track/RMTEST001
 *
 * RULES:
 *   - Read paths ONLY. No POST to orders/payments/cart.
 *   - No real OTP, SMS, push, or payment triggered.
 *   - Never hit seller-only or admin-only authenticated endpoints.
 *   - Target dev environment only (not production).
 *
 * THRESHOLDS:
 *   - http_req_duration p(95) < 2000ms  (all requests)
 *   - http_req_duration p(90) < 1500ms  (product/store pages — tighter SLA for link-in-bio UX)
 *   - http_req_failed rate < 1%
 *
 * INSTALL k6 (macOS):
 *   brew install k6
 *   OR: https://k6.io/docs/get-started/installation/
 *
 * RUN:
 *   # Normal load only (30 VU × 2 min)
 *   k6 run tests/performance/storefront-load.js --env SCENARIO=normal_load
 *
 *   # Spike test only (0→80→0 VU over ~90s)
 *   k6 run tests/performance/storefront-load.js --env SCENARIO=spike_test
 *
 *   # Both scenarios (default — run this in CI or off-hours)
 *   k6 run tests/performance/storefront-load.js
 *
 *   # With JSON artifact for CI ingestion:
 *   k6 run tests/performance/storefront-load.js --out json=tests/performance/results/storefront-$(date +%Y%m%d-%H%M%S).json
 *
 * GUARDRAILS — read before running:
 *   - The dev cluster is small (256 CPU / 512 MB per service, 1 task most services).
 *   - Coordinate before running spike_test during business hours — it CAN saturate the cluster.
 *   - Prefer running after 22:00 IST (the cluster is at near-zero traffic; nightly scale-to-zero
 *     triggers at 22:00 IST, so wait until 08:00 the next day, or disable it first via ECS).
 *   - If you observe http_req_failed > 10% during the spike, kill the run (Ctrl+C); this is
 *     signal for the infra-engineer to scale up the ECS service desired count.
 *
 * PRODUCT ID NOTE:
 *   The product-page scenario uses a placeholder product UUID.
 *   Before running against dev, replace PRODUCT_ID_PLACEHOLDER with a real product id
 *   from the `suryaboutiques` store. You can fetch one:
 *     curl https://api-dev.reelmart.in/api/catalog/stores/suryaboutiques/products | jq '.data[0].id'
 *   Alternatively the script will gracefully handle 404s (they don't count against the threshold
 *   because the page renders a "not found" UI — the HTTP status is still 200 from Next.js ISR).
 */

import http from 'k6/http'
import { check, group, sleep } from 'k6'
import { Counter, Rate, Trend } from 'k6/metrics'
import { randomItem } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js'

// ---------------------------------------------------------------------------
// Environment targets
// ---------------------------------------------------------------------------
const WEB_BASE = __ENV.WEB_BASE || 'https://dev.reelmart.in'
const API_BASE = __ENV.API_BASE || 'https://api-dev.reelmart.in'

// ---------------------------------------------------------------------------
// Test data — read-only public resources in the dev Supabase
// ---------------------------------------------------------------------------

/** Stores that are approved + active in the dev DB */
const TEST_STORES = [
  { slug: 'suryaboutiques', name: 'Surya Boutiques' },
  { slug: 'blue-whale',     name: 'Blue Whale' },
]

/**
 * Replace with real product UUIDs from the dev DB.
 * curl https://api-dev.reelmart.in/api/catalog/stores/suryaboutiques/products | jq '[.data[].id]'
 * Leave as placeholder and the test will still run; the product page returns 404→200 from Next.js.
 */
const PRODUCT_IDS_SURYABOUTIQUES = [
  'REPLACE_WITH_REAL_PRODUCT_UUID_1',
  'REPLACE_WITH_REAL_PRODUCT_UUID_2',
]

/** Stub AWB — delivery-service returns a stub response when NimbusPost is not configured */
const TEST_AWB = 'RMTEST001'

// ---------------------------------------------------------------------------
// Custom metrics (beyond k6 built-ins)
// ---------------------------------------------------------------------------
const storeFrontErrors   = new Counter('storefront_errors')
const apiErrors          = new Counter('api_errors')
const productPageP90     = new Trend('product_page_duration', true)
const storePageP90       = new Trend('store_page_duration',   true)

// ---------------------------------------------------------------------------
// Scenario matrix
// ---------------------------------------------------------------------------

// Which scenario to run — set via --env SCENARIO=normal_load|spike_test|both
const SCENARIO_ENV = __ENV.SCENARIO || 'both'

/**
 * Scenario definitions.
 *
 * normal_load — 30 VUs held steady for 2 minutes.  Establishes a baseline.
 * spike_test  — sudden ramp from 0 to 80 VUs over 20 s, hold 60 s, drop back to 0.
 *               Simulates an Instagram reel going viral.
 *
 * NOTE: On the dev cluster (single Fargate task per service, 256 CPU units) these VU
 * numbers will expose saturation quickly. That is intentional — the goal is to identify
 * the break point, not to pass silently.
 */
const SCENARIO_DEFINITIONS = {
  normal_load: {
    executor: 'constant-vus',
    vus: 30,
    duration: '2m',
    gracefulStop: '30s',
  },
  spike_test: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '10s', target: 5  }, // warm-up
      { duration: '20s', target: 80 }, // Instagram surge — hit hard
      { duration: '60s', target: 80 }, // hold at peak
      { duration: '15s', target: 10 }, // taper
      { duration: '5s',  target: 0  }, // drain
    ],
    gracefulStop: '30s',
  },
}

function buildScenarios() {
  if (SCENARIO_ENV === 'normal_load') return { normal_load: SCENARIO_DEFINITIONS.normal_load }
  if (SCENARIO_ENV === 'spike_test')  return { spike_test:  SCENARIO_DEFINITIONS.spike_test  }
  // both (default) — run normal first, then spike sequentially
  return {
    normal_load: {
      ...SCENARIO_DEFINITIONS.normal_load,
      startTime: '0s',
    },
    spike_test: {
      ...SCENARIO_DEFINITIONS.spike_test,
      startTime: '2m30s', // start 30 s after normal_load ends (cooldown)
    },
  }
}

// ---------------------------------------------------------------------------
// k6 options (exported — k6 reads this at startup)
// ---------------------------------------------------------------------------
export const options = {
  scenarios: buildScenarios(),

  thresholds: {
    // Global latency budget
    'http_req_duration':              ['p(95)<2000', 'p(99)<4000'],
    // Tighter SLA for link-in-bio pages (store + product)
    'store_page_duration':            ['p(90)<1500'],
    'product_page_duration':          ['p(90)<1500'],
    // Error rate — must stay below 1 %
    'http_req_failed':                ['rate<0.01'],
    // Our own counters stay at zero in a healthy run
    'storefront_errors':              ['count<5'],
    'api_errors':                     ['count<5'],
  },

  // Human-friendly summary tags
  tags: {
    project:     'reelmart',
    surface:     'storefront',
    environment: 'dev',
  },
}

// ---------------------------------------------------------------------------
// Common headers — mimic a real mobile browser (Indian buyer on Android Chrome)
// ---------------------------------------------------------------------------
const BROWSER_HEADERS = {
  'User-Agent':       'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36',
  'Accept':           'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language':  'en-IN,en-GB;q=0.9,en;q=0.8,hi;q=0.7',
  'Accept-Encoding':  'gzip, deflate, br',
  'Connection':       'keep-alive',
}

const JSON_HEADERS = {
  'Accept':          'application/json',
  'Content-Type':    'application/json',
  'Accept-Language': 'en-IN',
}

// ---------------------------------------------------------------------------
// Helper: assert a response and record failures
// ---------------------------------------------------------------------------
function assertOk(res, label, isApi = false) {
  const ok = check(res, {
    [`${label} status 2xx`]: (r) => r.status >= 200 && r.status < 300,
    [`${label} no timeout`]: (r) => r.timings.duration < 5000,
  })
  if (!ok) {
    if (isApi) apiErrors.add(1)
    else storeFrontErrors.add(1)
  }
  return ok
}

// ---------------------------------------------------------------------------
// VU entry point (runs in a loop per virtual user)
// ---------------------------------------------------------------------------
export default function () {
  const store = randomItem(TEST_STORES)

  // Each VU randomly picks a "user journey" weighted by likely traffic distribution:
  //   60% storefront / product page (most viral link click-through)
  //   20% marketplace home
  //   15% catalog API (mobile app or headless)
  //   5%  tracking page (post-purchase)
  const roll = Math.random()

  if (roll < 0.60) {
    viralStoreLinkJourney(store)
  } else if (roll < 0.80) {
    marketplaceHomeJourney()
  } else if (roll < 0.95) {
    catalogApiJourney(store)
  } else {
    trackingJourney()
  }

  // Realistic inter-request pause: Indian mobile users on 4G/LTE browse at ~2–5s/page
  sleep(Math.random() * 3 + 1)
}

// ---------------------------------------------------------------------------
// Journey 1: Viral store link  (store page → product page)
// Most likely path when a seller's Instagram post goes viral.
// ---------------------------------------------------------------------------
function viralStoreLinkJourney(store) {
  group('storefront - store page', () => {
    const res = http.get(`${WEB_BASE}/store/${store.slug}`, {
      headers: BROWSER_HEADERS,
      tags: { path: 'store_page' },
    })
    storePageP90.add(res.timings.duration)
    assertOk(res, `store/${store.slug}`)
  })

  // ~50% of store visitors tap a product
  if (Math.random() < 0.5) {
    sleep(Math.random() * 1.5 + 0.5) // reading store page

    group('storefront - product page', () => {
      const productId = randomItem(PRODUCT_IDS_SURYABOUTIQUES)
      const res = http.get(
        `${WEB_BASE}/store/${store.slug}/product/${productId}`,
        {
          headers: BROWSER_HEADERS,
          tags: { path: 'product_page' },
        }
      )
      productPageP90.add(res.timings.duration)
      // Next.js returns 200 even for not-found products (renders 404 UI client-side)
      // so we only check for server errors, not 404
      check(res, {
        'product page not 5xx': (r) => r.status < 500,
        'product page latency ok': (r) => r.timings.duration < 3000,
      })
    })
  }
}

// ---------------------------------------------------------------------------
// Journey 2: Marketplace home  (buyer discovers the platform)
// ---------------------------------------------------------------------------
function marketplaceHomeJourney() {
  group('storefront - marketplace home', () => {
    const res = http.get(WEB_BASE, {
      headers: BROWSER_HEADERS,
      tags: { path: 'marketplace_home' },
    })
    assertOk(res, 'marketplace home')

    check(res, {
      'home page contains store grid': (r) =>
        r.body && r.body.includes('ReelMart'),
    })
  })

  // Some visitors click "Browse stores"
  if (Math.random() < 0.3) {
    sleep(0.8)
    group('storefront - stores listing', () => {
      const res = http.get(`${WEB_BASE}/stores`, {
        headers: BROWSER_HEADERS,
        tags: { path: 'stores_listing' },
      })
      assertOk(res, 'stores listing')
    })
  }
}

// ---------------------------------------------------------------------------
// Journey 3: Catalog backend API  (buyer-app or direct link)
// Tests the ALB → ECS Fargate path for catalog-service directly.
// ---------------------------------------------------------------------------
function catalogApiJourney(store) {
  group('api - public store info', () => {
    const res = http.get(
      `${API_BASE}/api/catalog/stores/${store.slug}`,
      {
        headers: JSON_HEADERS,
        tags: { path: 'api_store_info' },
      }
    )
    assertOk(res, 'catalog /stores/:slug', true)

    check(res, {
      'catalog stores has success field': (r) => {
        try { return JSON.parse(r.body)?.success === true } catch { return false }
      },
    })
  })

  sleep(0.3)

  group('api - store products list', () => {
    // Use slug as store identifier — catalog-service resolves slug → id internally
    // GET /api/catalog/stores/:id/products requires a UUID, not slug.
    // We hit the slug endpoint to get the store id first, then products.
    // For the load test we rely on the slug-based store info to validate the path;
    // the products list is tested via the storefront page (which fetches it SSR).
    // Alternatively: pre-fetch a store UUID and embed it here.
    const storeInfoRes = http.get(
      `${API_BASE}/api/catalog/stores/${store.slug}`,
      { headers: JSON_HEADERS, tags: { path: 'api_store_info_prefetch' } }
    )

    if (storeInfoRes.status === 200) {
      let storeId
      try {
        storeId = JSON.parse(storeInfoRes.body)?.data?.id
      } catch { /* ignore */ }

      if (storeId) {
        const productsRes = http.get(
          `${API_BASE}/api/catalog/stores/${storeId}/products`,
          {
            headers: JSON_HEADERS,
            tags: { path: 'api_products_list' },
          }
        )
        assertOk(productsRes, 'catalog /stores/:id/products', true)

        check(productsRes, {
          'products response is array': (r) => {
            try {
              const body = JSON.parse(r.body)
              return Array.isArray(body?.data)
            } catch { return false }
          },
        })
      }
    }
  })
}

// ---------------------------------------------------------------------------
// Journey 4: Tracking page  (post-purchase buyer checking delivery status)
// ---------------------------------------------------------------------------
function trackingJourney() {
  group('storefront - tracking page', () => {
    // The tracking page renders even when the AWB is unknown (shows "not found" UI).
    // This exercises the Next.js SSR + the delivery-service track endpoint.
    const res = http.get(`${WEB_BASE}/track/${TEST_AWB}`, {
      headers: BROWSER_HEADERS,
      tags: { path: 'tracking_page' },
    })
    check(res, {
      'tracking page serves HTML': (r) => r.status === 200 || r.status === 404,
      'tracking page latency ok':  (r) => r.timings.duration < 3000,
    })
  })

  sleep(0.2)

  group('api - delivery track', () => {
    const res = http.get(
      `${API_BASE}/api/delivery/track/${TEST_AWB}`,
      {
        headers: JSON_HEADERS,
        tags: { path: 'api_delivery_track' },
      }
    )
    // delivery-service returns 200 with stub data when NIMBUS_AUTH_TOKEN is absent.
    // When configured, it proxies NimbusPost. Either way the service must respond.
    check(res, {
      'delivery track not 5xx': (r) => r.status < 500,
      'delivery track latency ok': (r) => r.timings.duration < 2000,
    })
  })
}
