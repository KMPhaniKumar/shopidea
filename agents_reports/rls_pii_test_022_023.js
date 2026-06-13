/**
 * RLS / PII Hardening Validation Tests
 * Covers: migrations 021, 022, 023 (MED-2, MED-1, LOW-1, addr-column REVOKE)
 *
 * Run:  node agents_reports/rls_pii_test_022_023.js
 *       SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node agents_reports/rls_pii_test_022_023.js
 *
 * NOTE: Tests assert the POST-migration state.  If migrations are pending they
 *       will show the pre-fix (vulnerable) state and be marked FAIL.
 * Seeds its own test data with service-role, then cleans up on exit.
 */

'use strict';

const { createClient } = require('/Users/murali/Documents/GitHub/shopidea/reelmart/apps/web/node_modules/@supabase/supabase-js');

// ── credentials ───────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL ||
  'https://nysgwdpmpxqmfwelfaxo.supabase.co';

// Retrieve via: supabase projects api-keys --project-ref nysgwdpmpxqmfwelfaxo
const ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55c2d3ZHBtcHhxbWZ3ZWxmYXhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NTM3ODIsImV4cCI6MjA5MzMyOTc4Mn0.0XxU5z0K5xj1NsRFsY-w2F2grO8ZIyp2t6gEH8HlJb0';

const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;   // injected from env; never printed

if (!SERVICE_KEY) {
  console.error('FATAL: SUPABASE_SERVICE_KEY env var not set.');
  process.exit(1);
}

// ── clients ───────────────────────────────────────────────────────────────────
const svc  = createClient(SUPABASE_URL, SERVICE_KEY,  { auth: { persistSession: false } });
const anon = createClient(SUPABASE_URL, ANON_KEY,     { auth: { persistSession: false } });

// Authenticated-role client is built after we create+sign-in a test user.
let authClient = null;  // set during seed

// ── helpers ──────────────────────────────────────────────────────────────────
const results = [];
let seededUserId   = null;
let seededStoreId  = null;
let seededUser2Id  = null;
let seededStore2Id = null;
let seededFollowId = null;

function record(name, passed, expected, actual, note) {
  const status = passed ? 'PASS' : 'FAIL';
  results.push({ status, name, expected, actual, note: note || '' });
}

async function cleanup() {
  // Order matters for FK constraints
  if (seededFollowId) {
    // seededFollowId is "buyerId__storeId" composite key marker
    const [bId, sId] = seededFollowId.split('__');
    await svc.from('followed_stores').delete().eq('buyer_id', bId).eq('store_id', sId);
  }
  // store_address_changes seeded rows cleaned by store cascade
  if (seededStoreId) {
    await svc.from('store_address_changes').delete().eq('store_id', seededStoreId);
    await svc.from('stores').delete().eq('id', seededStoreId);
  }
  if (seededStore2Id) {
    await svc.from('stores').delete().eq('id', seededStore2Id);
  }
  if (seededUserId) {
    await svc.auth.admin.deleteUser(seededUserId);
  }
  if (seededUser2Id) {
    await svc.auth.admin.deleteUser(seededUser2Id);
  }
}

// ── migration probe helpers ───────────────────────────────────────────────────
async function columnExists(table, column) {
  const { error } = await svc.from(table).select(column).limit(1);
  return !error || !error.message.includes('does not exist');
}

async function tableExists(table) {
  const { error } = await svc.from(table).select('id').limit(1);
  // PGRST205 = table not in schema cache
  return !error || error.code !== 'PGRST205';
}

async function viewExists(view) {
  const { error } = await svc.from(view).select('*').limit(1);
  return !error || error.code !== 'PGRST205';
}

