'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ChevronDown, ChevronUp, MapPin, AlertTriangle, CheckCircle2, Clock, Loader2 } from 'lucide-react'
import {
  OrderStatusEvent,
  RAIL_NODES,
  deriveTimelineState,
  formatIndianDate,
  formatIndianDateTime,
  getEventMeta,
} from '@/lib/orderEvents'

interface Props {
  orderId: string
  /** Optional initial events from SSR to avoid a loading flash */
  initialEvents?: OrderStatusEvent[]
}

export default function OrderTimeline({ orderId, initialEvents }: Props) {
  const supabase = createClient()
  const [events, setEvents] = useState<OrderStatusEvent[]>(initialEvents ?? [])
  const [loading, setLoading] = useState(!initialEvents?.length)
  const [expanded, setExpanded] = useState(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // Initial fetch
  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await supabase
        .from('order_status_events')
        .select('*')
        .eq('order_id', orderId)
        .order('occurred_at', { ascending: true })
      if (cancelled) return
      if (!error && data) setEvents(data as OrderStatusEvent[])
      setLoading(false)
    }
    // Skip fetch if we already have initial events from SSR
    if (!initialEvents?.length) {
      load()
    } else {
      setLoading(false)
    }
    return () => { cancelled = true }
  }, [orderId])

  // Realtime subscription — live-append INSERT events
  useEffect(() => {
    const ch = supabase
      .channel(`order-events-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'order_status_events',
          filter: `order_id=eq.${orderId}`,
        },
        (payload: any) => {
          const newEvent = payload.new as OrderStatusEvent
          setEvents(prev => {
            // Deduplicate by id before appending
            if (prev.some(e => e.id === newEvent.id)) return prev
            // Keep ascending order by occurred_at
            return [...prev, newEvent].sort(
              (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
            )
          })
        }
      )
      .subscribe()

    channelRef.current = ch
    return () => {
      supabase.removeChannel(ch)
    }
  }, [orderId])

  if (loading) {
    return (
      <div className="bg-white rounded-card border border-border p-5 flex items-center justify-center gap-2 text-secondary">
        <Loader2 size={18} className="animate-spin text-primary" />
        <span className="text-sm">Loading order updates…</span>
      </div>
    )
  }

  const state = deriveTimelineState(events)
  const { railStage, headline, subtext, etaDate, isException, isTerminalSuccess, isTerminalFailure } = state

  // Determine styling theme
  const isErrorState = isException || isTerminalFailure
  const headerBg = isTerminalSuccess
    ? 'bg-gradient-to-br from-[#00B98E] to-[#009e7a] text-white'
    : isErrorState
    ? 'bg-amber-50 border border-amber-200'
    : 'bg-gradient-to-br from-[#FF6B2B] to-[#e55a1f] text-white'

  const headerTextColor = isTerminalSuccess || (!isErrorState)
    ? 'text-white'
    : 'text-amber-900'

  const headerSubColor = isErrorState ? 'text-amber-700' : 'text-white/90'

  return (
    <section className="space-y-3">
      {/* Status header card */}
      <div className={`rounded-card p-5 ${headerBg}`}>
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 shrink-0 ${isTerminalSuccess ? 'text-white' : isErrorState ? 'text-amber-600' : 'text-white'}`}>
            {isTerminalSuccess ? (
              <CheckCircle2 size={24} />
            ) : isErrorState ? (
              <AlertTriangle size={24} />
            ) : (
              <Clock size={24} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`font-bold text-base leading-snug ${headerTextColor}`}>{headline}</p>
            {subtext && (
              <p className={`text-sm mt-1 leading-relaxed ${headerSubColor}`}>{subtext}</p>
            )}
            {/* ETA / delivery note */}
            {isTerminalSuccess && state.latestEvent && (
              <p className={`text-sm mt-1.5 font-semibold ${headerTextColor}`}>
                Delivered on {formatIndianDate(state.latestEvent.occurred_at.split('T')[0])}
              </p>
            )}
            {!isTerminalSuccess && !isTerminalFailure && etaDate && (
              <p className={`text-sm mt-1.5 ${headerSubColor}`}>
                {isException
                  ? `Retrying delivery by ${formatIndianDate(etaDate)}`
                  : `Arriving by ${formatIndianDate(etaDate)}`}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Progress rail */}
      <ProgressRail railStage={railStage} isErrorState={isErrorState} />

      {/* All updates feed */}
      <div className="bg-white rounded-card border border-border overflow-hidden">
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-surface transition-colors"
        >
          <span className="text-sm font-bold text-text">All updates</span>
          {expanded ? (
            <ChevronUp size={16} className="text-secondary" />
          ) : (
            <ChevronDown size={16} className="text-secondary" />
          )}
        </button>

        {expanded && (
          <ol className="px-5 pb-5 space-y-0 border-t border-border">
            {events.length === 0 ? (
              <li className="py-4 text-sm text-secondary text-center">No updates yet.</li>
            ) : (
              events.map((event, i) => (
                <EventRow
                  key={event.id}
                  event={event}
                  isLast={i === events.length - 1}
                />
              ))
            )}
          </ol>
        )}
      </div>
    </section>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ProgressRail({
  railStage,
  isErrorState,
}: {
  railStage: number
  isErrorState: boolean
}) {
  const activeColor = isErrorState ? '#F59E0B' : '#FF6B2B'
  const completedColor = isErrorState ? '#F59E0B' : '#00B98E'
  const trackColor = isErrorState ? '#FDE68A' : '#EEEEEE'

  return (
    <div className="bg-white rounded-card border border-border p-5">
      <div className="relative flex items-center justify-between">
        {/* Track line */}
        <div
          className="absolute top-[11px] left-[11px] right-[11px] h-0.5"
          style={{ backgroundColor: trackColor }}
          aria-hidden="true"
        />
        {/* Filled portion */}
        <div
          className="absolute top-[11px] left-[11px] h-0.5 transition-all duration-500"
          style={{
            backgroundColor: isErrorState ? activeColor : completedColor,
            width: railStage < 0
              ? '0%'
              : `${(Math.min(railStage, 3) / 3) * 100}%`,
          }}
          aria-hidden="true"
        />

        {RAIL_NODES.map(node => {
          const reached = railStage >= node.stage && railStage !== -1
          const isCurrent = railStage === node.stage && !isErrorState
          return (
            <div key={node.stage} className="flex flex-col items-center relative z-10" style={{ flex: '1 1 0' }}>
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center border-2 text-[10px] font-bold transition-all duration-300"
                style={{
                  backgroundColor: reached ? (node.stage === railStage && !isErrorState ? activeColor : completedColor) : '#FFFFFF',
                  borderColor: reached ? (node.stage === railStage && !isErrorState ? activeColor : completedColor) : '#DDDDDD',
                  color: reached ? '#FFFFFF' : '#AAAAAA',
                  boxShadow: isCurrent ? `0 0 0 3px ${activeColor}33` : undefined,
                }}
              >
                {reached ? '✓' : ''}
              </span>
              <span
                className="mt-1.5 text-[10px] font-semibold text-center leading-tight max-w-[56px]"
                style={{ color: reached ? '#1A1A1A' : '#AAAAAA' }}
              >
                {node.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function EventRow({ event, isLast }: { event: OrderStatusEvent; isLast: boolean }) {
  const meta = getEventMeta(event.code)
  const isException = meta.isException || event.is_exception

  return (
    <li className="flex gap-3 pt-4 relative">
      {/* Connector line */}
      {!isLast && (
        <span
          aria-hidden="true"
          className="absolute left-[9px] top-10 bottom-0 w-0.5 bg-border"
        />
      )}

      {/* Dot */}
      <span
        className="mt-0.5 w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[11px] border-2 z-10"
        style={{
          backgroundColor: isException ? '#FEF3C7' : isLast ? '#FF6B2B' : '#F9F9F9',
          borderColor: isException ? '#F59E0B' : isLast ? '#FF6B2B' : '#DDDDDD',
          color: isException ? '#92400E' : isLast ? '#FFFFFF' : '#666666',
        }}
      >
        {isException ? '!' : isLast ? '●' : '○'}
      </span>

      {/* Content */}
      <div className="flex-1 pb-1">
        <p
          className="text-sm font-semibold leading-snug"
          style={{ color: isException ? '#92400E' : '#1A1A1A' }}
        >
          {event.title}
        </p>
        {event.description && (
          <p className="text-xs text-secondary mt-0.5 leading-relaxed">{event.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-2 mt-1">
          {event.location && (
            <span className="flex items-center gap-0.5 text-[11px] text-muted">
              <MapPin size={10} /> {event.location}
            </span>
          )}
          <span className="text-[11px] text-muted">
            {formatIndianDateTime(event.occurred_at)}
          </span>
        </div>
      </div>
    </li>
  )
}
