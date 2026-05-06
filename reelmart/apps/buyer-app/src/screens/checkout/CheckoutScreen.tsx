import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RouteProp } from '@react-navigation/native'
import { colors, radius, spacing } from '../../constants/theme'
import { useAuthStore } from '../../store/authStore'
import { createOrder, CartItem, DeliveryAddress } from '../../services/orderService'
import { useOrderStore } from '../../store/orderStore'
import { PickedLocation } from '../shared/LocationPickerScreen'
import { detectCurrentAddress } from '../../lib/geocode'
import { saveAddress } from '../../lib/savedAddresses'

type Props = {
  navigation: NativeStackNavigationProp<any>
  route: RouteProp<{
    Checkout: {
      storeId: string
      storeName: string
      items: CartItem[]
      subtotal: number
      pickedLocation?: PickedLocation
    }
  }, 'Checkout'>
}

const DELIVERY_FEE = 60
const FREE_DELIVERY_THRESHOLD = 500
const MAPS_KEY = 'AIzaSyDtu00tuOZpIzPRASPFScWJRu1GkpaaSIU'

function stripPhone(raw?: string | null): string {
  if (!raw) return ''
  // handles +919876543210 or 919876543210 or 9876543210
  return raw.replace(/^\+?91/, '').slice(-10)
}

