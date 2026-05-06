import React, { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Share, Alert, ActivityIndicator,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { colors, radius, spacing } from '../../constants/theme'
import { useAuthStore } from '../../store/authStore'
import { useCartStore } from '../../store/cartStore'
import { getCoinBalance, buildReferralLink } from '../../services/profileService'
import { useOrderStore } from '../../store/orderStore'

type Props = { navigation: NativeStackNavigationProp<any> }

function NavRow({ icon, label, value, onPress }: { icon: string; label: string; value?: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.navRow} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.navIcon}>{icon}</Text>
      <Text style={styles.navLabel}>{label}</Text>
      {value && <Text style={styles.navValue}>{value}</Text>}
      <Text style={styles.navChevron}>›</Text>
    </TouchableOpacity>
  )
}

export default function ProfileScreen({ navigation }: Props) {
  const { profile, session, signOut } = useAuthStore()
  const { orders, fetchOrders } = useOrderStore()
  const { itemCount, fetchCart } = useCartStore()
  const [coins, setCoins] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session?.user) { setLoading(false); return }
    Promise.all([
      getCoinBalance(session.user.id).catch(() => 0),
      fetchOrders(session.user.id).catch(() => {}),
      fetchCart(session.user.id).catch(() => {}),
    ]).then(([c]) => {
      setCoins(c as number)
    }).finally(() => {
      setLoading(false)
    })
  }, [session?.user?.id])

  function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ])
  }

  async function handleShareReferral() {
    const code = (profile as any)?.referral_code
    if (!code) return
    const link = buildReferralLink(code)
    await Share.share({
      message: `Join me on ReelMart — discover amazing local sellers! Use my link to get ₹100 in loyalty coins:\n${link}`,
      url: link,
    })
  }

  const activeOrders = orders.filter(o => !['delivered', 'rejected', 'cancelled'].includes(o.status))
  const phone = session?.user?.phone?.replace('+91', '') ?? ''

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
        <Text style={styles.title}>My Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

        {/* Profile card */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(profile?.name ?? 'B')[0].toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{profile?.name ?? 'Buyer'}</Text>
            <Text style={styles.profilePhone}>+91 {phone}</Text>
          </View>
        </View>

        {/* Loyalty coins */}
        <TouchableOpacity style={styles.coinsCard} onPress={() => navigation.navigate('CoinHistory')} activeOpacity={0.85}>
          <View>
            <Text style={styles.coinsLabel}>Loyalty Coins</Text>
            <Text style={styles.coinsBalance}>🪙 {coins} coins</Text>
            <Text style={styles.coinsValue}>≈ ₹{Math.floor(coins / 10)} off your next order</Text>
          </View>
          <Text style={styles.coinsChevron}>›</Text>
        </TouchableOpacity>

        {/* Referral */}
        {(profile as any)?.referral_code && (
          <TouchableOpacity style={styles.referralCard} onPress={handleShareReferral} activeOpacity={0.85}>
            <View style={{ flex: 1 }}>
              <Text style={styles.referralTitle}>🎁 Refer & Earn</Text>
              <Text style={styles.referralSub}>Share your code and earn ₹100 in coins when friends join</Text>
              <Text style={styles.referralCode}>{(profile as any).referral_code}</Text>
            </View>
            <Text style={{ fontSize: 24 }}>→</Text>
          </TouchableOpacity>
        )}

        {/* Quick stats */}
        <View style={styles.statsRow}>
          <TouchableOpacity style={styles.statCard} onPress={() => navigation.navigate('Orders')}>
            <Text style={styles.statNum}>{orders.length}</Text>
            <Text style={styles.statLabel}>Orders</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.statCard} onPress={() => navigation.navigate('Orders')}>
            <Text style={styles.statNum}>{activeOrders.length}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.statCard} onPress={() => navigation.navigate('Cart')}>
            <Text style={styles.statNum}>{itemCount}</Text>
            <Text style={styles.statLabel}>In Cart</Text>
          </TouchableOpacity>
        </View>

        {/* My stuff */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MY ORDERS</Text>
          <NavRow icon="📦" label="Order History" value={`${orders.length} orders`} onPress={() => navigation.navigate('Orders')} />
          {activeOrders.length > 0 && (
            <NavRow icon="🚚" label="Track Active Orders" value={`${activeOrders.length} active`} onPress={() => navigation.navigate('Orders')} />
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SAVED</Text>
          <NavRow icon="📍" label="Saved Addresses" onPress={() => navigation.navigate('Addresses')} />
          <NavRow icon="❤️" label="Wishlist" onPress={() => navigation.navigate('Wishlist')} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ACCOUNT</Text>
          <NavRow icon="🚪" label="Sign Out" onPress={handleSignOut} />
        </View>
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
  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  avatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: colors.white, fontWeight: '800', fontSize: 24 },
  profileName: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  profilePhone: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  coinsCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FFF8E7', borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: '#FCD34D',
  },
  coinsLabel: { fontSize: 12, color: '#92400E', fontWeight: '600', marginBottom: 2 },
  coinsBalance: { fontSize: 22, fontWeight: '800', color: '#92400E' },
  coinsValue: { fontSize: 12, color: '#B45309', marginTop: 2 },
  coinsChevron: { fontSize: 24, color: '#B45309' },
  referralCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: '#F0FFF4', borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: '#86EFAC',
  },
  referralTitle: { fontSize: 15, fontWeight: '700', color: '#166534', marginBottom: 2 },
  referralSub: { fontSize: 12, color: '#166534', opacity: 0.8, marginBottom: 4 },
  referralCode: { fontSize: 18, fontWeight: '800', color: '#166534', letterSpacing: 1 },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  statCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  statNum: { fontSize: 24, fontWeight: '800', color: colors.textPrimary },
  statLabel: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  section: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md, overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.5,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: '#FAFAFA',
  },
  navRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  navIcon: { fontSize: 18, width: 26 },
  navLabel: { flex: 1, fontSize: 15, color: colors.textPrimary },
  navValue: { fontSize: 13, color: colors.textMuted, marginRight: 4 },
  navChevron: { fontSize: 20, color: colors.textMuted },
})