// ── seed ─────────────────────────────────────────────────────────────────────
async function seed() {
  // Create test user 1 (seller 1)
  const phone1 = '+917700000001';
  const { data: u1, error: e1 } = await svc.auth.admin.createUser({
    phone: phone1, phone_confirm: true,
    user_metadata: { role: 'seller', name: 'TestSeller1' }
  });
  if (e1) throw new Error('seed user1: ' + e1.message);
  seededUserId = u1.user.id;

  // Ensure the users row exists (trigger should create it; upsert as fallback)
  await svc.from('users').upsert({
    id: seededUserId,
    phone: '917700000001',
    name: 'TestSeller1',
    role: 'seller'
  }, { onConflict: 'id', ignoreDuplicates: false });

  // Create test user 2 (seller 2 — used for isolation tests)
  const phone2 = '+917700000002';
  const { data: u2, error: e2 } = await svc.auth.admin.createUser({
    phone: phone2, phone_confirm: true,
    user_metadata: { role: 'seller', name: 'TestSeller2' }
  });
  if (e2) throw new Error('seed user2: ' + e2.message);
  seededUser2Id = u2.user.id;

  await svc.from('users').upsert({
    id: seededUser2Id,
    phone: '917700000002',
    name: 'TestSeller2',
    role: 'seller'
  }, { onConflict: 'id', ignoreDuplicates: false });

  // Check which migration columns exist before seeding stores
  const hasAddress   = await columnExists('stores', 'address');
  const hasPanNumber = await columnExists('stores', 'pan_number');

  // Build store row with only the columns that exist
  const store1Row = {
    seller_id:       seededUserId,
    store_name:      'TestStore1_RLS',
    store_slug:      'teststore1-rls-' + Date.now(),
    category:        'clothing',
    is_active:       true,
    approval_status: 'approved',
    city:            'Mumbai',
    area:            'Andheri',
    pincode:         '400053',
    whatsapp_number: '917700000001',
    aadhaar_url:     'https://test.example.com/aadhaar1.pdf',
  };
  if (hasAddress) store1Row.address = '123 Test Street';
  if (hasPanNumber) {
    store1Row.pan_number    = 'TESTPAN1234';
    store1Row.gst_number    = '27TESTGST1234Z5';
    store1Row.selfie_path   = 'kyc/test-selfie1.jpg';
    store1Row.pan_doc_path  = 'kyc/test-pan1.jpg';
  }

  const { data: s1, error: es1 } = await svc.from('stores').insert(store1Row).select('id').single();
  if (es1) throw new Error('seed store1: ' + es1.message);
  seededStoreId = s1.id;

  const store2Row = {
    seller_id:       seededUser2Id,
    store_name:      'TestStore2_RLS',
    store_slug:      'teststore2-rls-' + Date.now(),
    category:        'clothing',
    is_active:       true,
    approval_status: 'approved',
    city:            'Delhi',
    area:            'Connaught Place',
    pincode:         '110001',
    whatsapp_number: '917700000002',
  };
  if (hasAddress) store2Row.address = '456 Other Street';

  const { data: s2, error: es2 } = await svc.from('stores').insert(store2Row).select('id').single();
  if (es2) throw new Error('seed store2: ' + es2.message);
  seededStore2Id = s2.id;

  // Seed a follow row for LOW-1 test (user1 follows store2)
  // followed_stores has composite PK (buyer_id, store_id) — no id column
  const followExists = await tableExists('followed_stores');
  if (followExists) {
    const { error: ef1 } = await svc.from('followed_stores').insert({
      buyer_id: seededUserId,
      store_id: seededStore2Id,
    });
    if (!ef1) {
      seededFollowId = `${seededUserId}__${seededStore2Id}`;  // composite key marker
    }
    // if it fails that's OK — LOW-1 test will note it
  }

  // Build authenticated client for seller 1
  // Use the custom sign_in_with_password equivalent — supabase admin.createUser
  // doesn't give us a JWT directly. We sign in via OTP flow using the admin API
  // to create a session, or use createSession:
  const { data: session1, error: se1 } = await svc.auth.admin.createUser({
    phone: '+917700000003', phone_confirm: true,  // a session trick user
    user_metadata: { role: 'seller' }
  });
  // Actually, use generateLink approach — but for a simpler path, use
  // signInWithPassword if email set, or impersonate. The cleanest approach is:
  // svc.auth.admin.getUserById returns user but not session.
  // Use REST POST /auth/v1/otp with phone, then verify?
  // Simplest: use the service-role to generate a one-time token:

  // Actually the cleanest is signInAnonymously + then link, but let's use the
  // admin generateLink approach for a magic link token, or just set a password:
  const { data: updUser, error: euu } = await svc.auth.admin.updateUserById(seededUserId, {
    password: 'TestPass123!_rls_test'
  });
  if (euu) throw new Error('set password user1: ' + euu.message);

  // Sign in with email+password is not available (no email set).
  // Use the Supabase REST admin signInWithPassword alternative:
  // POST /auth/v1/token?grant_type=password  (phone + password)
  const signInResp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY,
    },
    body: JSON.stringify({ phone: '917700000001', password: 'TestPass123!_rls_test' })
  });
  const signInData = await signInResp.json();

  if (signInData.access_token) {
    authClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${signInData.access_token}` } }
    });
  } else {
    // Fall back: try email-based sign in with a fake email assigned
    // If we can't get an auth client, auth tests will be skipped with a note
    console.warn('WARN: Could not obtain user JWT for seller1 — auth-role tests will use anon fallback');
    console.warn('Sign-in response:', JSON.stringify(signInData).substring(0, 200));
  }

  // Build seller2 auth client similarly
  await svc.auth.admin.updateUserById(seededUser2Id, {
    password: 'TestPass456!_rls_test'
  });
  const signIn2Resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
    body: JSON.stringify({ phone: '917700000002', password: 'TestPass456!_rls_test' })
  });
  const signIn2Data = await signIn2Resp.json();

  let authClient2 = null;
  if (signIn2Data.access_token) {
    authClient2 = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${signIn2Data.access_token}` } }
    });
  }

  return { hasAddress, hasPanNumber, authClient2 };
}

