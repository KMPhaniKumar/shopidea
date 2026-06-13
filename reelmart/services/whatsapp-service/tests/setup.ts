// Global env vars so supabase.ts and other libs don't throw at import time.
process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'test-service-key'
process.env.GUPSHUP_API_KEY = 'test-gupshup-key'
process.env.GUPSHUP_SENDER_NUMBER = '+911234567890'
process.env.GUPSHUP_APP_NAME = 'ReelMartTest'
process.env.RAZORPAY_KEY_ID = 'rzp_test_xxx'
process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret'
// GUPSHUP_WEBHOOK_SECRET is intentionally left unset in base setup;
// individual tests set/delete it as needed.
