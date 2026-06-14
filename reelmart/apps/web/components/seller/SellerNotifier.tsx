'use client'

// New-order notifier for the seller dashboard.
//
// Polls the seller's own orders (readable via the authenticated client under
// the store-owner RLS policy) and pops an informational card for each order
// that appears while the dashboard is open. Notification-only — no actions;
// tapping it opens the Orders page. On the first poll it seeds the "seen" set
// silently so historical orders don't spam the seller on load.

import { useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import { ShoppingBag, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSellerStore } from '@/store/sellerStore'

const POLL_MS = 20_000

type OrderRow = { id: string; order_number: string | null; total_amount: number | null }

export function SellerNotifier() {
  const router = useRouter()
  const storeId = useSellerStore((s) => s.store?.id)
  const seen = useRef<Set<string>>(new Set())
  const primed = useRef(false)

  useEffect(() => {
    if (!storeId) return
    const supabase = createClient()
    let active = true
    // Re-prime if the store changes.
    primed.current = false
    seen.current = new Set()

    function pop(o: OrderRow) {
      const id = `order:${o.id}`
      toast.custom(
        () => (
          <div className="bg-white rounded-xl shadow-lg border border-[#EEEEEE] w-80 p-3.5 flex items-start gap-2.5">
            <button
              onClick={() => {
                router.push('/seller/orders')
                toast.dismiss(id)
              }}
              className="flex items-start gap-2.5 min-w-0 flex-1 text-left"
            >
              <span className="w-8 h-8 rounded-lg bg-[#FF6B2B]/10 text-[#FF6B2B] flex items-center justify-center shrink-0">
                <ShoppingBag size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[#1A1A1A]">
                  New order{o.order_number ? ` ${o.order_number}` : ''}
                </span>
                {o.total_amount != null && (
                  <span className="block text-xs text-[#666666]">₹{o.total_amount}</span>
                )}
                <span className="block text-[11px] text-[#FF6B2B] mt-0.5">Tap to view →</span>
              </span>
            </button>
            <button
              onClick={() => toast.dismiss(id)}
              aria-label="Dismiss"
              className="p-1 -m-1 text-[#AAAAAA] hover:text-[#666666] shrink-0"
            >
              <X size={15} />
            </button>
          </div>
        ),
        { id, duration: 8000 },
      )
    }

    async function poll() {
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, total_amount, created_at')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })
        .limit(15)
      if (error || !active || !data) return
      if (!primed.current) {
        // Seed without popping so existing orders don't flood the seller on load.
        data.forEach((o: any) => seen.current.add(o.id))
        primed.current = true
        return
      }
      // Oldest-first so the newest order ends up on top of the stack.
      for (const o of [...data].reverse()) {
        if (seen.current.has(o.id)) continue
        seen.current.add(o.id)
        pop(o as OrderRow)
      }
    }

    poll()
    const iv = setInterval(poll, POLL_MS)
    return () => {
      active = false
      clearInterval(iv)
    }
  }, [storeId, router])

  return null
}
