/**
 * OrderTimeline — buyer-facing order update feed.
 *
 * Props: orderId (string)
 * Fetches + realtime-subscribes to order_status_events, renders:
 *   1. Status header  (headline, subtext, ETA / exception notice)
 *   2. 4-node progress rail
 *   3. Full chronological event feed (collapsible after 3 entries)
 */

import React, { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { supabase } from '../lib/supabase'
import {
  RAIL_NODES,
  deriveTimelineState,
  fetchOrderEvents,
  formatIndianDate,
  formatIndianDateTime,
  getEventMeta,
  subscribeToOrderEvents,
  type OrderStatusEvent,
} from '../services/orderEvents'
import { colors, radius, spacing } from '../constants/theme'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Brand green used for "Delivered" success state (spec: #00B98E) */
const SUCCESS_GREEN = '#00B98E'
const SUCCESS_BG    = '#E6F7F4'
const AMBER         = '#B45309'
const AMBER_BG      = '#FFFBEB'
const AMBER_BORDER  = '#FCD34D'
const ERROR_BG      = '#FEF2F2'
const ERROR_BORDER  = '#FCA5A5'

// ─── Icon glyphs (unicode, no dependency) ────────────────────────────────────

const ICON_GLYPH: Record<string, string> = {
  receipt:         '🧾',
  checkmark:       '✅',
  cube:            '📦',
  tag:             '🏷',
  car:             '🚗',
  location:        '📍',
  bicycle:         '🛵',
  warning:         '⚠️',
  'checkmark-done':'🎉',
  'return-up-back':'↩️',
  home:            '🏠',
  close:           '✕',
  refresh:         '↩️',
  ellipse:         '●',
}

function iconGlyph(icon: string): string {
  return ICON_GLYPH[icon] ?? '●'
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** 4-node horizontal progress rail */
function ProgressRail({
  railStage,
  isException,
  isTerminalFailure,
}: {
  railStage: number
  isException: boolean
  isTerminalFailure: boolean
}) {
  const muted = isTerminalFailure
  const activeColor = muted ? colors.error : colors.primary

  return (
    <View style={railStyles.container}>
      {RAIL_NODES.map((node, idx) => {
        const filled  = railStage >= node.stage && !muted
        const current = railStage === node.stage && !muted
        const isLast  = idx === RAIL_NODES.length - 1

        const dotColor   = filled ? activeColor : colors.border
        const labelColor = filled
          ? activeColor
          : current
          ? colors.textSecondary
          : colors.textMuted

        return (
          <View key={node.stage} style={railStyles.nodeWrapper}>
            <View style={railStyles.nodeRow}>
              {/* connector line before this dot (skip for first) */}
              {idx > 0 && (
                <View
                  style={[
                    railStyles.line,
                    { backgroundColor: railStage >= node.stage && !muted ? activeColor : colors.border },
                  ]}
                />
              )}

              {/* dot */}
              <View
                style={[
                  railStyles.dot,
                  { borderColor: dotColor, backgroundColor: filled ? dotColor : colors.white },
                  current && !muted && railStyles.dotCurrent,
                ]}
              >
                {filled && !current && (
                  <Text style={railStyles.dotCheck}>✓</Text>
                )}
                {current && !muted && (
                  <View style={[railStyles.dotInner, { backgroundColor: activeColor }]} />
                )}
                {muted && isTerminalFailure && idx === 0 && (
                  <Text style={[railStyles.dotCheck, { color: colors.error }]}>✕</Text>
                )}
              </View>

              {/* connector line after this dot (skip for last) */}
              {!isLast && (
                <View
                  style={[
                    railStyles.line,
                    { backgroundColor: railStage > node.stage && !muted ? activeColor : colors.border },
                  ]}
                />
              )}
            </View>

            <Text
              numberOfLines={2}
              style={[
                railStyles.nodeLabel,
                { color: labelColor },
                (filled || current) && !muted && railStyles.nodeLabelActive,
              ]}
            >
              {node.label}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

const railStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  nodeWrapper: {
    flex: 1,
    alignItems: 'center',
  },
  nodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'center',
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  dotCurrent: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.white,
  },
  dotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotCheck: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
  line: {
    flex: 1,
    height: 2,
  },
  nodeLabel: {
    fontSize: 10,
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: 14,
  },
  nodeLabelActive: {
    fontWeight: '600',
  },
})

/** Single row in the event feed */
function EventRow({
  event,
  isFirst,
  isLast,
}: {
  event: OrderStatusEvent
  isFirst: boolean
  isLast: boolean
}) {
  const meta = getEventMeta(event.code)
  const isEx = meta.isException || event.is_exception

  return (
    <View style={feedStyles.row}>
      {/* Timeline spine */}
      <View style={feedStyles.spineCol}>
        <View
          style={[
            feedStyles.spineDot,
            isEx
              ? feedStyles.spineDotException
              : isLast
              ? feedStyles.spineDotLatest
              : feedStyles.spineDotDone,
          ]}
        >
          <Text style={feedStyles.spineDotGlyph}>{iconGlyph(meta.icon)}</Text>
        </View>
        {!isLast && <View style={feedStyles.spineLine} />}
      </View>

      {/* Content */}
      <View
        style={[
          feedStyles.content,
          isEx && feedStyles.contentException,
          isLast && !isEx && feedStyles.contentLatest,
        ]}
      >
        <Text style={[feedStyles.title, isEx && feedStyles.titleException]}>
          {event.title}
        </Text>
        {!!event.description && (
          <Text style={feedStyles.description}>{event.description}</Text>
        )}
        {!!event.location && (
          <Text style={feedStyles.location}>📍 {event.location}</Text>
        )}
        <Text style={feedStyles.time}>{formatIndianDateTime(event.occurred_at)}</Text>
        {isEx && !!event.estimated_delivery && (
          <Text style={feedStyles.retryNote}>
            Retrying delivery by {formatIndianDate(event.estimated_delivery)}
          </Text>
        )}
      </View>
    </View>
  )
}

const feedStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  spineCol: {
    alignItems: 'center',
    width: 36,
    paddingTop: 2,
  },
  spineDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.border,
  },
  spineDotDone: {
    backgroundColor: '#F0EFF9',
  },
  spineDotLatest: {
    backgroundColor: '#FFF0E9',
  },
  spineDotException: {
    backgroundColor: AMBER_BG,
    borderWidth: 1,
    borderColor: AMBER_BORDER,
  },
  spineDotGlyph: {
    fontSize: 13,
  },
  spineLine: {
    width: 2,
    flex: 1,
    minHeight: 16,
    backgroundColor: colors.border,
    marginVertical: 2,
  },
  content: {
    flex: 1,
    marginLeft: spacing.sm,
    paddingBottom: spacing.md,
    paddingTop: 2,
  },
  contentLatest: {
    backgroundColor: '#FFF8F5',
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginLeft: spacing.xs,
    borderWidth: 1,
    borderColor: '#FFD4BC',
  },
  contentException: {
    backgroundColor: AMBER_BG,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginLeft: spacing.xs,
    borderWidth: 1,
    borderColor: AMBER_BORDER,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 20,
  },
  titleException: {
    color: AMBER,
  },
  description: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  location: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  time: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4,
  },
  retryNote: {
    fontSize: 12,
    color: AMBER,
    fontWeight: '600',
    marginTop: 4,
  },
})

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  orderId: string
}

const FEED_PREVIEW_COUNT = 3

export default function OrderTimeline({ orderId }: Props) {
  const [events, setEvents] = useState<OrderStatusEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  // Keep a ref so the realtime handler always has the latest events list
  const eventsRef = useRef<OrderStatusEvent[]>([])
  eventsRef.current = events

  useEffect(() => {
    let cancelled = false

    // Initial fetch
    fetchOrderEvents(orderId).then(data => {
      if (!cancelled) {
        setEvents(data)
        setLoading(false)
      }
    })

    // Realtime subscription — append new INSERTs
    const channel = subscribeToOrderEvents(orderId, (newEvent) => {
      setEvents(prev => {
        // Deduplicate by id
        if (prev.some(e => e.id === newEvent.id)) return prev
        // Insert in occurred_at order (server events should arrive in order,
        // but guard anyway)
        const next = [...prev, newEvent].sort(
          (a, b) =>
            new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
        )
        return next
      })
    })

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [orderId])

  if (loading) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.loadingText}>Loading order updates…</Text>
      </View>
    )
  }

  const state = deriveTimelineState(events)
  const {
    railStage,
    headline,
    subtext,
    etaDate,
    isException,
    isTerminalSuccess,
    isTerminalFailure,
  } = state

  // Status header color scheme
  const headerBg = isTerminalSuccess
    ? SUCCESS_BG
    : isTerminalFailure
    ? ERROR_BG
    : isException
    ? AMBER_BG
    : '#FFF0E9'

  const headlineColor = isTerminalSuccess
    ? SUCCESS_GREEN
    : isTerminalFailure
    ? colors.error
    : isException
    ? AMBER
    : colors.textPrimary

  // ETA / status line
  let etaLine: string | null = null
  if (isTerminalSuccess && state.latestEvent) {
    etaLine = `Delivered on ${formatIndianDateTime(state.latestEvent.occurred_at)}`
  } else if (isException && etaDate) {
    etaLine = `Retrying delivery by ${formatIndianDate(etaDate)}`
  } else if (!isTerminalFailure && etaDate) {
    etaLine = `Arriving by ${formatIndianDate(etaDate)}`
  }

  // Feed slicing
  const totalEvents = events.length
  const showAll = expanded || totalEvents <= FEED_PREVIEW_COUNT
  const visibleEvents = showAll ? events : events.slice(-FEED_PREVIEW_COUNT)
  const hiddenCount = totalEvents - FEED_PREVIEW_COUNT

  return (
    <View style={styles.wrapper}>
      {/* ── Status header ── */}
      <View style={[styles.statusHeader, { backgroundColor: headerBg }]}>
        <Text style={[styles.headline, { color: headlineColor }]}>{headline}</Text>
        {!!subtext && <Text style={styles.subtext}>{subtext}</Text>}
        {!!etaLine && (
          <Text
            style={[
              styles.etaLine,
              {
                color: isTerminalSuccess
                  ? SUCCESS_GREEN
                  : isException
                  ? AMBER
                  : colors.primary,
              },
            ]}
          >
            {etaLine}
          </Text>
        )}
      </View>

      {/* ── Progress rail ── */}
      <View style={styles.railSection}>
        <ProgressRail
          railStage={railStage}
          isException={isException}
          isTerminalFailure={isTerminalFailure}
        />
      </View>

      {/* ── All updates feed ── */}
      <View style={styles.feedSection}>
        <Text style={styles.feedHeader}>ALL UPDATES</Text>

        {totalEvents === 0 ? (
          <View style={styles.emptyFeed}>
            <Text style={styles.emptyFeedText}>
              Tracking updates will appear here as your order progresses.
            </Text>
          </View>
        ) : (
          <>
            {/* Show older events collapsed behind "See all" */}
            {!showAll && hiddenCount > 0 && (
              <TouchableOpacity
                style={styles.seeAllBtn}
                onPress={() => setExpanded(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.seeAllText}>
                  See all {totalEvents} updates ({hiddenCount} earlier)
                </Text>
              </TouchableOpacity>
            )}

            {visibleEvents.map((event, idx) => (
              <EventRow
                key={event.id}
                event={event}
                isFirst={idx === 0}
                isLast={idx === visibleEvents.length - 1}
              />
            ))}

            {expanded && totalEvents > FEED_PREVIEW_COUNT && (
              <TouchableOpacity
                style={styles.collapseBtn}
                onPress={() => setExpanded(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.collapseText}>Show less</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.white,
  },

  // Loading
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  loadingText: {
    fontSize: 13,
    color: colors.textMuted,
  },

  // Status header
  statusHeader: {
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  headline: {
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
  },
  subtext: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  etaLine: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
  },

  // Rail
  railSection: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },

  // Feed
  feedSection: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  feedHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.6,
    marginBottom: spacing.md,
  },
  emptyFeed: {
    paddingVertical: spacing.sm,
  },
  emptyFeedText: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  seeAllBtn: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginBottom: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: '#FFF0E9',
    borderWidth: 1,
    borderColor: '#FFD4BC',
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  collapseBtn: {
    paddingTop: spacing.sm,
    alignItems: 'center',
  },
  collapseText: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '600',
  },
})