// ── tests ─────────────────────────────────────────────────────────────────────

async function testMigrationApplied() {
  // T-000: Probe whether each migration is actually applied
  const m021_label    = await columnExists('orders', 'label_url');
  const m021_courier  = await columnExists('orders', 'courier_name');
  const m022_table    = await tableExists('store_address_changes');
  const m023_view1    = await viewExists('public_user_names');
  const m023_view2    = await viewExists('store_follow_counts');

  record('T-000a: Migration 021 applied (orders.label_url)',
    m021_label, true, m021_label,
    m021_label ? '' : 'PENDING MIGRATION: 021_orders_shipment_metadata.sql');

  record('T-000b: Migration 021 applied (orders.courier_name)',
    m021_courier, true, m021_courier,
    m021_courier ? '' : 'PENDING MIGRATION: 021_orders_shipment_metadata.sql');

  record('T-000c: Migration 022 applied (store_address_changes table)',
    m022_table, true, m022_table,
    m022_table ? '' : 'PENDING MIGRATION: 022_store_address_change_approval.sql');

  record('T-000d: Migration 023 applied (public_user_names view)',
    m023_view1, true, m023_view1,
    m023_view1 ? '' : 'PENDING MIGRATION: 023_rls_pii_hardening.sql');

  record('T-000e: Migration 023 applied (store_follow_counts view)',
    m023_view2, true, m023_view2,
    m023_view2 ? '' : 'PENDING MIGRATION: 023_rls_pii_hardening.sql');

  return { m022_table, m023_view1, m023_view2 };
}

// MED-2: users.phone must NOT be readable by anon
async function testMed2_AnonCannotReadPhone() {
  const { data, error } = await anon
    .from('users')
    .select('id, phone')
    .limit(5);

  // Post-fix: RLS should return empty array (own-row only, anon has no row)
  // Pre-fix: returns rows with phone numbers
  const phoneLeaked = Array.isArray(data) && data.some(r => r.phone);
  record(
    'T-100: MED-2 — anon SELECT users.phone returns no phone data',
    !phoneLeaked,
    'no phone data (0 rows or phone=null)',
    phoneLeaked
      ? `${data.length} row(s) with phone values exposed`
      : (error ? `error: ${error.message}` : `${(data||[]).length} rows, no phone`),
    phoneLeaked
      ? 'BUG: "Public user names visible" policy still active — migration 023 NOT applied'
      : ''
  );
}

