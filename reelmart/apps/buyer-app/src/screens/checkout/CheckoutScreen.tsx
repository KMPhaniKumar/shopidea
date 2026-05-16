import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RouteProp } from '@react-navigation/native'
import { colors, radius, spacing } from '../../constants/theme'
import { useAuthStore } from '../../store/authStore'
import { createOrder, CartItem, DeliveryAddress } from '../../services/orderService'
import { useOrderStore } from '../../store/orderStore'
import { getSavedAddresses, SavedAddress } from '../../lib/savedAddresses'
import LocationPromptModal from '../../components/LocationPromptModal'
import { supabase } from '../../lib/supabase'

const ADDR_KEY = '@reelmart_default_address_id'
const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '')

type Props = {
  navigation: NativeStackNavigationProp<any>
  route: RouteProp<{
    Checkout: {
      storeId: string
      storeName: string
      items: CartItem[]
      subtotal: number
    }
  }, 'Checkout'>
}

const DELIVERY_FEE = 60
const FREE_DELIVERY_THRESHOLD = 500

function stripPhone(raw?: string | null): string {
  if (!raw) return ''
  return raw.replace(/^\+?91/, '').slice(-10)
}

export default function CheckoutScreen({ navigation, route }: Props) {
  const { storeId, storeName, items, subtotal } = route.params
  const session = useAuthStore(s => s.session)
  const profile = useAuthStore(s => s.profile)
  const prependOrder = useOrderStore(s => s.prependOrder)

  const scrollRef = useRef<FlatList>(null)

  const [address, setAddress] = useState<DeliveryAddress>({
    name: profile?.name ?? '',
    phone: stripPhone(session?.user?.phone),
    line1: '', line2: '', area: '', city: '', state: '', pincode: '',
  })
  const [selectedSaved, setSelectedSaved] = useState<SavedAddress | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<'online' | 'cod'>('cod')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [addrModalVisible, setAddrModalVisible] = useState(false)
  const [storePincode, setStorePincode] = useState<string | null>(null)
  const [deliveryEstimate, setDeliveryEstimate] = useState<{
    days: number; deliverable: boolean; fetchedFor: string
  } | null>(null)

  async function loadDefaultAddress() {
    const [addrs, savedId] = await Promise.all([
      getSavedAddresses(),
      AsyncStorage.getItem(ADDR_KEY),
    ])
    const match = (savedId ? addrs.find(a => a.id === savedId) : null) ?? addrs[0] ?? null
    if (match) {
      setSelectedSaved(match)
      setAddress(a => ({
        ...a,
        line1: match.line1,
        area: match.area,
        city: match.city,
        state: match.state,
        pincode: match.pincode,
        name: match.name || a.name,
        phone: match.phone || a.phone,
      }))
    }
  }

  useEffect(() => { loadDefaultAddress() }, [])

  // Pull seller's pickup pincode for the delivery-date estimate.
  useEffect(() => {
    supabase.from('stores').select('pincode').eq('id', storeId).maybeSingle()
      .then(({ data }) => { if (data?.pincode) setStorePincode(data.pincode) })
  }, [storeId])

  // Fetch ETA when both pincodes are known. Cached by pickup-delivery key.
  useEffect(() => {
    if (!storePincode || !/^\d{6}$/.test(address.pincode)) return
    const key = `${storePincode}-${address.pincode}`
    if (deliveryEstimate?.fetchedFor === key) return
    fetch(`${API_URL}/api/delivery/rates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pickupPincode: storePincode,
        deliveryPincode: address.pincode,
        weight: 0.5,
        paymentType: paymentMethod,
        orderAmount: subtotal,
      }),
    })
      .then(r => r.json())
      .then(json => {
        if (!json?.success) return
        setDeliveryEstimate({
          days: json.data.estimatedDays ?? 3,
          deliverable: !!json.data.deliverable,
          fetchedFor: key,
        })
      })
      .catch(() => {})
  }, [storePincode, address.pincode, paymentMethod, subtotal])

  const deliveryFee = subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE
  const total = subtotal + deliveryFee

function validateAddress(): string | null {
    if (!address.name.trim()) return 'Enter your name'
    if (!/^[6-9]\d{9}$/.test(address.phone)) return 'Enter a valid 10-digit phone number'
    if (!address.line1.trim()) return 'Enter address line 1'
    if (!address.city.trim()) return 'Enter city'
    if (!address.state.trim()) return 'Enter state'
    if (!/^\d{6}$/.test(address.pincode)) return 'Enter a valid 6-digit pincode'
    return null
  }

  async function handlePlaceOrder() {
    const err = validateAddress()
    if (err) { Alert.alert('Incomplete address', err); return }
    if (!session?.user) return

    setLoading(true)
    try {
      const { orderId, orderNumber } = await createOrder({
        buyerId: session.user.id,
        storeId,
        items,
        subtotal,
        deliveryFee,
        discountAmount: 0,
        totalAmount: total,
        deliveryAddress: address,
        paymentMethod,
        notes: notes.trim() || undefined,
      })

      // Fire-and-forget: backend sends WhatsApp + SMS to buyer.
      // Idempotent server-side, so a slow/aborted call doesn't hurt.
      fetch(`${API_URL}/api/notifications/order-placed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      }).catch(() => {})

      prependOrder({
        id: orderId,
        order_number: orderNumber,
        store_id: storeId,
        buyer_id: session.user.id,
        status: 'pending',
        payment_status: 'pending',
        payment_method: paymentMethod,
        items: items as any,
        subtotal,
        delivery_fee: deliveryFee,
        discount_amount: 0,
        coins_redeemed: 0,
        coins_discount: 0,
        total_amount: total,
        delivery_address: address as any,
        razorpay_order_id: null,
        razorpay_payment_id: null,
        // shiprocket_order_id column still in schema but unused since
        // courier was switched to NimbusPost. Keeping the field as null
        // here for type parity with the generated DB row.
        shiprocket_order_id: null,
        tracking_url: null,
        awb_code: null,
        rejection_reason: null,
        accepted_at: null,
        shipped_at: null,
        delivered_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        stores: { store_name: storeName, logo_url: null, store_slug: '' },
      } as any)


      if (paymentMethod === 'online') {
        navigation.replace('Payment', { orderId, orderNumber, amount: total })
      } else {
        navigation.replace('OrderTracking', { orderId })
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to place order.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <LocationPromptModal
        visible={addrModalVisible}
        onClose={() => { setAddrModalVisible(false); loadDefaultAddress() }}
        onCitySet={() => {}}
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Checkout</Text>
      </View>

      <FlatList
        ref={scrollRef}
        data={[]}
        keyExtractor={() => 'form'}
        renderItem={null}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.body}
        ListHeaderComponent={<>
        {/* ── Order Summary ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order from {storeName}</Text>
          {items.map((item, i) => (
            <View key={i} style={styles.itemRow}>
              <Text style={styles.itemName} numberOfLines={1}>
                {item.name}{item.variant ? ` · ${item.variant}` : ''}
              </Text>
              <Text style={styles.itemPrice}>₹{item.price * item.qty} ×{item.qty}</Text>
            </View>
          ))}
          <View style={styles.divider} />
          <View style={styles.feeRow}>
            <Text style={styles.feeLabel}>Subtotal</Text>
            <Text style={styles.feeVal}>₹{subtotal}</Text>
          </View>
          <View style={styles.feeRow}>
            <Text style={styles.feeLabel}>Delivery</Text>
            <Text style={deliveryFee === 0 ? styles.feeValFree : styles.feeVal}>
              {deliveryFee === 0 ? 'FREE' : `₹${deliveryFee}`}
            </Text>
          </View>
          {deliveryFee === 0 && (
            <Text style={styles.freeDeliveryNote}>🎉 Free delivery on orders above ₹{FREE_DELIVERY_THRESHOLD}</Text>
          )}
          <View style={[styles.feeRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalVal}>₹{total}</Text>
          </View>
          {deliveryEstimate && deliveryEstimate.deliverable && (
            <View style={styles.etaBox}>
              <Text style={styles.etaText}>
                📦 Arriving by {formatDeliveryDate(deliveryEstimate.days)}
                <Text style={styles.etaSub}>  ·  {deliveryEstimate.days}-day delivery</Text>
              </Text>
            </View>
          )}
          {deliveryEstimate && !deliveryEstimate.deliverable && (
            <View style={styles.etaBox}>
              <Text style={[styles.etaText, { color: '#E23744' }]}>
                Sorry, we don't deliver to this pincode yet.
              </Text>
            </View>
          )}
        </View>

        {/* ── Delivery Address ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Delivery Address</Text>

          {selectedSaved ? (
            <View style={styles.savedAddrCard}>
              <View style={styles.savedAddrTop}>
                <View style={styles.savedAddrBadge}>
                  <Text style={styles.savedAddrBadgeText}>{selectedSaved.label || 'Home'}</Text>
                </View>
                <TouchableOpacity onPress={() => setAddrModalVisible(true)}>
                  <Text style={styles.changeAddrText}>Change →</Text>
                </TouchableOpacity>
              </View>
              {selectedSaved.name ? <Text style={styles.savedAddrName}>{selectedSaved.name}{selectedSaved.phone ? ` · ${selectedSaved.phone}` : ''}</Text> : null}
              {selectedSaved.line1 ? <Text style={styles.savedAddrLine}>{selectedSaved.line1}</Text> : null}
              <Text style={styles.savedAddrLine}>
                {[selectedSaved.area, selectedSaved.city].filter(Boolean).join(', ')}
              </Text>
              {(selectedSaved.state || selectedSaved.pincode) ? (
                <Text style={styles.savedAddrLine}>
                  {[selectedSaved.state, selectedSaved.pincode].filter(Boolean).join(' – ')}
                </Text>
              ) : null}
            </View>
          ) : (
            <TouchableOpacity style={styles.selectAddrBtn} onPress={() => setAddrModalVisible(true)} activeOpacity={0.8}>
              <Text style={styles.selectAddrIcon}>📍</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.selectAddrTitle}>Select Delivery Address</Text>
                <Text style={styles.selectAddrSub}>Choose from saved or add a new address</Text>
              </View>
              <Text style={styles.selectAddrArrow}>→</Text>
            </TouchableOpacity>
          )}

          {/* Name & Phone */}
          <Field
            label="Full Name *"
            value={address.name}
            onChange={(v: string) => setAddress(a => ({ ...a, name: v }))}
          />
          <Field
            label="Phone *"
            value={address.phone}
            onChange={(v: string) => setAddress(a => ({ ...a, phone: v.replace(/\D/g, '').slice(0, 10) }))}
            keyboardType="number-pad"
            maxLength={10}
            placeholder="10-digit mobile number"
            prefix="+91"
          />
        </View>

        {/* ── Payment ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment</Text>
          {(['online', 'cod'] as const).map(method => (
            <TouchableOpacity
              key={method}
              style={[styles.payOpt, paymentMethod === method && styles.payOptActive]}
              onPress={() => setPaymentMethod(method)}
            >
              <Text style={styles.payOptIcon}>{method === 'online' ? '💳' : '💵'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.payOptLabel}>{method === 'online' ? 'Pay Online' : 'Cash on Delivery'}</Text>
                <Text style={styles.payOptSub}>{method === 'online' ? 'UPI, Card, NetBanking' : 'Pay when your order arrives'}</Text>
              </View>
              <View style={[styles.radio, paymentMethod === method && styles.radioActive]} />
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Special Instructions ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Special Instructions (optional)</Text>
          <TextInput
            style={styles.notesInput}
            placeholder="Any special requests for the seller..."
            placeholderTextColor={colors.textMuted}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={2}
            maxLength={200}
          />
        </View>
        </>}
      />

      {/* Footer */}
      <View style={styles.footer}>
        <View>
          <Text style={styles.footerTotal}>₹{total}</Text>
          <Text style={styles.footerLabel}>{items.length} item{items.length !== 1 ? 's' : ''}</Text>
        </View>
        <TouchableOpacity
          style={[styles.placeBtn, loading && styles.placeBtnDisabled]}
          onPress={handlePlaceOrder}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color={colors.white} />
            : <Text style={styles.placeBtnText}>
                {paymentMethod === 'cod' ? 'Place Order' : 'Proceed to Pay'} →
              </Text>
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

function formatDeliveryDate(daysFromNow: number): string {
  const d = new Date()
  d.setDate(d.getDate() + Math.max(1, Math.round(daysFromNow)))
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

function Field({ label, value, onChange, placeholder, keyboardType, maxLength, prefix }: any) {
  return (
    <View style={{ marginBottom: spacing.sm }}>
      <Text style={fieldStyles.label}>{label}</Text>
      <View style={[fieldStyles.inputRow, prefix && fieldStyles.inputRowWithPrefix]}>
        {prefix && <Text style={fieldStyles.prefix}>{prefix}</Text>}
        <TextInput
          style={[fieldStyles.input, prefix && { flex: 1, borderLeftWidth: 0, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }]}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          keyboardType={keyboardType ?? 'default'}
          maxLength={maxLength}
        />
      </View>
    </View>
  )
}

const fieldStyles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  inputRowWithPrefix: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, overflow: 'hidden',
  },
  prefix: {
    paddingHorizontal: 12, paddingVertical: 11,
    backgroundColor: '#F5F5F7', fontSize: 14,
    color: colors.textSecondary, fontWeight: '600',
    borderRightWidth: 1, borderRightColor: colors.border,
  },
  input: {
    flex: 1,
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm,
    paddingHorizontal: spacing.sm, height: 44, fontSize: 15, color: colors.textPrimary,
  },
})

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F7' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingTop: 56, paddingBottom: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  back: { fontSize: 16, color: colors.primary, fontWeight: '600' },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  body: { padding: spacing.md, paddingBottom: 120 },

  section: {
    backgroundColor: colors.white, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: colors.textMuted,
    marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  savedAddrCard: {
    backgroundColor: '#F9FAFB', borderRadius: 12,
    padding: 12, marginBottom: 14,
    borderWidth: 1.5, borderColor: colors.primary,
  },
  savedAddrTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  savedAddrBadge: {
    backgroundColor: '#FFF0E9', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  savedAddrBadgeText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  changeAddrText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  savedAddrName: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  savedAddrLine: { fontSize: 13, color: '#666666', lineHeight: 20 },

  selectAddrBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFF5F0', borderRadius: 14,
    padding: 14, marginBottom: 14,
    borderWidth: 1.5, borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  selectAddrIcon: { fontSize: 22 },
  selectAddrTitle: { fontSize: 14, fontWeight: '700', color: colors.primary },
  selectAddrSub: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  selectAddrArrow: { fontSize: 16, color: colors.primary, fontWeight: '700' },

  itemRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  itemName: { flex: 1, fontSize: 14, color: colors.textPrimary, marginRight: spacing.sm },
  itemPrice: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  feeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  feeLabel: { fontSize: 14, color: colors.textSecondary },
  feeVal: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  feeValFree: { fontSize: 14, fontWeight: '700', color: colors.success },
  freeDeliveryNote: { fontSize: 12, color: colors.success, marginTop: 2, marginBottom: 4 },

  etaBox: {
    marginTop: 10,
    backgroundColor: '#FFF4ED',
    borderColor: '#FFE3D2',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  etaText: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  etaSub: { fontWeight: '500', color: colors.textSecondary },
  totalRow: { marginTop: spacing.xs },
  totalLabel: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  totalVal: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },

  twoCol: { flexDirection: 'row', gap: spacing.sm },

  payOpt: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.md, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.border,
    marginBottom: spacing.sm, backgroundColor: colors.white,
  },
  payOptActive: { borderColor: colors.primary, backgroundColor: '#FFF8F5' },
  payOptIcon: { fontSize: 24 },
  payOptLabel: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  payOptSub: { fontSize: 12, color: colors.textMuted },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border },
  radioActive: { borderColor: colors.primary, backgroundColor: colors.primary },

  notesInput: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.sm, fontSize: 14, color: colors.textPrimary,
    textAlignVertical: 'top', height: 72,
  },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.lg, backgroundColor: colors.white,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  footerTotal: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
  footerLabel: { fontSize: 12, color: colors.textMuted },
  placeBtn: {
    backgroundColor: colors.primary, borderRadius: radius.pill,
    paddingHorizontal: spacing.xl, height: 52,
    alignItems: 'center', justifyContent: 'center',
  },
  placeBtnDisabled: { opacity: 0.6 },
  placeBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
})
