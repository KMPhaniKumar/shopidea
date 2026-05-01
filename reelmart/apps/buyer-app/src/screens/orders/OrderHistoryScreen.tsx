import React, { useEffect } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { colors, radius, spacing } from '../../constants/theme'
import { useOrderStore } from '../../store/orderStore'
import { useAuthStore } from '../../store/authStore'
import { STATUS_LABELS, STATUS_ICONS, OrderWithStore } from '../../services/orderService'

type Props = { navigation: NativeStackNavigationProp<any> }

function OrderCard({ order, onPress }: { order: OrderWithStore; onPress: () => void }) {
  const items = order.items as any[]
  const isDelivered = order.status === 'delivered'
  const isRejected = ['rejected', 'cancelled'].includes(order.status)

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.cardRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.storeName}>{order.stores?.store_name ?? 'Store'}</Text>
          <Text style={styles.orderNum}>{order.order_number}</Text>
          <Text style={styles.items} numberOfLines={1}>
            {items.map((i: any) => i.name).join(', ')}
          </Text>
        </View>
        <View style={styles.right}>
          <Text style={styles.amount}>₹{order.total_amount}</Text>
          <Text style={[styles.status, isDelivered && styles.statusGreen, isRejected && styles.statusRed]}>
            {STATUS_ICONS[order.status]} {STATUS_LABELS[order.status] ?? order.status}
          </Text>
        </View>
      </View>
      {isDelivered && (
        <TouchableOpacity style={styles.reorderBtn} onPress={onPress}>
          <Text style={styles.reorderText}>🔁 Reorder</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  )
}

export default function OrderHistoryScreen({ navigation }: Props) {
  const session = useAuthStore(s => s.session)
  const { orders, loading, fetchOrders } = useOrderStore()

  useEffect(() => {
    if (session?.user) fetchOrders(session.user.id)
  }, [session?.user?.id])

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Orders</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
      ) : orders.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🛍️</Text>
          <Text style={styles.emptyTitle}>No orders yet</Text>
          <Text style={styles.emptySub}>Discover local sellers and place your first order</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={o => o.id}
          renderItem={({ item }) => (
            <OrderCard
              order={item}
              onPress={() => navigation.navigate('OrderTracking', { orderId: item.id })}
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: {
    paddingHorizontal: spacing.lg, paddingTop: 56, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  list: { padding: spacing.md, paddingBottom: 40 },
  card: {
    backgroundColor: colors.white, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start' },
  storeName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  orderNum: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  items: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  right: { alignItems: 'flex-end' },
  amount: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  status: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginTop: 4 },
  statusGreen: { color: colors.success },
  statusRed: { color: colors.error },
  reorderBtn: {
    marginTop: spacing.sm, paddingTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.border,
    alignItems: 'center',
  },
  reorderText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyIcon: { fontSize: 56, marginBottom: spacing.md },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.xs },
  emptySub: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
})
