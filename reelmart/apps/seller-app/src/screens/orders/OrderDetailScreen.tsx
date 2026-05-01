import React, { useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator, TextInput, Modal,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RouteProp } from '@react-navigation/native'
import { colors, radius, spacing } from '../../constants/theme'
import { useOrderStore } from '../../store/orderStore'
import {
  acceptOrder, rejectOrder, updateOrderStatus,
  ORDER_STATUS_LABELS, ORDER_STATUS_COLORS,
} from '../../services/orderService'

type Props = {
  navigation: NativeStackNavigationProp<any>
  route: RouteProp<{ OrderDetail: { orderId: string } }, 'OrderDetail'>
}

const STATUS_FLOW = ['pending', 'accepted', 'packed', 'shipped', 'delivered'] as const

export default function OrderDetailScreen({ navigation, route }: Props) {
  const { orderId } = route.params
  const { orders, updateOrderInList } = useOrderStore()
  const order = orders.find(o => o.id === orderId)
  const [loading, setLoading] = useState(false)
  const [rejectModal, setRejectModal] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  if (!order) return null

  const items = order.items as any[]
  const address = order.delivery_address as any
  const statusColor = ORDER_STATUS_COLORS[order.status] ?? colors.textMuted

  async function handleAccept() {
    setLoading(true)
    await acceptOrder(orderId)
    updateOrderInList(orderId, { status: 'accepted', accepted_at: new Date().toISOString() })
    setLoading(false)
  }

  async function handleReject() {
    if (!rejectReason.trim()) { Alert.alert('Reason required', 'Please enter a reason for rejection.'); return }
    setLoading(true)
    await rejectOrder(orderId, rejectReason.trim())
    updateOrderInList(orderId, { status: 'rejected', rejection_reason: rejectReason.trim() })
    setLoading(false)
    setRejectModal(false)
    navigation.goBack()
  }

  async function handleStatusUpdate(status: typeof STATUS_FLOW[number]) {
    setLoading(true)
    await updateOrderStatus(orderId, status)
    updateOrderInList(orderId, { status })
    setLoading(false)
  }

  const nextStatus = STATUS_FLOW[STATUS_FLOW.indexOf(order.status as any) + 1]

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{order.order_number}</Text>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {ORDER_STATUS_LABELS[order.status]}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>

        {/* Customer */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer</Text>
          <Text style={styles.customerName}>{order.users?.name ?? 'Customer'}</Text>
          <Text style={styles.customerPhone}>📞 {order.users?.phone ?? '—'}</Text>
        </View>

        {/* Items */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Items</Text>
          {items.map((item: any, i: number) => (
            <View key={i} style={styles.itemRow}>
              <View style={styles.itemLeft}>
                <Text style={styles.itemName}>{item.name}</Text>
                {item.variant && <Text style={styles.itemVariant}>{item.variant}</Text>}
              </View>
              <Text style={styles.itemQty}>×{item.qty}</Text>
              <Text style={styles.itemPrice}>₹{item.price * item.qty}</Text>
            </View>
          ))}
          <View style={styles.divider} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalVal}>₹{order.subtotal}</Text>
          </View>
          {order.delivery_fee > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Delivery</Text>
              <Text style={styles.totalVal}>₹{order.delivery_fee}</Text>
            </View>
          )}
          {order.discount_amount > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Discount</Text>
              <Text style={[styles.totalVal, { color: colors.success }]}>−₹{order.discount_amount}</Text>
            </View>
          )}
          <View style={[styles.totalRow, styles.grandTotal]}>
            <Text style={styles.grandLabel}>Total</Text>
            <Text style={styles.grandVal}>₹{order.total_amount}</Text>
          </View>
          <View style={styles.paymentRow}>
            <Text style={styles.paymentMethod}>
              {order.payment_method === 'cod' ? '💵 Cash on Delivery' : '✅ Paid Online'}
            </Text>
            <View style={[
              styles.paymentStatus,
              { backgroundColor: order.payment_status === 'paid' ? '#DCFCE7' : '#FEF3C7' }
            ]}>
              <Text style={{
                fontSize: 12, fontWeight: '700',
                color: order.payment_status === 'paid' ? '#16A34A' : '#D97706',
              }}>
                {order.payment_status === 'paid' ? 'Paid' : 'Pending'}
              </Text>
            </View>
          </View>
        </View>

        {/* Delivery Address */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Delivery Address</Text>
          <Text style={styles.addressText}>
            {address.name}{'\n'}
            {address.line1}{address.line2 ? `, ${address.line2}` : ''}{'\n'}
            {address.area ? `${address.area}, ` : ''}{address.city} – {address.pincode}{'\n'}
            📞 {address.phone}
          </Text>
        </View>

        {order.notes ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Customer Note</Text>
            <Text style={styles.noteText}>{order.notes}</Text>
          </View>
        ) : null}

        {/* Tracking */}
        {order.tracking_url && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tracking</Text>
            <Text style={styles.trackingText}>{order.awb_code}</Text>
          </View>
        )}

        {/* Actions */}
        {order.status === 'pending' && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.rejectBtn, loading && styles.btnDisabled]}
              onPress={() => setRejectModal(true)}
              disabled={loading}
            >
              <Text style={styles.rejectBtnText}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.acceptBtn, loading && styles.btnDisabled]}
              onPress={handleAccept}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color={colors.white} />
                : <Text style={styles.acceptBtnText}>Accept Order ✓</Text>
              }
            </TouchableOpacity>
          </View>
        )}

        {nextStatus && order.status !== 'pending' && !['rejected', 'cancelled', 'delivered', 'returned'].includes(order.status) && (
          <TouchableOpacity
            style={[styles.nextStatusBtn, loading && styles.btnDisabled]}
            onPress={() => handleStatusUpdate(nextStatus)}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={colors.white} />
              : <Text style={styles.nextStatusText}>
                  Mark as {ORDER_STATUS_LABELS[nextStatus]} →
                </Text>
            }
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Reject Modal */}
      <Modal visible={rejectModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Reason for rejection</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Out of stock, cannot deliver to this area..."
              placeholderTextColor={colors.textMuted}
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              numberOfLines={3}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setRejectModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalReject} onPress={handleReject} disabled={loading}>
                {loading
                  ? <ActivityIndicator size="small" color={colors.white} />
                  : <Text style={styles.modalRejectText}>Reject Order</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: 56, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  back: { fontSize: 16, color: colors.primary, fontWeight: '600', marginRight: spacing.xs },
  title: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  statusText: { fontSize: 12, fontWeight: '700' },
  body: { padding: spacing.lg, paddingBottom: 40 },
  section: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: colors.textMuted, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  customerName: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  customerPhone: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
  itemRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
  itemLeft: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: '500', color: colors.textPrimary },
  itemVariant: { fontSize: 12, color: colors.textMuted },
  itemQty: { fontSize: 14, color: colors.textSecondary, marginHorizontal: spacing.sm },
  itemPrice: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  totalLabel: { fontSize: 14, color: colors.textSecondary },
  totalVal: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  grandTotal: { marginTop: spacing.xs },
  grandLabel: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  grandVal: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  paymentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  paymentMethod: { fontSize: 13, color: colors.textSecondary },
  paymentStatus: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill },
  addressText: { fontSize: 14, color: colors.textPrimary, lineHeight: 22 },
  noteText: { fontSize: 14, color: colors.textSecondary, fontStyle: 'italic' },
  trackingText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  rejectBtn: {
    flex: 1, borderWidth: 1.5, borderColor: colors.error,
    borderRadius: radius.pill, height: 52, alignItems: 'center', justifyContent: 'center',
  },
  rejectBtnText: { color: colors.error, fontWeight: '700', fontSize: 15 },
  acceptBtn: {
    flex: 2, backgroundColor: colors.primary,
    borderRadius: radius.pill, height: 52, alignItems: 'center', justifyContent: 'center',
  },
  acceptBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  nextStatusBtn: {
    backgroundColor: colors.primary, borderRadius: radius.pill,
    height: 52, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md,
  },
  nextStatusText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  btnDisabled: { opacity: 0.6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: colors.white, borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: 40,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.md },
  modalInput: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.md, fontSize: 15, color: colors.textPrimary,
    textAlignVertical: 'top', height: 96, marginBottom: spacing.lg,
  },
  modalActions: { flexDirection: 'row', gap: spacing.sm },
  modalCancel: {
    flex: 1, borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radius.pill, height: 48, alignItems: 'center', justifyContent: 'center',
  },
  modalCancelText: { fontSize: 15, color: colors.textSecondary, fontWeight: '600' },
  modalReject: {
    flex: 2, backgroundColor: colors.error,
    borderRadius: radius.pill, height: 48, alignItems: 'center', justifyContent: 'center',
  },
  modalRejectText: { color: colors.white, fontWeight: '700', fontSize: 15 },
})
