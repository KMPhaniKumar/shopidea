import React, { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Linking,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RouteProp } from '@react-navigation/native'
import { colors, radius, spacing } from '../../constants/theme'
import { useOrderStore } from '../../store/orderStore'
import { subscribeToOrderStatus, STATUS_STEPS, STATUS_LABELS, STATUS_ICONS, getOrderById } from '../../services/orderService'
import { supabase } from '../../lib/supabase'

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

  const currentStep = STATUS_STEPS.indexOf(localOrder.status as any)
  const isTerminal = ['rejected', 'cancelled'].includes(localOrder.status)
  const items = localOrder.items as any[]
  const address = localOrder.delivery_address as any

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate('Tabs', { screen: 'Orders' })}>
          <Text style={styles.back}>← Orders</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{localOrder.order_number}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>

        {/* Status Banner */}
        <View style={[styles.statusBanner, isTerminal && styles.statusBannerRed]}>
          <Text style={styles.statusIcon}>{STATUS_ICONS[localOrder.status] ?? '📦'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.statusTitle}>{STATUS_LABELS[localOrder.status] ?? localOrder.status}</Text>
            {localOrder.stores && (
              <Text style={styles.statusSub}>by {localOrder.stores.store_name}</Text>
            )}
            <Text style={styles.statusDate}>
              Placed on {new Date(localOrder.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              {' · '}
              {new Date(localOrder.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
            </Text>
          </View>
        </View>

        {/* Timeline */}
        {!isTerminal && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Order Status</Text>
            {STATUS_STEPS.map((step, i) => {
              const done = i <= currentStep
              const active = i === currentStep
              return (
                <View key={step} style={styles.timelineRow}>
                  <View style={styles.timelineLeft}>
                    <View style={[
                      styles.dot,
                      done && styles.dotDone,
                      active && styles.dotActive,
                    ]}>
                      {done && <Text style={styles.dotCheck}>✓</Text>}
                    </View>
                    {i < STATUS_STEPS.length - 1 && (
                      <View style={[styles.line, done && i < currentStep && styles.lineDone]} />
                    )}
                  </View>
                  <Text style={[styles.stepLabel, active && styles.stepLabelActive, !done && styles.stepLabelDim]}>
                    {STATUS_LABELS[step]}
                  </Text>
                </View>
              )
            })}
          </View>
        )}

        {isTerminal && localOrder.rejection_reason && (
          <View style={[styles.section, styles.rejectedSection]}>
            <Text style={styles.rejectedLabel}>Reason</Text>
            <Text style={styles.rejectedText}>{localOrder.rejection_reason}</Text>
          </View>
        )}

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
          <View style={styles.divider} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Paid</Text>
            <Text style={styles.totalVal}>₹{localOrder.total_amount}</Text>
          </View>
          <Text style={styles.paymentMethod}>
            {localOrder.payment_method === 'cod' ? '💵 Cash on Delivery' : '✅ Paid Online'}
          </Text>
        </View>

        {/* Address */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Delivery Address</Text>
          <Text style={styles.addressText}>
            {address.name} · {address.phone}{'\n'}
            {address.line1}{address.area ? `, ${address.area}` : ''}{'\n'}
            {address.city} – {address.pincode}
          </Text>
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
  body: { padding: spacing.md, paddingBottom: 40 },
  statusBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: '#FFF0E9', borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.md,
  },
  statusBannerRed: { backgroundColor: '#FEF2F2' },
  statusIcon: { fontSize: 36 },
  statusTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  statusSub: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  statusDate: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  section: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: colors.textMuted, marginBottom: spacing.md, textTransform: 'uppercase', letterSpacing: 0.5 },
  timelineRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 0 },
  timelineLeft: { alignItems: 'center', marginRight: spacing.md, width: 24 },
  dot: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.white,
  },
  dotDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  dotActive: { borderColor: colors.primary, borderWidth: 3 },
  dotCheck: { color: colors.white, fontSize: 13, fontWeight: '700' },
  line: { width: 2, height: 28, backgroundColor: colors.border, marginVertical: 2 },
  lineDone: { backgroundColor: colors.primary },
  stepLabel: { fontSize: 14, color: colors.textPrimary, paddingTop: 4, paddingBottom: 28 },
  stepLabelActive: { fontWeight: '700', color: colors.primary },
  stepLabelDim: { color: colors.textMuted },
  rejectedSection: { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' },
  rejectedLabel: { fontSize: 12, fontWeight: '700', color: colors.error, marginBottom: 4 },
  rejectedText: { fontSize: 14, color: colors.textPrimary },
  trackingCard: {
    backgroundColor: '#EFF6FF', borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: '#BFDBFE',
  },
  trackingLabel: { fontSize: 15, fontWeight: '700', color: '#1D4ED8', marginBottom: 2 },
  trackingAWB: { fontSize: 13, color: '#3B82F6', fontWeight: '600' },
  trackingLink: { fontSize: 12, color: '#6B7280', marginTop: 4 },
  trackingPending: {
    backgroundColor: '#FFF7ED', borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: '#FED7AA',
  },
  trackingPendingTitle: { fontSize: 14, fontWeight: '700', color: '#9A3412', marginBottom: 4 },
  trackingPendingSub: { fontSize: 12, color: '#7C2D12', lineHeight: 18 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  itemName: { flex: 1, fontSize: 14, color: colors.textPrimary, marginRight: spacing.sm },
  itemPrice: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  totalVal: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  paymentMethod: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  addressText: { fontSize: 14, color: colors.textPrimary, lineHeight: 22 },
  reorderBtn: {
    backgroundColor: colors.primary, borderRadius: radius.pill,
    height: 52, alignItems: 'center', justifyContent: 'center',
  },
  reorderBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
})
