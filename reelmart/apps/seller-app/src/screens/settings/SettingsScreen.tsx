import React, { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Switch, Alert, ActivityIndicator, Linking,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { colors, radius, spacing } from '../../constants/theme'
import { useAuthStore } from '../../store/authStore'
import { useSellerStore } from '../../store/sellerStore'
import { getSellerPreferences, saveSellerPreferences } from '../../services/payoutService'

type Props = { navigation: NativeStackNavigationProp<any> }

interface Prefs {
  new_order_push: boolean
  new_order_whatsapp: boolean
  order_update_push: boolean
  order_update_whatsapp: boolean
  promotions_push: boolean
  auto_accept_orders: boolean
}

const DEFAULT_PREFS: Prefs = {
  new_order_push: true,
  new_order_whatsapp: true,
  order_update_push: true,
  order_update_whatsapp: true,
  promotions_push: false,
  auto_accept_orders: false,
}

function SettingRow({ label, sub, value, onToggle }: { label: string; sub?: string; value: boolean; onToggle: (v: boolean) => void }) {
  return (
    <View style={styles.settingRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.settingLabel}>{label}</Text>
        {sub && <Text style={styles.settingSub}>{sub}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: colors.border, true: '#FFD5BE' }}
        thumbColor={value ? colors.primary : colors.textMuted}
      />
    </View>
  )
}

function NavRow({ label, icon, onPress, destructive }: { label: string; icon: string; onPress: () => void; destructive?: boolean }) {
  return (
    <TouchableOpacity style={styles.navRow} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.navIcon}>{icon}</Text>
      <Text style={[styles.navLabel, destructive && styles.navLabelDestructive]}>{label}</Text>
      <Text style={styles.navChevron}>›</Text>
    </TouchableOpacity>
  )
}

export default function SettingsScreen({ navigation }: Props) {
  const { profile, signOut } = useAuthStore()
  const store = useSellerStore(s => s.store)
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!store) return
    getSellerPreferences(store.seller_id).then(p => {
      if (p) setPrefs({ ...DEFAULT_PREFS, ...p })
      setLoading(false)
    })
  }, [store?.id])

  async function togglePref(key: keyof Prefs, value: boolean) {
    const updated = { ...prefs, [key]: value }
    setPrefs(updated)
    setSaving(true)
    try {
      await saveSellerPreferences(store!.seller_id, { [key]: value })
    } catch {
      setPrefs(prefs) // revert on error
    } finally {
      setSaving(false)
    }
  }

  function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ])
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
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        {saving ? <ActivityIndicator size="small" color={colors.primary} /> : <View style={{ width: 32 }} />}
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

        {/* Profile card */}
        <TouchableOpacity style={styles.profileCard} onPress={() => navigation.navigate('EditStore')} activeOpacity={0.85}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileAvatarText}>{(profile?.name ?? 'S')[0].toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{profile?.name ?? 'Seller'}</Text>
            <Text style={styles.profileStore}>{store?.store_name}</Text>
          </View>
          <Text style={styles.navChevron}>›</Text>
        </TouchableOpacity>

        {/* Store settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>STORE SETTINGS</Text>
          <SettingRow
            label="Auto-accept Orders"
            sub="Orders confirmed automatically without review"
            value={prefs.auto_accept_orders}
            onToggle={v => togglePref('auto_accept_orders', v)}
          />
        </View>

        {/* Notification preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>NOTIFICATIONS</Text>
          <SettingRow
            label="New Order — WhatsApp"
            sub="Get WhatsApp message for every new order"
            value={prefs.new_order_whatsapp}
            onToggle={v => togglePref('new_order_whatsapp', v)}
          />
          <SettingRow
            label="New Order — Push"
            value={prefs.new_order_push}
            onToggle={v => togglePref('new_order_push', v)}
          />
          <SettingRow
            label="Order Updates — WhatsApp"
            value={prefs.order_update_whatsapp}
            onToggle={v => togglePref('order_update_whatsapp', v)}
          />
          <SettingRow
            label="Order Updates — Push"
            value={prefs.order_update_push}
            onToggle={v => togglePref('order_update_push', v)}
          />
          <SettingRow
            label="Promotions — Push"
            sub="Marketing and promotional notifications"
            value={prefs.promotions_push}
            onToggle={v => togglePref('promotions_push', v)}
          />
        </View>

        {/* Account actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ACCOUNT</Text>
          <NavRow icon="🏪" label="Edit Store Profile" onPress={() => navigation.navigate('EditStore')} />
          <NavRow icon="🏦" label="Bank Account & Payouts" onPress={() => navigation.navigate('PayoutHistory')} />
          <NavRow icon="⭐" label="Reviews" onPress={() => navigation.navigate('StoreReviews')} />
          <NavRow icon="📊" label="Analytics" onPress={() => navigation.navigate('Analytics')} />
          <NavRow icon="🎟️" label="Coupons" onPress={() => navigation.navigate('Coupons')} />
          <NavRow icon="📣" label="Broadcast Message" onPress={() => navigation.navigate('Broadcast')} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SUPPORT</Text>
          <NavRow icon="📋" label="Privacy Policy" onPress={() => Linking.openURL('https://reelmart.in/privacy')} />
          <NavRow icon="📄" label="Terms of Service" onPress={() => Linking.openURL('https://reelmart.in/terms')} />
          <NavRow icon="💬" label="Contact Support" onPress={() => Linking.openURL('https://wa.me/919999999999?text=Hi+ReelMart+Support')} />
        </View>

        <View style={styles.section}>
          <NavRow icon="🚪" label="Sign Out" onPress={handleSignOut} />
        </View>

        <Text style={styles.version}>ReelMart Seller v1.0</Text>
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
    padding: spacing.md, marginBottom: spacing.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  profileAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  profileAvatarText: { color: colors.white, fontWeight: '800', fontSize: 20 },
  profileName: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  profileStore: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  section: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.md, overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.5,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: '#FAFAFA',
  },
  settingRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  settingLabel: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  settingSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  navRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  navIcon: { fontSize: 18, width: 26 },
  navLabel: { flex: 1, fontSize: 15, color: colors.textPrimary },
  navLabelDestructive: { color: colors.error },
  navChevron: { fontSize: 20, color: colors.textMuted },
  version: { textAlign: 'center', fontSize: 12, color: colors.textMuted, marginTop: spacing.md },
})
