/**
 * k6 performance test configuration scaffold.
 *
 * STATUS: Scaffold only — no scripts written yet (see work-breakdown).
 *
 * Run: k6 run tests/performance/api-load.js
 * k6 is a Go binary; install from https://k6.io/docs/get-started/installation/
 *
 * Targets: dev environment only (api-dev.reelmart.in) — never production.
 * Credentials: use the test-login endpoint (CRIT-3) or mock tokens.
 */

export const K6_CONFIG = {
  apiBase: 'https://api-dev.reelmart.in',
  webBase: 'https://dev.reelmart.in',
  thresholds: {
    // P95 response time targets
    http_req_duration: ['p(95)<500'], // 500ms p95
    http_req_failed: ['rate<0.01'],   // <1% error rate
  },
  scenarios: {
    // Baseline: 10 VUs, 30 seconds — establish a baseline before the release
    baseline: {
      executor: 'constant-vus',
      vus: 10,
      duration: '30s',
    },
    // Ramp: simulate Black Friday-style spike
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 50 },
        { duration: '20s', target: 50 },
        { duration: '10s', target: 0 },
      ],
    },
  },
}