// MED-2: public_user_names view should exist and return only id+name
async function testMed2_PublicUserNamesView() {
  const { data, error } = await anon
    .from('public_user_names')
    .select('*')
    .limit(3);

  if (error && error.code === 'PGRST205') {
    record('T-101: MED-2 — public_user_names view exists', false,
      'view exists', 'view not found', 'PENDING MIGRATION: 023_rls_pii_hardening.sql');
    return;
  }

  // View should return only id and name, never phone
  const hasPhone = Array.isArray(data) && data.some(r => 'phone' in r);
  record('T-101a: MED-2 — public_user_names view exists', !error, 'view exists',
    error ? `error: ${error.message}` : 'view accessible');

  if (!error && Array.isArray(data)) {
    record('T-101b: MED-2 — public_user_names has no phone column',
      !hasPhone, 'no phone column', hasPhone ? 'phone column present' : 'no phone column');

    const hasOnlyIdName = data.length === 0 ||
      Object.keys(data[0]).every(k => ['id', 'name'].includes(k));
    record('T-101c: MED-2 — public_user_names returns only id,name',
      hasOnlyIdName,
      'columns: id, name',
      data.length > 0 ? `columns: ${Object.keys(data[0]).join(', ')}` : '(empty result)');
  }
}

// MED-1: anon must NOT read KYC columns from stores
async function testMed1_AnonCannotReadKycColumns(hasPanNumber) {
  if (!hasPanNumber) {
    record('T-200: MED-1 — anon cannot read pan_number from stores',
      false, 'column guarded', 'column does not exist (migration 020 also pending)',
      'PENDING MIGRATION: 020 (pan_number column) and 023 (REVOKE)');
    // Still test aadhaar_url which exists from migration 002
  }

  // aadhaar_url exists from migration 002 — should be blocked after 023
  const { data: anonStores, error: aerr } = await anon
    .from('stores')
    .select('id, aadhaar_url')
    .eq('id', seededStoreId)
    .limit(1);

  const aadhaarLeaked = Array.isArray(anonStores) &&
    anonStores.some(r => 'aadhaar_url' in r);

  record(
    'T-201: MED-1 — anon SELECT stores.aadhaar_url blocked',
    !aadhaarLeaked,
    'permission denied or column absent',
    aerr
      ? `error: ${aerr.code} ${aerr.message}`
      : (aadhaarLeaked
          ? `aadhaar_url column readable (value may be null but column exposed)`
          : 'no aadhaar_url in result'),
    aadhaarLeaked
      ? 'BUG: aadhaar_url still readable by anon — migration 023 REVOKE not applied'
      : ''
  );

  if (hasPanNumber) {
    const { data: kycData, error: kerr } = await anon
      .from('stores')
      .select('id, pan_number, gst_number, selfie_path, pan_doc_path')
      .eq('id', seededStoreId)
      .limit(1);

    const kycLeaked = Array.isArray(kycData) &&
      kycData.some(r => ['pan_number','gst_number','selfie_path','pan_doc_path'].some(c => c in r));

    record(
      'T-202: MED-1 — anon SELECT stores KYC columns (pan_number etc) blocked',
      !kycLeaked,
      'permission denied for KYC columns',
      kerr
        ? `error: ${kerr.code} ${kerr.message}`
        : (kycLeaked ? 'KYC columns exposed to anon' : 'KYC columns not in result'),
      kycLeaked ? 'BUG: KYC columns still readable by anon — migration 023 REVOKE not applied' : ''
    );
  }
}

// MED-1: authenticated non-owner cannot read KYC columns
async function testMed1_AuthNonOwnerCannotReadKyc(hasPanNumber, authClient2) {
  if (!authClient2) {
    record('T-210: MED-1 — authenticated non-owner cannot read KYC columns',
      false, 'no auth client available', 'SKIP',
      'Could not obtain seller2 JWT — test skipped');
    return;
  }
  if (!hasPanNumber) {
    record('T-210: MED-1 — authenticated non-owner cannot read KYC columns',
      false, 'column guarded', 'SKIP: pan_number column missing (migration 020 pending)',
      'PENDING MIGRATION: 020');
    return;
  }

  // seller2 trying to read seller1's store KYC
  const { data, error } = await authClient2
    .from('stores')
    .select('id, pan_number, aadhaar_url, gst_number')
    .eq('id', seededStoreId)
    .limit(1);

  const kycLeaked = Array.isArray(data) &&
    data.some(r => ['pan_number','aadhaar_url','gst_number'].some(c => c in r));

  record(
    'T-210: MED-1 — authenticated non-owner cannot read another store KYC',
    !kycLeaked,
    'KYC columns absent or permission denied',
    error
      ? `error: ${error.code} ${error.message}`
      : (kycLeaked ? 'KYC columns exposed to non-owner auth client' : 'KYC columns not accessible'),
    kycLeaked ? 'BUG: KYC columns readable by authenticated non-owner — REVOKE not applied for `authenticated` role' : ''
  );
}

