import React, { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Image, RefreshControl,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { colors, radius, spacing } from '../../constants/theme'
import { useSellerStore } from '../../store/sellerStore'
import {
  getRevenueSummary, getDailyRevenue, getTopProducts, getCustomerInsights,
  RevenueSummary, DailyRevenue, TopProduct, CustomerInsights,
} from '../../services/analyticsService'

type Props = { navigation: NativeStackNavigationProp<any> }

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub && <Text style={styles.statSub}>{sub}</Text>}
    </View>
  )
}

function RevenueChart({ data }: { data: DailyRevenue[] }) {
  const maxVal = Math.max(...data.map(d => d.revenue), 1)
  return (
    <View style={styles.chart}>
      <View style={styles.chartBars}>
        {data.map((d, i) => {
          const heightPct = maxVal > 0 ? (d.revenue / maxVal) * 100 : 0
          const isToday = i === data.length - 1
          return (
            <View key={d.date} style={styles.barCol}>
              <Text style={styles.barAmt}>
                {d.revenue > 0 ? `₹${d.revenue >= 1000 ? `${(d.revenue / 1000).toFixed(1)}k` : d.revenue}` : ''}
              </Text>
              <View style={styles.barTrack}>
                <View style={[
                  styles.bar,
                  { height: `${Math.max(heightPct, 4)}%` },
                  isToday && styles.barToday,
                ]} />
              </View>
              <Text style={[styles.barLabel, isToday && styles.barLabelToday]}>{d.label}</Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

export default function AnalyticsScreen({ navigation }: Props) {
  const store = useSellerStore(s => s.store)
  const [summary, setSummary] = useState<RevenueSummary | null>(null)
  const [daily, setDaily] = useState<DailyRevenue[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [customers, setCustomers] = useState<CustomerInsights | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  async function loadData() {
    if (!store) return
    const [s, d, p, c] = await Promise.all([
      getRevenueSummary(store.id),
      getDailyRevenue(store.id),
      getTopProducts(store.id),
      getCustomerInsights(store.id),
    ])
    setSummary(s)
    setDaily(d)
    setTopProducts(p)
    setCustomers(c)
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => { loadData() }, [store?.id])

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  const repeatPct = customers && customers.total > 0
    ? Math.round((customers.repeat / customers.total) * 100)
    : 0

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Analytics</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData() }} tintColor={colors.primary} />}
      >
        {/* Revenue summary */}
        <Text style={styles.sectionTitle}>Revenue</Text>
        <View style={styles.statGrid}>
          <StatCard label="Today" value={`₹${summary?.today ?? 0}`} sub={`${summary?.todayOrders ?? 0} orders`} />
          <StatCard label="This Week" value={`₹${summary?.thisWeek ?? 0}`} sub={`${summary?.weekOrders ?? 0} orders`} />
          <StatCard label="This Month" value={`₹${summary?.thisMonth ?? 0}`} sub={`${summary?.monthOrders ?? 0} orders`} />
        </View>

        {/* 7-day chart */}
        {daily.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Last 7 Days</Text>
            <RevenueChart data={daily} />
          </View>
        )}

        {/* Top products */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Products</Text>
          {topProducts.length === 0 ? (
            <Text style={styles.emptyText}>No orders yet</Text>
          ) : (
            topProducts.map((p, i) => (
              <View key={p.id} style={styles.productRow}>
                <Text style={styles.rank}>#{i + 1}</Text>
                {p.images?.[0] ? (
                  <Image source={{ uri: p.images[0] }} style={styles.productThumb} />
                ) : (
                  <View style={[styles.productThumb, styles.productThumbEmpty]}>
                    <Text style={{ fontSize: 16 }}>📦</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.productName} numberOfLines={1}>{p.name}</Text>
                  <Text style={styles.productPrice}>₹{p.price}</Text>
                </View>
                <Text style={styles.soldCount}>{p.total_sold} sold</Text>
              </View>
            ))
          )}
        </View>

        {/* Customer breakdown */}
        {customers && customers.total > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Customers</Text>
            <View style={styles.customerGrid}>
              <View style={styles.customerCard}>
                <Text style={styles.customerNum}>{customers.total}</Text>
                <Text style={styles.customerLabel}>Total Buyers</Text>
              </View>
              <View style={[styles.customerCard, styles.customerCardGreen]}>
                <Text style={styles.customerNum}>{customers.repeat}</Text>
                <Text style={styles.customerLabel}>Repeat ({repeatPct}%)</Text>
              </View>
              <View style={styles.customerCard}>
                <Text style={styles.customerNum}>{customers.new}</Text>
                <Text style={styles.customerLabel}>New</Text>
              </View>
            </View>
            {/* Simple bar for repeat ratio */}
            <View style={styles.repeatBar}>
              <View style={[styles.repeatFill, { width: `${repeatPct}%` }]} />
            </View>
            <Text style={styles.repeatHint}>{repeatPct}% repeat rate — {repeatPct >= 30 ? 'Great! Buyers love your store 🎉' : 'Keep delivering great service to build loyalty'}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: 56, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  back: { fontSize: 16, color: colors.primary, fontWeight: '600' },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  body: { padding: spacing.md, paddingBottom: 40 },
  section: { marginBottom: spacing.lg },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm },
  statGrid: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  statCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  statValue: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  statLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
  statSub: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  chart: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
    height: 180,
  },
  chartBars: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  barCol: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  barAmt: { fontSize: 9, color: colors.textMuted, marginBottom: 2 },
  barTrack: { width: 20, height: '70%', justifyContent: 'flex-end' },
  bar: { width: '100%', backgroundColor: colors.border, borderRadius: 4 },
  barToday: { backgroundColor: colors.primary },
  barLabel: { fontSize: 10, color: colors.textMuted, marginTop: 4 },
  barLabelToday: { color: colors.primary, fontWeight: '700' },
  productRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  rank: { fontSize: 14, fontWeight: '700', color: colors.textMuted, width: 24 },
  productThumb: { width: 40, height: 40, borderRadius: radius.sm },
  productThumbEmpty: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  productName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  productPrice: { fontSize: 12, color: colors.textSecondary },
  soldCount: { fontSize: 13, fontWeight: '700', color: colors.primary },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.md },
  customerGrid: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  customerCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  customerCardGreen: { borderColor: colors.success },
  customerNum: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  customerLabel: { fontSize: 11, color: colors.textMuted, textAlign: 'center', marginTop: 2 },
  repeatBar: {
    height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden', marginBottom: spacing.xs,
  },
  repeatFill: { height: '100%', backgroundColor: colors.success, borderRadius: 4 },
  repeatHint: { fontSize: 12, color: colors.textSecondary },
})
