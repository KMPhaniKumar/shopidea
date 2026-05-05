import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Switch, ActivityIndicator, RefreshControl,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { colors, radius, spacing } from '../../constants/theme'
import { useAuthStore } from '../../store/authStore'
import { useSellerStore } from '../../store/sellerStore'
import { useOrderStore } from '../../store/orderStore'
import { useProductStore } from '../../store/productStore'
import { supabase } from '../../lib/supabase'
import { isLowStock, isOutOfStock } from '../../services/productService'
import { subscribeToNewOrders } from '../../services/orderService'

type Props = { navigation: NativeStackNavigationProp<any> }

interface TodaySummary {
  revenue: number
  orders: number
  pending: number
}

async function getTodaySummary(storeId: string): Promise<TodaySummary> {
  const today = new Date().toISOString().split('T')[0]
  const { data } = await supabase
    .from('orders')
    .select('total_amount, status')
    .eq('store_id', storeId)
    .gte('created_at', today)

  const orders = data ?? []
  return {
    revenue: orders
      .filter(o => !['rejected', 'cancelled'].includes(o.status))
      .reduce((s, o) => s + o.total_amount, 0),
    orders: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
  }
}

export default function DashboardScreen({ navigation }: Props) {
  const profile = useAuthStore(s => s.profile)
  const { store, updateStore } = useSellerStore()
  const { orders, fetchOrders } = useOrderStore()
  const { products, fetchProducts } = useProductStore()
  const session = useAuthStore(s => s.session)

  const [summary, setSummary] = useState<TodaySummary>({ revenue: 0, orders: 0, pending: 0 })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [isOpen, setIsOpen] = useState(store?.is_open ?? true)

  const loadDashboard = useCallback(async () => {
    if (!store || !session?.user) return
    const [sum] = await Promise.all([
      getTodaySummary(store.id),
      fetchOrders(store.id),
      fetchProducts(store.id),
    ])
    setSummary(sum)
    setLoading(false)
    setRefreshing(false)
  }, [store?.id, session?.user?.id])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  // Realtime new order subscription
  useEffect(() => {
    if (!store) return
    const channel = subscribeToNewOrders(store.id, (order) => {
      setSummary(prev => ({
        ...prev,
        orders: prev.orders + 1,
        pending: prev.pending + 1,
      }))
    })
    return () => { supabase.removeChannel(channel) }
  }, [store?.id])

  async function handleToggleOpen(val: boolean) {
    setIsOpen(val)
    if (!store) return
    await supabase.from('stores').update({ is_open: val }).eq('id', store.id)
    updateStore({ is_open: val })
  }

  const pendingOrders = orders.filter(o => o.status === 'pending').slice(0, 3)
  const activeOrders = orders.filter(o => ['accepted', 'packed', 'shipped'].includes(o.status))
  const lowStockItems = products.filter(p => isLowStock(p) && !isOutOfStock(p)).slice(0, 3)
  const outOfStockItems = products.filter(p => isOutOfStock(p)).slice(0, 2)
  const recentOrders = orders.slice(0, 5)

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>{greeting()}, {profile?.name?.split(' ')[0] ?? 'Seller'}! 👋</Text>
          <Text style={styles.storeName}>{store?.store_name}</Text>
        </View>
        <View style={styles.openToggle}>
          <Text style={[styles.openLabel, !isOpen && styles.closedLabel]}>
            {isOpen ? '🟢 Open' : '🔴 Closed'}
          </Text>
          <Switch
            value={isOpen}
            onValueChange={handleToggleOpen}
            trackColor={{ false: colors.border, true: '#FFD5BE' }}
            thumbColor={isOpen ? colors.primary : colors.textMuted}
          />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadDashboard() }} tintColor={colors.primary} />}
      >

        {/* Today's summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>TODAY</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>₹{summary.revenue.toLocaleString('en-IN')}</Text>
              <Text style={styles.summaryItemLabel}>Revenue</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{summary.orders}</Text>
              <Text style={styles.summaryItemLabel}>Orders</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, summary.pending > 0 && styles.pendingNum]}>{summary.pending}</Text>
              <Text style={styles.summaryItemLabel}>Pending</Text>
            </View>
          </View>
        </View>

        {/* Quick actions */}
        <View style={styles.quickActions}>
          {[
            { icon: '📦', label: 'Products', screen: 'Products' },
            { icon: '📋', label: 'Orders', screen: 'Orders', badge: activeOrders.length > 0 ? activeOrders.length : undefined },
            { icon: '📊', label: 'Analytics', screen: 'Analytics' },
            { icon: '💰', label: 'Payouts', screen: 'PayoutHistory' },
          ].map(a => (
            <TouchableOpacity key={a.screen} style={styles.quickAction} onPress={() => navigation.navigate(a.screen)}>
              <View style={styles.quickActionIcon}>
                <Text style={{ fontSize: 22 }}>{a.icon}</Text>
                {a.badge ? (
                  <View style={styles.badge}><Text style={styles.badgeText}>{a.badge}</Text></View>
                ) : null}
              </View>
              <Text style={styles.quickActionLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Pending orders alert */}
        {pendingOrders.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>⚠️ Needs Action ({summary.pending})</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Orders')}>
                <Text style={styles.seeAll}>See all →</Text>
              </TouchableOpacity>
            </View>
            {pendingOrders.map(order => {
              const items = order.items as any[]
              const minutesAgo = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000)
              return (
                <TouchableOpacity
                  key={order.id}
                  style={styles.alertCard}
                  onPress={() => navigation.navigate('OrderDetail', { orderId: order.id })}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.alertOrderNum}>{order.order_number}</Text>
                    <Text style={styles.alertItems} numberOfLines={1}>
                      {items.map((i: any) => i.name).join(', ')}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.alertAmount}>₹{order.total_amount}</Text>
                    <Text style={styles.alertTime}>{minutesAgo < 60 ? `${minutesAgo}m ago` : `${Math.floor(minutesAgo / 60)}h ago`}</Text>
                  </View>
                </TouchableOpacity>
              )
            })}
          </View>
        )}

        {/* Low stock warning */}
        {(lowStockItems.length > 0 || outOfStockItems.length > 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📦 Stock Alerts</Text>
            {outOfStockItems.map(p => (
              <TouchableOpacity key={p.id} style={[styles.stockRow, styles.stockRowRed]} onPress={() => navigation.navigate('EditProduct', { product: p })}>
                <Text style={styles.stockName} numberOfLines={1}>{p.name}</Text>
                <Text style={styles.stockOutLabel}>Out of stock</Text>
              </TouchableOpacity>
            ))}
            {lowStockItems.map(p => (
              <TouchableOpacity key={p.id} style={[styles.stockRow, styles.stockRowOrange]} onPress={() => navigation.navigate('EditProduct', { product: p })}>
                <Text style={styles.stockName} numberOfLines={1}>{p.name}</Text>
                <Text style={styles.stockLowLabel}>Only {p.stock_count} left</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Recent orders */}
        {recentOrders.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Orders</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Orders')}>
                <Text style={styles.seeAll}>See all →</Text>
              </TouchableOpacity>
            </View>
            {recentOrders.map(order => {
              const items = order.items as any[]
              const STATUS_COLORS: Record<string, string> = {
                pending: '#F59E0B', accepted: colors.primary, packed: '#3B82F6',
                shipped: '#8B5CF6', delivered: colors.success, rejected: colors.error,
              }
              return (
                <TouchableOpacity
                  key={order.id}
                  style={styles.recentOrderRow}
                  onPress={() => navigation.navigate('OrderDetail', { orderId: order.id })}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recentOrderNum}>{order.order_number}</Text>
                    <Text style={styles.recentOrderItems} numberOfLines={1}>
                      {items.map((i: any) => i.name).join(', ')}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.recentOrderAmount}>₹{order.total_amount}</Text>
                    <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[order.status] ?? colors.border }]}>
                      <Text style={styles.statusDotText}>{order.status}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )
            })}
          </View>
        )}

        {orders.length === 0 && (
          <View style={styles.emptyOrders}>
            <Text style={styles.emptyIcon}>🛍️</Text>
            <Text style={styles.emptyTitle}>No orders yet</Text>
            <Text style={styles.emptySub}>Share your store link to get your first order!</Text>
            <TouchableOpacity style={styles.shareBtn} onPress={() => navigation.navigate('EditStore')}>
              <Text style={styles.shareBtnText}>Go to Store Settings →</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Settings FAB */}
      <TouchableOpacity style={styles.settingsFab} onPress={() => navigation.navigate('Settings', {})}>
        <Text style={{ fontSize: 22 }}>⚙️</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingTop: 56, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  greeting: { fontSize: 13, color: colors.textMuted, marginBottom: 2 },
  storeName: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
  openToggle: { alignItems: 'flex-end', gap: 4 },
  openLabel: { fontSize: 13, fontWeight: '700', color: colors.success },
  closedLabel: { color: colors.error },
  body: { padding: spacing.md, paddingBottom: 100 },
  summaryCard: {
    backgroundColor: '#FFF0E9', borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.lg,
    borderWidth: 1, borderColor: '#FFD5BE',
  },
  summaryLabel: { fontSize: 11, fontWeight: '700', color: colors.primary, marginBottom: spacing.sm, letterSpacing: 0.5 },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  summaryItemLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  summaryDivider: { width: 1, height: 40, backgroundColor: '#FFD5BE' },
  pendingNum: { color: '#F59E0B' },
  quickActions: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.lg },
  quickAction: { flex: 1, alignItems: 'center', gap: 6 },
  quickActionIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  badge: { position: 'absolute', top: -4, right: -4, backgroundColor: colors.error, borderRadius: 10, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  quickActionLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  section: { marginBottom: spacing.lg },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  seeAll: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  alertCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFF8E7', borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.xs,
    borderWidth: 1, borderColor: '#FCD34D',
  },
  alertOrderNum: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  alertItems: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  alertAmount: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  alertTime: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  stockRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: spacing.sm, borderRadius: radius.sm, marginBottom: 4,
  },
  stockRowRed: { backgroundColor: '#FEF2F2' },
  stockRowOrange: { backgroundColor: '#FFF8F0' },
  stockName: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  stockOutLabel: { fontSize: 12, fontWeight: '700', color: colors.error },
  stockLowLabel: { fontSize: 12, fontWeight: '700', color: '#F59E0B' },
  recentOrderRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  recentOrderNum: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  recentOrderItems: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  recentOrderAmount: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  statusDot: { borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2, marginTop: 3 },
  statusDotText: { fontSize: 10, fontWeight: '700', color: colors.white, textTransform: 'capitalize' },
  emptyOrders: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 52, marginBottom: spacing.md },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 },
  emptySub: { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.lg },
  shareBtn: {
    backgroundColor: colors.primary, borderRadius: radius.pill,
    paddingHorizontal: spacing.lg, paddingVertical: 12,
  },
  shareBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  settingsFab: {
    position: 'absolute', bottom: 28, right: 24,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.border,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
  },
})