// 022: column-level REVOKE — authenticated seller cannot UPDATE address columns
async function test022_AddressColumnRevoke(hasAddress) {
  if (!hasAddress) {
    record('T-300: 022 — address column REVOKE on stores',
      false, 'REVOKE active (permission denied)', 'SKIP: address column missing (migration 014 pending)',
      'PENDING MIGRATION: 014 + 022');
    return;
  }
  if (!authClient) {
    record('T-300: 022 — address column REVOKE on stores',
      false, 'permission denied on UPDATE', 'SKIP',
      'Could not obtain seller1 JWT — test skipped');
    return;
  }

  // seller1 tries to directly UPDATE their own store's address (should be blocked post-022)
  const { data, error } = await authClient
    .from('stores')
    .update({ address: 'Hacked Street' })
    .eq('id', seededStoreId)
    .select('address');

  // Post-fix: Postgres raises "permission denied for column address"
  // which manifests as a PGRST204 (no content) or a 42501 error
  const wasDenied = error &&
    (error.code === '42501' || error.message?.toLowerCase().includes('permission denied'));

  const updateSucceeded = !error && Array.isArray(data) && data.length > 0;

  record(
    'T-300: 022 — seller cannot directly UPDATE stores.address (column REVOKE)',
    wasDenied || (!updateSucceeded && !error),
    'Postgres error 42501 permission denied for column address',
    error
      ? `error ${error.code}: ${error.message?.substring(0,120)}`
      : (updateSucceeded ? 'UPDATE succeeded — address was changed!' : 'no rows updated (may be RLS block)'),
    updateSucceeded
      ? 'BUG: Seller bypassed address-change approval flow — REVOKE not applied'
      : (!wasDenied && !error
          ? 'AMBIGUOUS: update returned no rows but no 42501 error (RLS block vs column REVOKE unclear)'
          : '')
  );
}

// 022: store_address_changes RLS — seller can INSERT own request
async function test022_AddressChangeRls() {
  if (!(await tableExists('store_address_changes'))) {
    record('T-310: 022 — store_address_changes RLS (seller INSERT own)',
      false, 'insert succeeds for own store', 'SKIP: table missing',
      'PENDING MIGRATION: 022_store_address_change_approval.sql');
    return;
  }
  if (!authClient) {
    record('T-310: 022 — store_address_changes RLS (seller INSERT own)',
      false, 'insert succeeds', 'SKIP', 'No seller1 JWT');
    return;
  }

  const { data, error } = await authClient
    .from('store_address_changes')
    .insert({
      store_id: seededStoreId,
      proposed: { address: '999 New Street', city: 'Pune', state: 'Maharashtra', area: 'Koregaon', pincode: '411001' },
      status: 'pending'
    })
    .select('id, status');

  const passed = !error && Array.isArray(data) && data.length > 0 && data[0].status === 'pending';
  record(
    'T-310: 022 — seller can INSERT address change request for own store',
    passed,
    'insert succeeds, status=pending',
    error ? `error: ${error.code} ${error.message?.substring(0,120)}` : `inserted ${(data||[]).length} row(s)`,
  );
}

// 022: seller cannot INSERT address change for a store they DON'T own
async function test022_AddressChangeRls_CrossStore(authClient2) {
  if (!(await tableExists('store_address_changes'))) {
    record('T-311: 022 — seller cannot INSERT change request for other store',
      false, 'insert blocked', 'SKIP: table missing',
      'PENDING MIGRATION: 022_store_address_change_approval.sql');
    return;
  }
  if (!authClient2) {
    record('T-311: 022 — seller cannot INSERT change request for other store',
      false, 'insert blocked', 'SKIP', 'No seller2 JWT');
    return;
  }

  // seller2 tries to insert a change request for seller1's store
  const { data, error } = await authClient2
    .from('store_address_changes')
    .insert({
      store_id: seededStoreId,   // seller1's store
      proposed: { address: 'Attack St', city: 'X', state: 'Y', area: 'Z', pincode: '000000' },
      status: 'pending'
    })
    .select('id');

  const wasDenied = !!error;
  record(
    'T-311: 022 — seller2 cannot INSERT address change request for seller1 store',
    wasDenied,
    'insert blocked (RLS violation)',
    error ? `error: ${error.code} ${error.message?.substring(0,120)}` : `inserted ${(data||[]).length} row(s)`,
    !wasDenied ? 'BUG: cross-store address change request INSERT not blocked by RLS' : ''
  );
}

