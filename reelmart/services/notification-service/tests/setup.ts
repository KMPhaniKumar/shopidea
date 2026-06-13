// Global env vars required so supabase.ts doesn't throw at import time.
// All actual clients are mocked per-test via vi.mock() in the test files.
process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'test-service-key'
process.env.INTERNAL_API_KEY = 'test-internal-secret'
process.env.SITE_URL = 'https://dev.reelmart.in'
process.env.APP_DOWNLOAD_URL = 'https://dev.reelmart.in/app'
process.env.GUPSHUP_API_KEY = 'test-gupshup-key'
process.env.GUPSHUP_SENDER_NUMBER = '+911234567890'
process.env.GUPSHUP_APP_NAME = 'ReelMartTest'
process.env.MSG91_AUTH_KEY = ''
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
  type: 'service_account',
  project_id: 'test',
})
