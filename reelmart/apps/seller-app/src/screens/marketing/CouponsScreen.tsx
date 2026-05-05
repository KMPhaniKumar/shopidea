import React, { useEffect, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Alert, ScrollView, Switch,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { colors, radius, spacing } from '../../constants/theme'
import { useSellerStore } from '../../store/sellerStore'
import {
  Coupon, getStoreCoupons, createCoupon, toggleCoupon, deleteCoupon,
} from '../../services/couponService'

type Props = { navigation: NativeStackNavigationProp<any> }

function CouponCard({ coupon, onToggle, onDelete }: {
  coupon: Coupon
  onToggle: (active: boolean) => void
  onDelete: () => void
}) {
  const discountLabel = coupon.type === 'percent'
    ? `${coupon.value}% off`
    : `₹${coupon.value} off`

  const expired = coupon.valid_until && new Date(coupon.valid_until) < new Date()

  return (
    <View style={[styles.card, !coupon.is_active && styles.cardInactive]}>
      <View style={styles.cardTop}>
        <View style={styles.codeBox}>
          <Text style={styles.codeText}>{coupon.code}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Switch
            value={!!coupon.is_active && !expired}
            onValueChange={onToggle}
            disabled={!!expired}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.white}
          />
          {expired && <Text style={styles.expiredBadge}>Expired</Text>}
        </View>
      </View>

      <Text style={styles.discountLabel}>{discountLabel}</Text>
      {(coupon.min_order_amount ?? 0) > 0 && (
        <Text style={styles.meta}>Min order: ₹{coupon.min_order_amount}</Text>
      )}
      {coupon.max_discount && (
        <Text style={styles.meta}>Max discount: ₹{coupon.max_discount}</Text>
      )}
      <Text style={styles.meta}>
        Used {coupon.total_uses}{coupon.max_uses ? `/${coupon.max_uses}` : ''} times
      </Text>
      {coupon.valid_until && (
        <Text style={styles.meta}>
          Valid until {new Date(coupon.valid_until).toLocaleDateString('en-IN')}
        </Text>
      )}

      <TouchableOpacity style={styles.deleteBtn} onPress={onDelete}>
        <Text style={styles.deleteBtnText}>Delete</Text>
      </TouchableOpacity>
    </View>
  )
}

