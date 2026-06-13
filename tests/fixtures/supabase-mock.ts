/**
 * Supabase mock factory for Vitest.
 *
 * Usage in a test file:
 *   vi.mock('@supabase/supabase-js', () => import('../fixtures/supabase-mock').then(m => m.supabaseMockModule()))
 *
 * Then call configureSupabaseMock({ auth: ..., db: ... }) from beforeEach.
 *
 * This does NOT hit real Supabase at any point.
 */
import { vi } from 'vitest'

// Shared mutable mock state, reset between tests
export interface MockDbResult {
  data: any
  error: any
}

export interface MockAuthResult {
  user: any | null
  error: any | null
}

let _authResult: MockAuthResult = { user: null, error: { message: 'not configured' } }
let _dbResultsByTable: Record<string, MockDbResult> = {}

/**
 * Configure what the mock Supabase client returns for the current test.
 * Call in beforeEach.
 */
export function configureSupabaseMock(opts: {
  auth?: MockAuthResult
  db?: Record<string, MockDbResult>
}) {
  if (opts.auth !== undefined) _authResult = opts.auth
  if (opts.db !== undefined) _dbResultsByTable = opts.db
}

export function resetSupabaseMock() {
  _authResult = { user: null, error: { message: 'not configured' } }
  _dbResultsByTable = {}
}

/**
 * The fluent Supabase query builder mock.
 * Supports: .from(table).select().eq().single().maybeSingle()
 *           .from(table).insert().select().single()
 *           .from(table).update().eq().select().single()
 *           .from(table).upsert().select().single()
 */
function makeQueryBuilder(table: string) {
  let _filters: Record<string, any> = {}
  let _operation: 'select' | 'insert' | 'update' | 'upsert' = 'select'
  let _insertData: any = null

  const resolve = () => {
    const result = _dbResultsByTable[table]
    if (result !== undefined) return result
    // Default: empty result
    return { data: null, error: null }
  }

  const builder: any = {
    select: (_cols?: string) => { _operation = 'select'; return builder },
    insert: (data: any) => { _operation = 'insert'; _insertData = data; return builder },
    update: (_data: any) => { _operation = 'update'; return builder },
    upsert: (data: any, _opts?: any) => { _operation = 'upsert'; _insertData = data; return builder },
    eq: (_col: string, _val: any) => builder,
    neq: (_col: string, _val: any) => builder,
    in: (_col: string, _vals: any[]) => builder,
    is: (_col: string, _val: any) => builder,
    lte: (_col: string, _val: any) => builder,
    limit: (_n: number) => builder,
    order: (_col: string, _opts?: any) => builder,
    filter: (_col: string, _op: string, _val: any) => builder,
    single: () => resolve(),
    maybeSingle: () => resolve(),
    // .then() makes the builder awaitable (Supabase returns a Promise-like)
    then: (resolve_fn: (v: MockDbResult) => any) => Promise.resolve(resolve()).then(resolve_fn),
  }

  // Allow direct await (Supabase's query builders are Promise-like)
  Object.defineProperty(builder, Symbol.toStringTag, { value: 'Promise' })

  return builder
}

/**
 * Returns a vi-compatible module mock for @supabase/supabase-js.
 * The createClient call returns an object that mimics the Supabase client.
 */
export function supabaseMockModule() {
  const createClient = vi.fn().mockReturnValue({
    auth: {
      getUser: vi.fn().mockImplementation((_token: string) => {
        return Promise.resolve({ data: { user: _authResult.user }, error: _authResult.error })
      }),
    },
    from: vi.fn().mockImplementation((table: string) => makeQueryBuilder(table)),
  })

  return { createClient }
}
