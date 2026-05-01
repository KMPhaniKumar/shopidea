import React, { useEffect, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { colors, radius, spacing } from '../../constants/theme'
import { useOrderStore } from '../../store/orderStore'
import { useSellerStore } from '../../store/sellerStore'
import { subscribeToNewOrders, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, OrderWithBuyer } from '../../services/orderService'

type Tab = 'pending' | 'active' | 'completed'
type Props = { navigation: NativeStackNavigationProp<any> }

const TABS: { id: Tab; label: string; statuses: string[] }[] = [
  { id: 'pending',   label: 'New',       statuses: ['pending'] },
  { id: 'active',    label: 'Active',    statuses: ['accepted', 'packed', 'shipped'] },
  { id: 'completed', label: 'Completed', statuses: ['delivered', 'rejected', 'cancelled', 'returned'] },
]

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHrs = Math.floor(diffMins / 60)
  if (diffHrs < 24) return `${diffHrs}h ago`
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function OrderCard({ order, onPress }: { order: OrderWithBuyer; onPress: () => void }) {
  const items = order.items as any[]
  const statusColor = ORDER_STATUS_COLORS[order.status] ?? colors.textMuted
  const statusLabel = ORDER_STATUS_LABELS[order.status] ?? order.status

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.cardTop}>
        <Text style={styles.orderNum}>{order.order_number}</Text>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>
      <Text style={styles.buyerName}>{order.users?.name ?? 'Customer'}</Text>
      <Text style={styles.itemsSummary} numberOfLines={1}>
        {items.map((i: any) => `${i.name}${i.variant ? ` (${i.variant})` : ''} ×${i.qty}`).join(', ')}
      </Text>
      <View style={styles.cardBottom}>
        <Text style={styles.amount}>₹{order.total_amount}</Text>
        <View style={styles.rightRow}>
          {order.payment_method === 'cod' && (
            <View style={styles.codBadge}><Text style={styles.codText}>COD</Text></View>
          )}
          <Text style={styles.time}>{formatTime(order.created_at)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  )
}

export default function OrderListScreen({ navigation }: Props) {
  const store = useSellerStore(s => s.store)
  const { orders, loading, fetchOrders, prependOrder } = useOrderStore()
  const [tab, setTab] = useState<Tab>('pending')

  useEffect(() => {
    if (!store?.id) return
    fetchOrders(store.id)

    const channel = subscribeToNewOrders(store.id, (newOrder) => {
      prependOrder(newOrder as OrderWithBuyer)
    })
    return () => { supabase.removeChannel(channel) }
  }, [store?.id])

  const filtered = orders.filter(o => {
    const tabDef = TABS.find(t => t.id === tab)!
    return tabDef.statuses.includes(o.status)
  })

  const counts = TABS.map(t => ({
    ...t,
    count: orders.filter(o => t.statuses.includes(o.status)).length,
  }))

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Orders</Text>
      </View>

      <View style={styles.tabs}>
        {counts.map(t => (
          <TouchableOpacity
            key={t.id}
            style={[styles.tab, tab === t.id && styles.tabActive]}
            onPress={() => setTab(t.id)}
          >
            <Text style={[styles.tabLabel, tab === t.id && styles.tabLabelActive]}>
              {t.label}
            </Text>
            {t.count > 0 && (
              <View style={[styles.tabBadge, tab === t.id && styles.tabBadgeActive]}>
                <Text style={[styles.tabBadgeText, tab === t.id && styles.tabBadgeTextActive]}>
                  {t.count}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>{tab === 'pending' ? '🔔' : tab === 'active' ? '📦' : '✅'}</Text>
          <Text style={styles.emptyText}>No {tab} orders</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={o => o.id}
          renderItem={({ item }) => (
            <OrderCard
              order={item}
              onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  )
}

// Import supabase for channel cleanup
import { supabase } from '../../lib/supabase'

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: {
    paddingHorizontal: spacing.lg, paddingTop: 56, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  tabs: {
    flexDirection: 'row', paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm, gap: spacing.xs,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.sm, borderRadius: radius.pill,
    gap: 4,
  },
  tabActive: { backgroundColor: '#FFF0E9' },
  tabLabel: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },
  tabLabelActive: { color: colors.primary, fontWeight: '700' },
  tabBadge: {
    minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 5,
  },
  tabBadgeActive: { backgroundColor: colors.primary },
  tabBadgeText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  tabBadgeTextActive: { color: colors.white },
  list: { padding: spacing.md, paddingBottom: 24 },
  card: {
    backgroundColor: colors.white, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  orderNum: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill },
  statusText: { fontSize: 12, fontWeight: '700' },
  buyerName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, marginBottom: 2 },
  itemsSummary: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.sm },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amount: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  rightRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  codBadge: {
    backgroundColor: '#FEF3C7', paddingHorizontal: 6,
    paddingVertical: 2, borderRadius: radius.sm,
  },
  codText: { fontSize: 11, fontWeight: '700', color: '#D97706' },
  time: { fontSize: 12, color: colors.textMuted },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyText: { fontSize: 16, color: colors.textMuted, fontWeight: '500' },
})
