import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BACKEND_URL = Deno.env.get('BACKEND_URL')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  try {
    const payload = await req.json()
    const { record, old_record, type } = payload

    if (!record?.id) return new Response('no record', { status: 200 })

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // Fetch full order with related data
    const { data: order, error } = await supabase
      .from('orders')
      .select('*, stores(store_name, whatsapp_number, seller_id), users!buyer_id(phone, name)')
      .eq('id', record.id)
      .single()

    if (error || !order) return new Response('order not found', { status: 200 })

    if (type === 'INSERT') {
      await fetch(`${BACKEND_URL}/api/notifications/new-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
      })
    }

    if (type === 'UPDATE' && record.status !== old_record?.status) {
      await fetch(`${BACKEND_URL}/api/notifications/status-change`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order, newStatus: record.status }),
      })
    }

    return new Response('ok', { status: 200 })
  } catch (e) {
    console.error('order-notifications error:', e)
    return new Response('error', { status: 200 }) // always 200 to avoid webhook retries
  }
})