export default function CheckoutScreen({ navigation, route }: Props) {
  const { storeId, storeName, items, subtotal } = route.params
  const pickedLocation = route.params?.pickedLocation
  const session = useAuthStore(s => s.session)
  const profile = useAuthStore(s => s.profile)
  const prependOrder = useOrderStore(s => s.prependOrder)

  const scrollRef = useRef<FlatList>(null)

  const [address, setAddress] = useState<DeliveryAddress>({
    name: profile?.name ?? '',
    phone: stripPhone(session?.user?.phone),
    line1: '', line2: '', area: '', city: '', state: '', pincode: '',
  })
  const [paymentMethod, setPaymentMethod] = useState<'online' | 'cod'>('cod')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [locLoading, setLocLoading] = useState(false)
  const [mapPinned, setMapPinned] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [searchFocused, setSearchFocused] = useState(false)

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
      setShowManual(true)
      navigation.setParams({ pickedLocation: undefined })
    }
  }, [pickedLocation])

  const deliveryFee = subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE
  const total = subtotal + deliveryFee

  async function handleDetectLocation() {
    setLocLoading(true)
    try {
      const geo = await detectCurrentAddress()
      setAddress(a => ({
        ...a,
        line1: geo.line1 || a.line1,
        area: geo.area || a.area,
        city: geo.city || a.city,
        state: geo.state || a.state,
        pincode: geo.pincode || a.pincode,
      }))
      setMapPinned(true)
      setShowManual(true)
    } catch (e: any) {
      Alert.alert('Location Error', e.message || 'Could not detect location')
    } finally {
      setLocLoading(false)
    }
  }

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

      // persist address for future orders
      await saveAddress({
        label: address.area || address.line1 || 'Address',
        line1: address.line1,
        area: address.area ?? '',
        city: address.city,
        state: address.state,
        pincode: address.pincode,
        name: address.name,
        phone: address.phone,
      })

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
        </View>

        {/* ── Delivery Address ── */}
        <View style={[styles.section, { zIndex: 10 }]}>
          <Text style={styles.sectionTitle}>Delivery Address</Text>

          {/* Use current location */}
          <TouchableOpacity
            style={styles.detectBtn}
            onPress={handleDetectLocation}
            disabled={locLoading}
            activeOpacity={0.8}
          >
            {locLoading ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <>
                <Text style={styles.detectBtnIcon}>📍</Text>
                <View>
                  <Text style={styles.detectBtnTitle}>Use Current Location</Text>
                  <Text style={styles.detectBtnSub}>Auto-fill address from GPS</Text>
                </View>
              </>
            )}
          </TouchableOpacity>

          {/* Search address */}
          <Text style={styles.fieldLabel}>Or Search Address</Text>
          <View style={styles.placesWrapper}>
            <GooglePlacesAutocomplete
              placeholder="Search area, street, landmark..."
              fetchDetails
              onPress={(_data, details) => {
                if (!details) return
                const components = details.address_components ?? []
                const get = (...types: string[]) =>
                  components.find((c: any) => types.some((t: string) => c.types.includes(t)))?.long_name ?? ''
                setAddress(a => ({
                  ...a,
                  line1: details.name || get('street_number', 'route', 'premise') || a.line1,
                  area: get('sublocality_level_1', 'sublocality', 'neighborhood', 'locality'),
                  city: get('administrative_area_level_2', 'locality'),
                  state: get('administrative_area_level_1'),
                  pincode: get('postal_code'),
                }))
                setMapPinned(true)
                setShowManual(true)
              }}
              query={{ key: MAPS_KEY, language: 'en', components: 'country:in' }}
              textInputProps={{
                onFocus: () => setSearchFocused(true),
                onBlur: () => setSearchFocused(false),
              }}
              styles={{
                container: { flex: 0, zIndex: 10 },
                textInputContainer: { backgroundColor: 'transparent' },
                textInput: {
                  height: 48, borderRadius: 12, fontSize: 15,
                  backgroundColor: colors.white, color: colors.textPrimary,
                  paddingHorizontal: 14, borderWidth: 1.5, marginBottom: 0,
                  borderColor: searchFocused ? colors.primary : colors.border,
                },
                listView: {
                  backgroundColor: colors.white,
                  borderWidth: 1, borderColor: colors.border,
                  borderRadius: 12, marginTop: 2,
                  shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 8,
                  zIndex: 20,
                },
                row: { paddingVertical: 12, paddingHorizontal: 14 },
                description: { fontSize: 14, color: colors.textPrimary },
                separator: { height: 1, backgroundColor: colors.border },
              }}
              enablePoweredByContainer={false}
              keyboardShouldPersistTaps="handled"
            />
          </View>

          {/* Pinned badge */}
          {mapPinned && (
            <View style={styles.pinnedBadge}>
              <Text style={styles.pinnedText}>
                ✓ {[address.area, address.city].filter(Boolean).join(', ') || 'Address selected'}
              </Text>
            </View>
          )}

          {/* Name & Phone — always visible */}
          <Field
            label="Full Name *"
            value={address.name}
            onChange={v => setAddress(a => ({ ...a, name: v }))}
          />
          <Field
            label="Phone *"
            value={address.phone}
            onChange={v => setAddress(a => ({ ...a, phone: v.replace(/\D/g, '').slice(0, 10) }))}
            keyboardType="number-pad"
            maxLength={10}
            placeholder="10-digit mobile number"
            prefix="+91"
          />

          {/* Manual fields toggle */}
          <TouchableOpacity onPress={() => setShowManual(v => !v)} style={styles.manualToggle}>
            <Text style={styles.manualToggleText}>
              {showManual ? '▲ Hide address fields' : '▼ Enter address manually'}
            </Text>
          </TouchableOpacity>

          {showManual && (
            <>
              <Field
                label="Address Line 1 *"
                value={address.line1}
                onChange={v => setAddress(a => ({ ...a, line1: v }))}
                placeholder="Flat/House No, Street"
              />
              <Field
                label="Locality / Area"
                value={address.area ?? ''}
                onChange={v => setAddress(a => ({ ...a, area: v }))}
              />
              <View style={styles.twoCol}>
                <View style={{ flex: 1 }}>
                  <Field
                    label="City *"
                    value={address.city}
                    onChange={v => setAddress(a => ({ ...a, city: v }))}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Pincode *"
                    value={address.pincode}
                    onChange={v => setAddress(a => ({ ...a, pincode: v }))}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                </View>
              </View>
              <Field
                label="State *"
                value={address.state}
                onChange={v => setAddress(a => ({ ...a, state: v }))}
              />
            </>
          )}
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
  fieldLabel: {
    fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 4,
  },
  placesWrapper: { marginBottom: spacing.sm, zIndex: 10 },

  detectBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.primary, borderRadius: 14,
    padding: 14, marginBottom: 14,
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  detectBtnIcon: { fontSize: 22 },
  detectBtnTitle: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  detectBtnSub: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 1 },

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

  pinnedBadge: {
    backgroundColor: '#F0FFF8', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7,
    marginBottom: spacing.sm, borderWidth: 1, borderColor: '#00B98E',
    flexDirection: 'row', alignItems: 'center',
  },
  pinnedText: { fontSize: 13, color: '#00B98E', fontWeight: '700' },

  manualToggle: { paddingVertical: spacing.sm, marginBottom: spacing.xs },
  manualToggleText: { fontSize: 13, color: colors.primary, fontWeight: '600', textAlign: 'center' },
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
