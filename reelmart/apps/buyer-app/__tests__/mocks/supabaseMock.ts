/**
 * supabaseMock — a controllable fake of the `../lib/supabase` module.
 *
 * The real client (lib/supabase.ts) is a `@supabase/supabase-js` instance backed
 * by AsyncStorage. In tests we replace the WHOLE module so no network/native code
 * runs. This fake reproduces just enough of the surface the buyer-app actually
 * uses:
 *
 *   auth:  getSession, setSession, signOut, onAuthStateChange, getUser
 *   data:  from(table).select/insert/upsert/update/delete + .eq/.order/.limit/.single/.maybeSingle
 *
 * A tiny in-memory "session store" persisted into the mocked AsyncStorage models
 * the real persistence behaviour (Supabase writes the session to its storage
 * adapter, which in the app is AsyncStorage). This lets the auth tests assert
 * "session persisted on device" and "restored on relaunch" against a real
 * storage round-trip — not a hand-waved boolean.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSION_KEY = 'sb-test-auth-token'; // mirrors supabase-js storageKey shape

export interface FakeSession {
  access_token: string;
  refresh_token: string;
  user: { id: string; phone?: string };
}

type AuthChangeCb = (event: string, session: FakeSession | null) => void;

// ── Configurable per-table responses ───────────────────────────────────────────
// Tests set these before exercising the store/service.
export const supabaseState: {
  tableResponses: Record<string, { data: any; error: any }>;
  authChangeListeners: AuthChangeCb[];
} = {
  tableResponses: {},
  authChangeListeners: [],
};

export function setTableResponse(table: string, data: any, error: any = null) {
  supabaseState.tableResponses[table] = { data, error };
}

export function resetSupabaseMock() {
  supabaseState.tableResponses = {};
  supabaseState.authChangeListeners = [];
}

// A chainable query-builder where every filter method returns `this` and the
// terminal resolves to the configured table response.
function makeQueryBuilder(table: string) {
  const resolve = () =>
    supabaseState.tableResponses[table] ?? { data: null, error: null };

  const builder: any = {
    _table: table,
    select: jest.fn(() => builder),
    insert: jest.fn(() => builder),
    upsert: jest.fn(() => builder),
    update: jest.fn(() => builder),
    delete: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    neq: jest.fn(() => builder),
    order: jest.fn(() => builder),
    limit: jest.fn(() => builder),
    single: jest.fn(async () => resolve()),
    maybeSingle: jest.fn(async () => resolve()),
    // Allow `await query` to resolve the table response (PostgREST thenable).
    then: (onFulfilled: any, onRejected?: any) =>
      Promise.resolve(resolve()).then(onFulfilled, onRejected),
  };
  return builder;
}

export const supabase = {
  auth: {
    getSession: jest.fn(async () => {
      const raw = await AsyncStorage.getItem(SESSION_KEY);
      const session: FakeSession | null = raw ? JSON.parse(raw) : null;
      return { data: { session }, error: null };
    }),

    setSession: jest.fn(async ({ access_token, refresh_token }: any) => {
      const session: FakeSession = {
        access_token,
        refresh_token,
        user: { id: 'user-test-id', phone: '+919999999999' },
      };
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
      supabaseState.authChangeListeners.forEach((cb) => cb('SIGNED_IN', session));
      return { data: { session, user: session.user }, error: null };
    }),

    getUser: jest.fn(async () => {
      const raw = await AsyncStorage.getItem(SESSION_KEY);
      const session: FakeSession | null = raw ? JSON.parse(raw) : null;
      return { data: { user: session?.user ?? null }, error: null };
    }),

    signOut: jest.fn(async () => {
      await AsyncStorage.removeItem(SESSION_KEY);
      supabaseState.authChangeListeners.forEach((cb) => cb('SIGNED_OUT', null));
      return { error: null };
    }),

    onAuthStateChange: jest.fn((cb: AuthChangeCb) => {
      supabaseState.authChangeListeners.push(cb);
      return {
        data: {
          subscription: {
            unsubscribe: jest.fn(() => {
              supabaseState.authChangeListeners =
                supabaseState.authChangeListeners.filter((l) => l !== cb);
            }),
          },
        },
      };
    }),
  },

  from: jest.fn((table: string) => makeQueryBuilder(table)),
};
