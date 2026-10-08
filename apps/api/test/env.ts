// Must be the FIRST import of every test file: config/env.ts validates process.env at import time.
// Unconditional on purpose — the tests stub every repository, and dummy values guarantee nothing can reach a real database.
process.env.SUPABASE_URL = "http://localhost:54321"
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key"
process.env.UPSTASH_REDIS_REST_URL = "http://localhost:6379"
process.env.UPSTASH_REDIS_REST_TOKEN = "test-token"
process.env.OPENAI_API_KEY = "test-openai-key"
process.env.NODE_ENV = "test"