// 022: seller cannot self-approve (INSERT with status != 'pending')
async function test022_AddressChangeNoSelfApprove() {
  if (!(await tableExists('store_address_changes'))) {
    record('T-312: 022 — seller cannot self-approve address change',
      false, 'insert blocked', 'SKIP: table missing', 'PENDING MIGRATION: 022');
    return;
  }
  if (!authClient) {
    record('T-312: 022 — seller cannot self-approve address change',
      false, 'insert blocked', 'SKIP', 'No seller1 JWT');
    return;
  }

  // Try to INSERT with status='approved' — WITH CHECK in RLS should block this
  const { data, error } = await authClient
    .from('store_address_changes')
    .insert({
      store_id: seededStoreId,
      proposed: { address: 'Self Approved', city: 'Pune', state: 'MH', area: 'Kothrud', pincode: '411038' },
      status: 'approved'   // should be blocked by WITH CHECK(status = 'pending')
    })
    .select('id, status');

  const wasDenied = !!error;
  record(
    'T-312: 022 — seller cannot INSERT address change with status=approved (no self-approve)',
    wasDenied,
    'insert blocked (WITH CHECK enforces status=pending)',
    error ? `error: ${error.code} ${error.message?.substring(0,120)}` : `inserted ${(data||[]).length} row(s) with status=${(data||[{}])[0]?.status}`,
    !wasDenied ? 'BUG: seller self-approved address change — WITH CHECK policy not working' : ''
  );
}

// LOW-1: anon cannot read buyer_ids from followed_stores
// IMPORTANT: this test first seeds a row via service-role to ensure the table is
// non-empty, making the test conclusive rather than vacuously passing on an empty table.
async function testLow1_AnonCannotReadBuyerIds() {
  // Seed a control row via service-role so the test is definitive
  const { data: realUsers } = await svc.from('users').select('id').limit(1);
  const { data: realStores } = await svc.from('stores').select('id').eq('is_active', true).limit(1);
  const controlUserId  = realUsers?.[0]?.id;
  const controlStoreId = realStores?.[0]?.id;
  let controlRowInserted = false;

  if (controlUserId && controlStoreId) {
    // Insert only if not already followed
    const { error: ci } = await svc.from('followed_stores').insert({
      buyer_id: controlUserId, store_id: controlStoreId
    });
    controlRowInserted = !ci;
  }

  const { data, error } = await anon
    .from('followed_stores')
    .select('buyer_id, store_id')
    .limit(5);

  const buyerIdsLeaked = Array.isArray(data) && data.length > 0;
  const note = buyerIdsLeaked
    ? 'BUG: "Follow counts publicly readable" USING(true) policy still active — migration 023 NOT applied'
    : (controlRowInserted ? '' : 'WARNING: could not seed control row — result may be vacuous PASS if table is empty');

  record(
    'T-400: LOW-1 — anon SELECT followed_stores returns no rows (buyer_ids hidden)',
    !buyerIdsLeaked,
    '0 rows (anon has no RLS pass for followed_stores)',
    buyerIdsLeaked
      ? `${data.length} row(s) exposed including buyer_id fields (control row was present)`
      : (error ? `error: ${error.message}` : `0 rows returned${controlRowInserted ? ' (control row present — conclusive)' : ' (table may be empty)'}`),
    note
  );

  // Cleanup control row
  if (controlRowInserted && controlUserId && controlStoreId) {
    await svc.from('followed_stores').delete().eq('buyer_id', controlUserId).eq('store_id', controlStoreId);
  }
}

