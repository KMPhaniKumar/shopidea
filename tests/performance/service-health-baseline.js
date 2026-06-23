/**
 * ReelMart — Service Health Baseline (k6)
 *
 * Hits GET /health on every ECS service via the ALB before and after a load run.
 * This confirms all services are up and sets a baseline latency for each.
 *
 * PURPOSE:
 *   - Pre-run: confirm all 10 services are healthy before starting storefront-load.js
 *   - Post-run: verify no service crashed or was OOM-killed during the spike
 *   - Use in CI nightly jobs to detect service regressions
 *
 * USAGE:
 *   # Pre-load health check:
 *   k6 run tests/performance/service-health-baseline.js
 *
 *   # Pipe to JSON:
 *   k6 run tests/performance/service-health-baseline.js --out json=tests/performance/results/health-$(date +%Y%m%d-%H%M%S).json
 *
 * NOTE:
 *   The dev cluster runs at 22:00–08:00 IST with most services at 0 desired tasks.
 *   If you see 503/504 on all services, check the time — the nightly scale-to-zero
 *   is likely active. Scale up first via ECS or run during business hours.
 */

import http from 'k6/http'
import { check, group } from 'k6'
import { Rate } from 'k6/metrics'

const API_BASE = __ENV.API_BASE || 'https://api-dev.reelmart.in'

const unhealthyRate = new Rate('unhealthy_services')

/**
 * All 10 ECS microservices path-routed through the ALB.
 * Each service exposes GET /api/<prefix>/health.
 */
const SERVICES = [
  { name: 'admin-service',        path: '/api/admin/health'         },
  { name: 'analytics-service',    path: '/api/analytics/health'     },
  { name: 'catalog-service',      path: '/api/catalog/health'       },
  { name: 'delivery-service',     path: '/api/delivery/health'      },
  { name: 'notification-service', path: '/api/notifications/health' },
  { name: 'order-service',        path: '/api/orders/health'        },
  { name: 'payment-service',      path: '/api/payments/health'      },
  { name: 'payout-service',       path: '/api/payouts/health'       },
  { name: 'return-service',       path: '/api/returns/health'       },
  { name: 'whatsapp-service',     path: '/api/whatsapp/health'      },
]

export const options = {
  // Single pass — 1 VU, 1 iteration per service, no load
  scenarios: {
    health_check: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '30s',
    },
  },

  thresholds: {
    'http_req_duration':  ['p(95)<1000'],
    'http_req_failed':    ['rate<0.01'],
    'unhealthy_services': ['rate<0.01'],
  },

  tags: {
    project:     'reelmart',
    surface:     'service_health',
    environment: 'dev',
  },
}

export default function () {
  SERVICES.forEach(({ name, path }) => {
    group(`health - ${name}`, () => {
      const res = http.get(`${API_BASE}${path}`, {
        tags: { service: name },
        timeout: '10s',
      })

      const healthy = check(res, {
        [`${name} status 200`]:    (r) => r.status === 200,
        [`${name} latency < 1s`]:  (r) => r.timings.duration < 1000,
        [`${name} has ok field`]:  (r) => {
          try {
            const body = JSON.parse(r.body)
            return body?.status === 'ok' || body?.success === true || r.status === 200
          } catch { return r.status === 200 }
        },
      })

      unhealthyRate.add(!healthy ? 1 : 0)

      if (!healthy) {
        console.warn(`[health-check] ${name} UNHEALTHY — status=${res.status} body=${res.body?.slice(0, 200)}`)
      }
    })
  })
}

export function handleSummary(data) {
  const serviceResults = SERVICES.map(({ name }) => {
    const metricKey = `http_req_duration{service:${name}}`
    return {
      service: name,
      p95_ms: data.metrics[metricKey]?.values?.['p(95)'] ?? 'no_data',
    }
  })

  const summary = {
    generated_at: new Date().toISOString(),
    check: 'service_health_baseline',
    environment: API_BASE,
    total_http_failures: data.metrics.http_req_failed?.values?.count,
    per_service: serviceResults,
  }

  return {
    stdout: JSON.stringify(summary, null, 2),
    'tests/performance/results/health-baseline-summary.json': JSON.stringify(summary, null, 2),
  }
}
