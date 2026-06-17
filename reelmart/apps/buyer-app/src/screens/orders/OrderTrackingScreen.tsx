import React, { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Linking,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RouteProp } from '@react-navigation/native'
import { colors, radius, spacing } from '../../constants/theme'
import { useOrderStore } from '../../store/orderStore'
import { subscribeToOrderStatus, STATUS_LABELS, getOrderById } from '../../services/orderService'
import { computePriceBreakup, fmtRupee } from '../../services/orderPricing'
import { supabase } from '../../lib/supabase'
import OrderTimeline from '../../components/OrderTimeline'

type Props = {
  navigation: NativeStackNavigationProp<any>
  route: RouteProp<{ OrderTracking: { orderId: string } }, 'OrderTracking'>
}

export default function OrderTrackingScreen({ navigation, route }: Props) {
  const { orderId } = route.params
  const { orders, updateOrder } = useOrderStore()
  const [localOrder, setLocalOrder] = useState(orders.find(o => o.id === orderId) ?? null)

  useEffect(() => {
    if (!localOrder) {
      getOrderById(orderId).then(o => { if (o) setLocalOrder(o) })
    }
    const channel = subscribeToOrderStatus(orderId, (updated) => {
      updateOrder(orderId, updated as any)
      setLocalOrder(prev => prev ? { ...prev, ...updated } : null)
    })
    return () => { supabase.removeChannel(channel) }
  }, [orderId])

  if (!localOrder) return null

  const isTerminal = ['rejected', 'cancelled'].includes(localOrder.status)
  const items = localOrder.items as any[]
  const address = localOrder.delivery_address as any

  // Build address lines
  const addressLine1 = [address.line1, address.line2, address.area]
    .filter(Boolean)
    .join(', ')
  const addressLine2 = `${address.city}, ${address.state} – ${address.pincode}`

  // Price breakup
  const breakup = computePriceBreakup({
    items,
    subtotal: localOrder.subtotal,
    delivery_fee: localOrder.delivery_fee,
    discount_amount: (localOrder as any).discount_amount,
    coins_discount: (localOrder as any).coins_discount,
    total_amount: localOrder.total_amount,
    payment_method: localOrder.payment_method ?? 'online',
    payment_method_detail: (localOrder as any).payment_method_detail,
  })

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate('Tabs', { screen: 'Orders' })}>
          <Text style={styles.back}>← Orders</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{localOrder.order_number}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>

        {/* Store + order meta row */}
        <View style={styles.orderMetaRow}>
          {localOrder.stores && (
            <Text style={styles.storeName}>{localOrder.stores.store_name}</Text>
          )}
          <Text style={styles.orderDate}>
            Placed on {new Date(localOrder.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            {' · '}
            {new Date(localOrder.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
          </Text>
          {isTerminal && localOrder.rejection_reason ? (
            <View style={styles.rejectedBanner}>
              <Text style={styles.rejectedLabel}>
                {STATUS_LABELS[localOrder.status] ?? localOrder.status}
              </Text>
              <Text style={styles.rejectedReason}>{localOrder.rejection_reason}</Text>
            </View>
          ) : null}
        </View>

        {/* Rich order timeline (status header + 4-node rail + event feed) */}
        <OrderTimeline orderId={orderId} />

        {/* Tracking — show whenever order is shipped or beyond */}
        {(localOrder.status === 'shipped' || localOrder.status === 'delivered') && (
          localOrder.tracking_url ? (
            <TouchableOpacity
              style={styles.trackingCard}
              onPress={() => Linking.openURL(localOrder.tracking_url!)}
              activeOpacity={0.85}
            >
              <Text style={styles.trackingLabel}>🚚 Track with Courier</Text>
              {localOrder.awb_code && (
                <Text style={styles.trackingAWB}>AWB: {localOrder.awb_code}</Text>
              )}
              <Text style={styles.trackingLink}>Tap to open courier tracking →</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.trackingPending}>
              <Text style={styles.trackingPendingTitle}>📦 Shipped — tracking pending</Text>
              <Text style={styles.trackingPendingSub}>
                Your order has been handed to the courier. Tracking link will appear here shortly.
              </Text>
            </View>
          )
        )}

        {/* Items */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Items</Text>
          {items.map((item: any, i: number) => (
            <View key={i} style={styles.itemRow}>
              <Text style={styles.itemName}>{item.name}{item.variant ? ` · ${item.variant}` : ''}</Text>
              <Text style={styles.itemPrice}>₹{item.price * item.qty} ×{item.qty}</Text>
            </View>
          ))}
        </View>

        {/* Price details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Price details</Text>

          {/* Listing price (MRP) — only when hasMrp */}
          {breakup.hasMrp && (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Listing price</Text>
              <Text style={styles.priceMrp}>₹{fmtRupee(breakup.listingTotal)}</Text>
            </View>
          )}

          {/* Special price / Item total */}
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>
              {breakup.hasMrp ? 'Special price' : 'Item total'}
            </Text>
            <Text style={styles.priceVal}>₹{fmtRupee(breakup.specialTotal)}</Text>
          </View>

          {/* Delivery fee */}
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Total fees</Text>
            {breakup.fees === 0 ? (
              <Text style={styles.priceFree}>FREE</Text>
            ) : (
              <Text style={styles.priceVal}>₹{fmtRupee(breakup.fees)}</Text>
            )}
          </View>

          {/* Other discount — only when > 0 */}
          {breakup.otherDiscount > 0 && (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Other discount</Text>
              <Text style={styles.priceDiscount}>−₹{fmtRupee(breakup.otherDiscount)}</Text>
            </View>
          )}

          {/* Dashed divider */}
          <View style={styles.dashedDivider} />

          {/* Total amount */}
          <View style={styles.priceRow}>
            <Text style={styles.priceTotalLabel}>Total amount</Text>
            <Text style={styles.priceTotalVal}>₹{fmtRupee(breakup.total)}</Text>
          </View>

          {/* Paid by pill */}
          <View style={styles.paidByRow}>
            <Text style={styles.paidByLabel}>Paid by</Text>
            <View style={styles.paidByPill}>
              <Text style={styles.paidByPillText}>{breakup.paidBy}</Text>
            </View>
          </View>
        </View>

        {/* Delivery details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Delivery details</Text>

          {/* Address row */}
          <View style={styles.deliveryRow}>
            <Text style={styles.deliveryIcon}>🏠</Text>
            <View style={styles.deliveryContent}>
              <Text style={styles.deliveryTag}>Home</Text>
              <Text style={styles.deliveryAddress}>{addressLine1}</Text>
              <Text style={styles.deliveryAddress}>{addressLine2}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Person row */}
          <View style={styles.deliveryRow}>
            <Text style={styles.deliveryIcon}>👤</Text>
            <View style={styles.deliveryContent}>
              <Text style={styles.deliveryName}>{address.name}</Text>
              <Text style={styles.deliveryPhone}>{address.phone}</Text>
              {address.alt_phone ? (
                <Text style={styles.deliveryPhone}>Alt: {address.alt_phone}</Text>
              ) : null}
            </View>
          </View>
        </View>

        {/* Reorder */}
        {localOrder.status === 'delivered' && (
          <TouchableOpacity
            style={styles.reorderBtn}
            onPress={() => navigation.navigate('Storefront', { slug: localOrder.stores?.store_slug })}
          >
            <Text style={styles.reorderBtnText}>🔁 Reorder from this store</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingTop: 56, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  back: { fontSize: 16, color: colors.primary, fontWeight: '600' },
  title: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  body: { padding: spacing.md, paddingBottom: 40, gap: spacing.md },

  // Order meta row — store name + placement date
  orderMetaRow: {
    marginBottom: spacing.xs,
  },
  storeName: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginBottom: 2 },
  orderDate: { fontSize: 12, color: colors.textMuted },

  // Rejection / cancellation inline banner (when order is terminal and has a reason)
  rejectedBanner: {
    marginTop: spacing.sm,
    backgroundColor: '#FEF2F2',
    borderRadius: radius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  rejectedLabel: { fontSize: 12, fontWeight: '700', color: colors.error, marginBottom: 2 },
  rejectedReason: { fontSize: 13, color: colors.textPrimary },

  // Courier tracking card
  trackingCard: {
    backgroundColor: '#EFF6FF', borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1, borderColor: '#BFDBFE',
  },
  trackingLabel: { fontSize: 15, fontWeight: '700', color: '#1D4ED8', marginBottom: 2 },
  trackingAWB: { fontSize: 13, color: '#3B82F6', fontWeight: '600' },
  trackingLink: { fontSize: 12, color: '#6B7280', marginTop: 4 },
  trackingPending: {
    backgroundColor: '#FFF7ED', borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1, borderColor: '#FED7AA',
  },
  trackingPendingTitle: { fontSize: 14, fontWeight: '700', color: '#9A3412', marginBottom: 4 },
  trackingPendingSub: { fontSize: 12, color: '#7C2D12', lineHeight: 18 },

  // Shared card / section
  section: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: colors.textMuted,
    marginBottom: spacing.md, textTransform: 'uppercase', letterSpacing: 0.5,
  },

  // Items
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  itemName: { flex: 1, fontSize: 14, color: colors.textPrimary, marginRight: spacing.sm },
  itemPrice: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },

  // Price details rows
  priceRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 8,
  },
  priceLabel: { fontSize: 14, color: colors.textSecondary },
  priceVal: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  priceMrp: {
    fontSize: 14, fontWeight: '500', color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  priceFree: { fontSize: 14, fontWeight: '700', color: '#00B98E' },
  priceDiscount: { fontSize: 14, fontWeight: '700', color: '#00B98E' },
  dashedDivider: {
    borderBottomWidth: 1, borderBottomColor: colors.border,
    borderStyle: 'dashed', marginVertical: spacing.sm,
  },
  priceTotalLabel: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  priceTotalVal: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  paidByRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  paidByLabel: { fontSize: 13, color: colors.textSecondary },
  paidByPill: {
    backgroundColor: '#FFF0E9', borderRadius: radius.pill,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: '#FFD5BE',
  },
  paidByPillText: { fontSize: 12, fontWeight: '700', color: colors.primary },

  // Delivery details
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  deliveryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  deliveryIcon: { fontSize: 20, marginTop: 1 },
  deliveryContent: { flex: 1 },
  deliveryTag: { fontSize: 12, fontWeight: '700', color: colors.textMuted, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.4 },
  deliveryAddress: { fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
  deliveryName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  deliveryPhone: { fontSize: 13, color: colors.textSecondary, marginTop: 1 },

  // Reorder CTA
  reorderBtn: {
    backgroundColor: colors.primary, borderRadius: radius.pill,
    height: 52, alignItems: 'center', justifyContent: 'center',
  },
  reorderBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
})
