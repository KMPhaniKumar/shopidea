import React, { useState, useEffect } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, TextInput,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RouteProp } from '@react-navigation/native'
import { colors, radius, spacing } from '../../constants/theme'
import { useAuthStore } from '../../store/authStore'
import { createOrder, CartItem, DeliveryAddress } from '../../services/orderService'
import { useOrderStore } from '../../store/orderStore'
import { PickedLocation } from '../shared/LocationPickerScreen'

type Props = {
  navigation: NativeStackNavigationProp<any>
  route: RouteProp<{ Checkout: { storeId: string; storeName: string; items: CartItem[]; subtotal: number; pickedLocation?: PickedLocation } }, 'Checkout'>
}

const DELIVERY_FEE = 60
const FREE_DELIVERY_THRESHOLD = 500

export default function CheckoutScreen({ navigation, route }: Props) {
  const { storeId, storeName, items, subtotal } = route.params
  const pickedLocation = route.params?.pickedLocation
  const session = useAuthStore(s => s.session)
  const profile = useAuthStore(s => s.profile)
  const prependOrder = useOrderStore(s => s.prependOrder)

  const [address, setAddress] = useState<DeliveryAddress>({
    name: profile?.name ?? '',
    phone: session?.user?.phone?.replace('+91', '') ?? '',
    line1: '', line2: '', area: '', city: '', state: '', pincode: '',
  })
  const [paymentMethod, setPaymentMethod] = useState<'online' | 'cod'>('cod')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [mapPinned, setMapPinned] = useState(false)

  // Apply picked location from map picker
  useEffect(() => {
    if (pickedLocation) {
      setAddress(a => ({
        ...a,
        line1: pickedLocation.line1 || a.line1,
        area: pickedLocation.area || a.area,
        city: pickedLocation.city || a.city,
        state: pickedLocation.state || a.state,
        pincode: pickedLocation.pincode || a.pincode,
      }))
      setMapPinned(true)
      navigation.setParams({ pickedLocation: undefined })
    }
  }, [pickedLocation])

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

      prependOrder({
        id: orderId,
        order_number: orderNumber,
        store_id: storeId,
        buyer_id: session.user.id,
        status: 'pending',
        payment_status: paymentMethod === 'cod' ? 'pending' : 'pending',
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
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Checkout</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">

        {/* Order Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order from {storeName}</Text>
          {items.map((item, i) => (
            <View key={i} style={styles.itemRow}>
              <Text style={styles.itemName} numberOfLines={1}>{item.name}{item.variant ? ` · ${item.variant}` : ''}</Text>
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
          {deliveryFee === 0 && <Text style={styles.freeDeliveryNote}>🎉 Free delivery on orders above ₹{FREE_DELIVERY_THRESHOLD}</Text>}
          <View style={[styles.feeRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalVal}>₹{total}</Text>
          </View>
        </View>

        {/* Delivery Address */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Delivery Address</Text>

          {/* Map picker button */}
          <TouchableOpacity
            style={styles.mapPickerBtn}
            onPress={() => navigation.navigate('LocationPicker', { callbackScreen: 'Checkout' })}
          >
            <Text style={styles.mapPickerIcon}>🗺️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.mapPickerLabel}>
                {mapPinned ? 'Location pinned ✓' : 'Pick delivery location on map'}
              </Text>
              <Text style={styles.mapPickerSub}>
                {mapPinned
                  ? [address.area, address.city].filter(Boolean).join(', ')
                  : 'Auto-fill address from Google Maps'}
              </Text>
            </View>
            <Text style={styles.mapPickerArrow}>›</Text>
          </TouchableOpacity>

          <Field label="Full Name *" value={address.name} onChange={v => setAddress(a => ({ ...a, name: v }))} />
          <Field label="Phone *" value={address.phone} onChange={v => setAddress(a => ({ ...a, phone: v }))} keyboardType="number-pad" maxLength={10} />
          <Field label="Address Line 1 *" value={address.line1} onChange={v => setAddress(a => ({ ...a, line1: v }))} placeholder="Flat/House No, Street" />
          <Field label="Locality / Area" value={address.area ?? ''} onChange={v => setAddress(a => ({ ...a, area: v }))} />
          <View style={styles.twoCol}>
            <View style={{ flex: 1 }}>
              <Field label="City *" value={address.city} onChange={v => setAddress(a => ({ ...a, city: v }))} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Pincode *" value={address.pincode} onChange={v => setAddress(a => ({ ...a, pincode: v }))} keyboardType="number-pad" maxLength={6} />
            </View>
          </View>
          <Field label="State *" value={address.state} onChange={v => setAddress(a => ({ ...a, state: v }))} />
        </View>

        {/* Payment Method */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment</Text>
          <TouchableOpacity
            style={[styles.payOpt, paymentMethod === 'online' && styles.payOptActive]}
            onPress={() => setPaymentMethod('online')}
          >
            <Text style={styles.payOptIcon}>💳</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.payOptLabel}>Pay Online</Text>
              <Text style={styles.payOptSub}>UPI, Card, NetBanking</Text>
            </View>
            <View style={[styles.radio, paymentMethod === 'online' && styles.radioActive]} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.payOpt, paymentMethod === 'cod' && styles.payOptActive]}
            onPress={() => setPaymentMethod('cod')}
          >
            <Text style={styles.payOptIcon}>💵</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.payOptLabel}>Cash on Delivery</Text>
              <Text style={styles.payOptSub}>Pay when your order arrives</Text>
            </View>
            <View style={[styles.radio, paymentMethod === 'cod' && styles.radioActive]} />
          </TouchableOpacity>
        </View>

        {/* Special Instructions */}
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
      </ScrollView>

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
    </View>
  )
}

function Field({ label, value, onChange, placeholder, keyboardType, maxLength }: any) {
  return (
    <View style={{ marginBottom: spacing.sm }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 }}>{label}</Text>
      <TextInput
        style={{
          borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm,
          paddingHorizontal: spacing.sm, height: 44, fontSize: 15, color: colors.textPrimary,
        }}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType ?? 'default'}
        maxLength={maxLength}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingTop: 56, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  back: { fontSize: 16, color: colors.primary, fontWeight: '600' },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  body: { padding: spacing.md, paddingBottom: 120 },
  section: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.textMuted, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  itemName: { flex: 1, fontSize: 14, color: colors.textPrimary, marginRight: spacing.sm },
  itemPrice: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  feeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  feeLabel: { fontSize: 14, color: colors.textSecondary },
  feeVal: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  feeValFree: { fontSize: 14, fontWeight: '700', color: colors.success },
  freeDeliveryNote: { fontSize: 12, color: colors.success, marginTop: 2, marginBottom: 4 },
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
  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: colors.border,
  },
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

  mapPickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.md,
    padding: spacing.sm, marginBottom: spacing.md, backgroundColor: '#FFF8F5',
  },
  mapPickerIcon: { fontSize: 20 },
  mapPickerLabel: { fontSize: 14, fontWeight: '700', color: colors.primary },
  mapPickerSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  mapPickerArrow: { fontSize: 20, color: colors.primary },
})
