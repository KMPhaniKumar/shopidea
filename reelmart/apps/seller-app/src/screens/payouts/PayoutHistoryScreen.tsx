import React, { useEffect, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { colors, radius, spacing } from '../../constants/theme'
import { useSellerStore } from '../../store/sellerStore'
import { getPayoutSummary, PayoutSummary, Payout } from '../../services/payoutService'

type Props = { navigation: NativeStackNavigationProp<any> }

const STATUS_COLORS: Record<string, string> = {
  pending: '#F59E0B',
  processing: '#3B82F6',
  done: '#22C55E',
  failed: '#EF4444',
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  processing: 'Processing',
  done: 'Paid',
  failed: 'Failed',
}

function PayoutCard({ payout }: { payout: Payout }) {
  const date = new Date(payout.created_at ?? '').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  const statusColor = STATUS_COLORS[payout.status ?? 'pending'] ?? colors.textMuted
  return (
    <View style={styles.payoutCard}>
      <View style={{ flex: 1 }}>
        <Text style={styles.payoutDate}>{date}</Text>
        {payout.order_count && (
          <Text style={styles.payoutFee}>{payout.order_count} orders</Text>
        )}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.payoutAmount}>₹{payout.amount.toLocaleString('en-IN')}</Text>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>{STATUS_LABELS[payout.status ?? 'pending']}</Text>
        </View>
      </View>
    </View>
  )
}

export default function PayoutHistoryScreen({ navigation }: Props) {
  const store = useSellerStore(s => s.store)
  const [summary, setSummary] = useState<PayoutSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  async function load() {
    if (!store) return
    const s = await getPayoutSummary(store.id, store.seller_id)
    setSummary(s)
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => { load() }, [store?.id])

  // Next Monday
  const nextMonday = (() => {
    const d = new Date()
    const diff = (1 - d.getDay() + 7) % 7 || 7
    d.setDate(d.getDate() + diff)
    return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })
  })()

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Payouts</Text>
        <TouchableOpacity onPress={() => navigation.navigate('BankAccount')}>
          <Text style={styles.bankBtn}>🏦 Bank</Text>
        </TouchableOpacity>
      </View>

      {/* Pending balance */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Pending Balance</Text>
        <Text style={styles.balanceAmount}>₹{(summary?.pendingAmount ?? 0).toLocaleString('en-IN')}</Text>
        <Text style={styles.nextPayout}>Next payout: {nextMonday}</Text>
        <View style={styles.balanceBreakdown}>
          <View style={styles.breakdownItem}>
            <Text style={styles.breakdownValue}>₹{(summary?.totalEarned ?? 0).toLocaleString('en-IN')}</Text>
            <Text style={styles.breakdownLabel}>Total Earned</Text>
          </View>
          <View style={styles.breakdownDivider} />
          <View style={styles.breakdownItem}>
            <Text style={styles.breakdownValue}>₹{(summary?.totalPaid ?? 0).toLocaleString('en-IN')}</Text>
            <Text style={styles.breakdownLabel}>Total Paid Out</Text>
          </View>
        </View>
      </View>

      <View style={styles.historyHeader}>
        <Text style={styles.historyTitle}>Payout History</Text>
        <Text style={styles.historyCount}>{summary?.payouts.length ?? 0} payouts</Text>
      </View>

      {summary?.payouts.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>💰</Text>
          <Text style={styles.emptyTitle}>No payouts yet</Text>
          <Text style={styles.emptySub}>Your first payout will arrive after your first delivery</Text>
        </View>
      ) : (
        <FlatList
          data={summary?.payouts ?? []}
          keyExtractor={p => p.id}
          renderItem={({ item }) => <PayoutCard payout={item} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={colors.primary} />}
        />
      )}
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
  bankBtn: { fontSize: 15, color: colors.primary, fontWeight: '700' },
  balanceCard: {
    margin: spacing.md, backgroundColor: colors.primary, borderRadius: radius.lg,
    padding: spacing.lg, alignItems: 'center',
  },
  balanceLabel: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginBottom: 4 },
  balanceAmount: { fontSize: 36, fontWeight: '800', color: colors.white, marginBottom: 4 },
  nextPayout: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginBottom: spacing.md },
  balanceBreakdown: { flexDirection: 'row', width: '100%' },
  breakdownItem: { flex: 1, alignItems: 'center' },
  breakdownValue: { fontSize: 16, fontWeight: '700', color: colors.white },
  breakdownLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  breakdownDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.3)' },
  historyHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingBottom: spacing.xs,
  },
  historyTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  historyCount: { fontSize: 13, color: colors.textMuted },
  list: { padding: spacing.md, paddingBottom: 40 },
  payoutCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  payoutDate: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  payoutFee: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  failReason: { fontSize: 12, color: colors.error, marginTop: 2 },
  payoutAmount: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  statusBadge: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, marginTop: 4 },
  statusText: { fontSize: 12, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyIcon: { fontSize: 52, marginBottom: spacing.md },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 },
  emptySub: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
})