// LOW-1: store_follow_counts view exists and returns only store_id + follower_count
async function testLow1_StoreFollowCountsView() {
  const { data, error } = await anon
    .from('store_follow_counts')
    .select('*')
    .limit(3);

  if (error && error.code === 'PGRST205') {
    record('T-401: LOW-1 — store_follow_counts view exists', false,
      'view exists', 'view not found', 'PENDING MIGRATION: 023_rls_pii_hardening.sql');
    return;
  }

  record('T-401a: LOW-1 — store_follow_counts view accessible by anon',
    !error, 'view accessible',
    error ? `error: ${error.code} ${error.message}` : 'accessible');

  if (!error && Array.isArray(data)) {
    const hasBuyerId = data.some(r => 'buyer_id' in r);
    record('T-401b: LOW-1 — store_follow_counts has no buyer_id column',
      !hasBuyerId, 'no buyer_id', hasBuyerId ? 'buyer_id present' : 'no buyer_id');

    const validCols = data.length === 0 ||
      Object.keys(data[0]).every(k => ['store_id', 'follower_count'].includes(k));
    record('T-401c: LOW-1 — store_follow_counts only exposes store_id and follower_count',
      validCols,
      'columns: store_id, follower_count',
      data.length > 0 ? `columns: ${Object.keys(data[0]).join(', ')}` : '(empty)');
  }
}

// LOW-1: an authenticated buyer can only see their OWN followed_stores rows
async function testLow1_AuthBuyerOwnershipIsolation() {
  if (!authClient) {
    record('T-402: LOW-1 — buyer sees only own followed_stores rows',
      false, 'own rows only', 'SKIP', 'No seller1 JWT (also buyer in this test)');
    return;
  }
  if (!seededFollowId) {
    record('T-402: LOW-1 — buyer sees only own followed_stores rows',
      false, 'own rows only', 'SKIP', 'followed_stores seed row not created');
    return;
  }

  // Also add a second follow row owned by a DIFFERENT user so isolation is meaningful
  const { data: realUsers } = await svc.from('users').select('id').neq('id', seededUserId).limit(1);
  const otherUserId = realUsers?.[0]?.id;
  let otherFollowInserted = false;
  if (otherUserId && seededStoreId) {
    const { error: oi } = await svc.from('followed_stores').insert({
      buyer_id: otherUserId, store_id: seededStoreId
    });
    otherFollowInserted = !oi;
  }

  // seller1/buyer1 reads all followed_stores — should only see their own
  const { data: ownRows, error: e1 } = await authClient
    .from('followed_stores')
    .select('buyer_id, store_id')
    .limit(20);

  // All returned rows must have buyer_id == seededUserId
  const hasOtherRows = Array.isArray(ownRows) &&
    ownRows.some(r => r.buyer_id !== seededUserId);

  record(
    'T-402: LOW-1 — authenticated user sees only own followed_stores rows',
    !e1 && !hasOtherRows,
    `all rows have buyer_id=${seededUserId.substring(0,8)}...`,
    e1
      ? `error: ${e1.message}`
      : (hasOtherRows
          ? `rows from other buyers returned (isolation FAIL)`
          : `${(ownRows||[]).length} own row(s) only${otherFollowInserted ? ' (other user row present — conclusive)' : ''}`),
    hasOtherRows ? 'BUG: authenticated buyer can read another buyer\'s follow data' : ''
  );

  // Cleanup other follow row
  if (otherFollowInserted && otherUserId && seededStoreId) {
    await svc.from('followed_stores').delete().eq('buyer_id', otherUserId).eq('store_id', seededStoreId);
  }
}