function CreateCouponForm({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  const store = useSellerStore(s => s.store)
  const [code, setCode] = useState('')
  const [type, setType] = useState<'percentage' | 'fixed'>('percentage')
  const [value, setValue] = useState('')
  const [minOrder, setMinOrder] = useState('')
  const [maxDiscount, setMaxDiscount] = useState('')
  const [maxUses, setMaxUses] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!store?.id) return
    if (!code.trim()) { Alert.alert('Error', 'Enter a coupon code'); return }
    const numValue = parseFloat(value)
    if (!numValue || numValue <= 0) { Alert.alert('Error', 'Enter a valid discount value'); return }
    if (type === 'percentage' && numValue > 80) { Alert.alert('Error', 'Max discount is 80%'); return }

    setSaving(true)
    const result = await createCoupon(store.id, {
      code,
      discountType: type,
      discountValue: numValue,
      minOrderAmount: minOrder ? parseFloat(minOrder) : undefined,
      maxDiscount: maxDiscount ? parseFloat(maxDiscount) : undefined,
      maxUses: maxUses ? parseInt(maxUses) : undefined,
    })
    setSaving(false)

    if (result.success) {
      onSave()
    } else {
      Alert.alert('Error', result.error ?? 'Could not create coupon')
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
      <Text style={styles.formTitle}>Create Coupon</Text>

      <Text style={styles.fieldLabel}>Coupon Code *</Text>
      <TextInput
        style={styles.fieldInput}
        value={code}
        onChangeText={t => setCode(t.toUpperCase())}
        placeholder="e.g. SAVE20"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="characters"
        maxLength={16}
      />

      <Text style={styles.fieldLabel}>Discount Type</Text>
      <View style={styles.typeRow}>
        {(['percentage', 'fixed'] as const).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.typeChip, type === t && styles.typeChipActive]}
            onPress={() => setType(t)}
          >
            <Text style={[styles.typeChipText, type === t && styles.typeChipTextActive]}>
              {t === 'percentage' ? '% Percentage' : '₹ Fixed Amount'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.fieldLabel}>{type === 'percentage' ? 'Discount %' : 'Discount ₹'} *</Text>
      <TextInput
        style={styles.fieldInput}
        value={value}
        onChangeText={setValue}
        keyboardType="decimal-pad"
        placeholder={type === 'percentage' ? 'e.g. 20' : 'e.g. 50'}
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.fieldLabel}>Min Order Amount (₹)</Text>
      <TextInput
        style={styles.fieldInput}
        value={minOrder}
        onChangeText={setMinOrder}
        keyboardType="decimal-pad"
        placeholder="Optional — e.g. 300"
        placeholderTextColor={colors.textMuted}
      />

      {type === 'percentage' && (
        <>
          <Text style={styles.fieldLabel}>Max Discount Cap (₹)</Text>
          <TextInput
            style={styles.fieldInput}
            value={maxDiscount}
            onChangeText={setMaxDiscount}
            keyboardType="decimal-pad"
            placeholder="Optional — e.g. 100"
            placeholderTextColor={colors.textMuted}
          />
        </>
      )}

      <Text style={styles.fieldLabel}>Max Total Uses</Text>
      <TextInput
        style={styles.fieldInput}
        value={maxUses}
        onChangeText={setMaxUses}
        keyboardType="number-pad"
        placeholder="Optional — leave blank for unlimited"
        placeholderTextColor={colors.textMuted}
      />

      <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
        <Text style={styles.saveBtnText}>{saving ? 'Creating...' : 'Create Coupon'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
        <Text style={styles.cancelBtnText}>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

export default function CouponsScreen({ navigation }: Props) {
  const store = useSellerStore(s => s.store)
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  async function load() {
    if (!store?.id) return
    const data = await getStoreCoupons(store.id)
    setCoupons(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [store?.id])

  async function handleToggle(coupon: Coupon, active: boolean) {
    await toggleCoupon(coupon.id, active)
    setCoupons(prev => prev.map(c => c.id === coupon.id ? { ...c, is_active: active } : c))
  }

  async function handleDelete(couponId: string) {
    Alert.alert('Delete coupon?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await deleteCoupon(couponId)
          setCoupons(prev => prev.filter(c => c.id !== couponId))
        },
      },
    ])
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => creating ? setCreating(false) : navigation.goBack()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Coupons</Text>
        {!creating && (
          <TouchableOpacity onPress={() => setCreating(true)}>
            <Text style={styles.addBtn}>+ New</Text>
          </TouchableOpacity>
        )}
      </View>

      {creating ? (
        <CreateCouponForm onSave={() => { setCreating(false); load() }} onCancel={() => setCreating(false)} />
      ) : loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
      ) : coupons.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🎟️</Text>
          <Text style={styles.emptyTitle}>No coupons yet</Text>
          <Text style={styles.emptySub}>Create a coupon to offer discounts to your buyers</Text>
          <TouchableOpacity style={styles.createBtn} onPress={() => setCreating(true)}>
            <Text style={styles.createBtnText}>Create First Coupon</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={coupons}
          keyExtractor={c => c.id}
          renderItem={({ item }) => (
            <CouponCard
              coupon={item}
              onToggle={active => handleToggle(item, active)}
              onDelete={() => handleDelete(item.id)}
            />
          )}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
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
  addBtn: { fontSize: 15, color: colors.primary, fontWeight: '700' },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, marginBottom: spacing.sm,
  },
  cardInactive: { opacity: 0.6 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs },
  codeBox: { backgroundColor: '#FFF0E9', borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 4 },
  codeText: { fontSize: 16, fontWeight: '800', color: colors.primary, letterSpacing: 1 },
  expiredBadge: { fontSize: 11, color: colors.error, fontWeight: '700' },
  discountLabel: { fontSize: 18, fontWeight: '800', color: colors.textPrimary, marginBottom: 4 },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  deleteBtn: { alignSelf: 'flex-start', marginTop: spacing.sm },
  deleteBtnText: { fontSize: 13, color: colors.error, fontWeight: '600' },
  form: { padding: spacing.lg, paddingBottom: 40 },
  formTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.lg },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 },
  fieldInput: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, height: 46, fontSize: 15, color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  typeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  typeChip: { flex: 1, paddingVertical: 10, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center' },
  typeChipActive: { borderColor: colors.primary, backgroundColor: '#FFF0E9' },
  typeChipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  typeChipTextActive: { color: colors.primary },
  saveBtn: { backgroundColor: colors.primary, borderRadius: radius.pill, height: 52, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm, marginTop: spacing.md },
  saveBtnText: { color: colors.white, fontWeight: '700', fontSize: 16 },
  cancelBtn: { height: 44, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { fontSize: 15, color: colors.textSecondary },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyIcon: { fontSize: 52, marginBottom: spacing.md },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 },
  emptySub: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.xl },
  createBtn: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: spacing.xl, paddingVertical: 14 },
  createBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
})