// RLS isolation: seller1 cannot read seller2's orders (pre-existing policy check)
async function testOrderIsolation() {
  if (!authClient) {
    record('T-500: RLS isolation — seller cannot read other seller orders',
      false, 'isolated', 'SKIP', 'No seller1 JWT');
    return;
  }

  // seller1 tries to read ALL orders — should only see their own store's orders
  const { data, error } = await authClient
    .from('orders')
    .select('id, store_id')
    .limit(20);

  if (error) {
    record('T-500: RLS isolation — seller order read isolation',
      false, 'own orders only', `error: ${error.code} ${error.message?.substring(0,80)}`);
    return;
  }

  // Any returned orders with store_id != seededStoreId would be a leak
  const leakedOrders = (data || []).filter(r => r.store_id !== seededStoreId);
  // Note: seller1 is also a buyer — some orders may be their own buyer orders
  // We can only conclusively check if orders from seededStore2Id appear
  const leaked2 = leakedOrders.filter(r => r.store_id === seededStore2Id);

  record(
    'T-500: RLS isolation — seller1 cannot see seller2 store orders',
    leaked2.length === 0,
    '0 orders from seller2 store',
    leaked2.length > 0 ? `${leaked2.length} order(s) from seller2 store leaked` : `no leak (${(data||[]).length} total rows returned)`,
    leaked2.length > 0 ? 'BUG: cross-store order data accessible via RLS (HIGH-4 related)' : ''
  );
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== ReelMart RLS/PII Hardening Tests (022 + 023) ===\n');
  console.log(`Target: ${SUPABASE_URL}\n`);

  let seedState;
  try {
    console.log('Seeding test data...');
    seedState = await seed();
    console.log(`  seller1 user: ${seededUserId?.substring(0,8)}...`);
    console.log(`  seller1 store: ${seededStoreId?.substring(0,8)}...`);
    console.log(`  seller2 user: ${seededUser2Id?.substring(0,8)}...`);
    console.log(`  seller2 store: ${seededStore2Id?.substring(0,8)}...`);
    console.log(`  authClient (seller1): ${authClient ? 'obtained' : 'NOT obtained'}`);
    console.log(`  authClient2 (seller2): ${seedState?.authClient2 ? 'obtained' : 'NOT obtained'}`);
    console.log(`  migration 014 (address col): ${seedState?.hasAddress ? 'applied' : 'PENDING'}`);
    console.log(`  migration 020 (pan_number col): ${seedState?.hasPanNumber ? 'applied' : 'PENDING'}\n`);
  } catch (err) {
    console.error('FATAL: Seed failed:', err.message);
    await cleanup();
    process.exit(1);
  }

  const { hasAddress, hasPanNumber, authClient2 } = seedState;

  try {
    // Migration applied probes
    const migState = await testMigrationApplied();

    // MED-2 tests
    await testMed2_AnonCannotReadPhone();
    await testMed2_PublicUserNamesView();

    // MED-1 tests
    await testMed1_AnonCannotReadKycColumns(hasPanNumber);
    await testMed1_AuthNonOwnerCannotReadKyc(hasPanNumber, authClient2);

    // 022 address REVOKE tests
    await test022_AddressColumnRevoke(hasAddress);
    await test022_AddressChangeRls();
    await test022_AddressChangeRls_CrossStore(authClient2);
    await test022_AddressChangeNoSelfApprove();

    // LOW-1 tests
    await testLow1_AnonCannotReadBuyerIds();
    await testLow1_StoreFollowCountsView();
    await testLow1_AuthBuyerOwnershipIsolation();

    // Bonus: cross-seller order isolation
    await testOrderIsolation();

  } finally {
    console.log('\nCleaning up test data...');
    await cleanup();
    console.log('Cleanup done.\n');
  }

  // ── report ─────────────────────────────────────────────────────────────────
  const passed  = results.filter(r => r.status === 'PASS').length;
  const failed  = results.filter(r => r.status === 'FAIL').length;
  const total   = results.length;

  console.log('=== TEST RESULTS ===\n');
  for (const r of results) {
    const icon = r.status === 'PASS' ? '[PASS]' : '[FAIL]';
    console.log(`${icon} ${r.name}`);
    if (r.status === 'FAIL') {
      console.log(`       expected : ${r.expected}`);
      console.log(`       actual   : ${r.actual}`);
      if (r.note) console.log(`       note     : ${r.note}`);
    } else if (r.note) {
      console.log(`       note     : ${r.note}`);
    }
  }

  console.log(`\n=== SUMMARY: ${passed}/${total} passed, ${failed} failed ===`);

  if (failed > 0) {
    console.log('\nFAILED TESTS:');
    for (const r of results.filter(r => r.status === 'FAIL')) {
      console.log(`  - ${r.name}`);
      if (r.note) console.log(`    ${r.note}`);
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Unhandled error:', err);
  cleanup().finally(() => process.exit(1));
});
