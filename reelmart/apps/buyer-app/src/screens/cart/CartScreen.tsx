import React, { useEffect, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, Image,
  StyleSheet, ActivityIndicator, Alert, TextInput,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { colors, radius, spacing } from '../../constants/theme'
import { useAuthStore } from '../../store/authStore'
import { useCartStore } from '../../store/cartStore'
import { validateCoupon, CouponValidation } from '../../services/cartService'

const DELIVERY_FEE = 60
const FREE_DELIVERY_THRESHOLD = 500

type Props = { navigation: NativeStackNavigationProp<any> }

export default function CartScreen({ navigation }: Props) {
  const session = useAuthStore(s => s.session)
  const {
    items, itemCount, subtotal, storeName, storeId, storeSlug,
    loading, fetchCart, updateQty, removeItem, clearAll, getCheckoutItems,
  } = useCartStore()

  useEffect(() => {
    if (session?.user) fetchCart(session.user.id)
  }, [session?.user?.id])

  const [couponInput, setCouponInput] = useState('')
  const [coupon, setCoupon] = useState<CouponValidation | null>(null)
  const [applyingCoupon, setApplyingCoupon] = useState(false)

  const deliveryFee = subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE
  const discount = coupon?.valid ? coupon.discount : 0
  const total = subtotal + deliveryFee - discount

  async function handleApplyCoupon() {
    if (!storeId || !couponInput.trim()) return
    setApplyingCoupon(true)
    const result = await validateCoupon(storeId, couponInput, subtotal)
    setApplyingCoupon(false)
    setCoupon(result)
    if (!result.valid) Alert.alert('Coupon Invalid', result.error ?? 'Try another code')
  }

  function handleRemoveCoupon() {
    setCoupon(null)
    setCouponInput('')
  }

  function handleClearCart() {
    Alert.alert('Clear Cart', 'Remove all items from cart?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => session?.user && clearAll(session.user.id) },
    ])
  }

  function handleCheckout() {
    if (!session?.user || items.length === 0 || !storeId || !storeName) return
    navigation.navigate('Checkout', {
      storeId,
      storeName,
      items: getCheckoutItems(),
      subtotal,
      discount,
      couponCode: coupon?.valid ? coupon.code : undefined,
    })
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
        <Text style={styles.title}>My Cart</Text>
        {items.length > 0 && (
          <TouchableOpacity onPress={handleClearCart}>
            <Text style={styles.clearBtn}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🛒</Text>
          <Text style={styles.emptyTitle}>Your cart is empty</Text>
          <Text style={styles.emptySub}>Browse stores and add items to get started</Text>
          <TouchableOpacity style={styles.browseBtn} onPress={() => navigation.navigate('Tabs', { screen: 'Home' })}>
            <Text style={styles.browseBtnText}>Browse Stores →</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Store info */}
          {storeName && (
            <TouchableOpacity
              style={styles.storeBanner}
              onPress={() => storeSlug && navigation.navigate('Storefront', { slug: storeSlug })}
            >
              <Text style={styles.storeBannerText}>🏪 {storeName}</Text>
              <Text style={styles.storeBannerLink}>View store →</Text>
            </TouchableOpacity>
          )}

          <FlatList
            data={items}
            keyExtractor={i => i.id}
            renderItem={({ item }) => {
              const price = item.selected_variant?.price ?? item.products.price
              return (
                <View style={styles.cartItem}>
                  {item.products.images?.[0] ? (
                    <Image source={{ uri: item.products.images[0] }} style={styles.itemImage} />
                  ) : (
                    <View style={[styles.itemImage, styles.itemImagePlaceholder]}>
                      <Text style={{ fontSize: 22 }}>📦</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName} numberOfLines={2}>{item.products.name}</Text>
                    {item.selected_variant && (
                      <Text style={styles.itemVariant}>{item.selected_variant.value}</Text>
                    )}
                    <Text style={styles.itemPrice}>₹{price}</Text>
                  </View>
                  <View style={styles.qtyControls}>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => session?.user && updateQty(session.user.id, item.id, item.quantity - 1)}
                    >
                      <Text style={styles.qtyBtnText}>{item.quantity === 1 ? '🗑' : '−'}</Text>
                    </TouchableOpacity>
                    <Text style={styles.qtyVal}>{item.quantity}</Text>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => session?.user && updateQty(session.user.id, item.id, item.quantity + 1)}
                    >
                      <Text style={styles.qtyBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )
            }}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListFooterComponent={
              <View>
                {/* Coupon input */}
                {!coupon?.valid ? (
                  <View style={styles.couponRow}>
                    <TextInput
                      style={styles.couponInput}
                      value={couponInput}
                      onChangeText={t => setCouponInput(t.toUpperCase())}
                      placeholder="Coupon code"
                      placeholderTextColor={colors.textMuted}
                      autoCapitalize="characters"
                    />
                    <TouchableOpacity
                      style={[styles.couponApplyBtn, (!couponInput.trim() || applyingCoupon) && { opacity: 0.5 }]}
                      onPress={handleApplyCoupon}
                      disabled={!couponInput.trim() || applyingCoupon}
                    >
                      <Text style={styles.couponApplyText}>{applyingCoupon ? '...' : 'Apply'}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.couponApplied}>
                    <Text style={styles.couponAppliedText}>🎟 {coupon.code} — ₹{coupon.discount} off</Text>
                    <TouchableOpacity onPress={handleRemoveCoupon}>
                      <Text style={styles.couponRemove}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <View style={styles.summary}>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Subtotal ({itemCount} items)</Text>
                    <Text style={styles.summaryVal}>₹{subtotal}</Text>
                  </View>
                  {discount > 0 && (
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Coupon Discount</Text>
                      <Text style={styles.summaryValSaving}>−₹{discount}</Text>
                    </View>
                  )}
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Delivery</Text>
                    <Text style={deliveryFee === 0 ? styles.summaryValFree : styles.summaryVal}>
                      {deliveryFee === 0 ? 'FREE' : `₹${deliveryFee}`}
                    </Text>
                  </View>
                  {deliveryFee === 0 && (
                    <Text style={styles.freeNote}>🎉 Free delivery on orders above ₹{FREE_DELIVERY_THRESHOLD}</Text>
                  )}
                  {deliveryFee > 0 && (
                    <Text style={styles.freeNote}>
                      Add ₹{FREE_DELIVERY_THRESHOLD - subtotal} more for free delivery
                    </Text>
                  )}
                  <View style={[styles.summaryRow, styles.totalRow]}>
                    <Text style={styles.totalLabel}>Total</Text>
                    <Text style={styles.totalVal}>₹{total}</Text>
                  </View>
                </View>
              </View>
            }
          />

          <View style={styles.footer}>
            <View>
              <Text style={styles.footerTotal}>₹{total}</Text>
              <Text style={styles.footerItemCount}>{itemCount} item{itemCount !== 1 ? 's' : ''}</Text>
            </View>
            <TouchableOpacity style={styles.checkoutBtn} onPress={handleCheckout}>
              <Text style={styles.checkoutBtnText}>Proceed to Checkout →</Text>
            </TouchableOpacity>
          </View>
        </>
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
  clearBtn: { fontSize: 14, color: colors.error, fontWeight: '600' },
  storeBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    backgroundColor: '#FFF0E9', borderBottomWidth: 1, borderBottomColor: '#FFD5BE',
  },
  storeBannerText: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  storeBannerLink: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  list: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: 120 },
  cartItem: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  itemImage: { width: 64, height: 64, borderRadius: radius.md },
  itemImagePlaceholder: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  itemName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  itemVariant: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  itemPrice: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginTop: 4 },
  qtyControls: { alignItems: 'center', gap: 6 },
  qtyBtn: {
    width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white,
  },
  qtyBtnText: { fontSize: 16, color: colors.textPrimary },
  qtyVal: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  couponRow: {
    flexDirection: 'row', gap: spacing.sm,
    marginTop: spacing.md, marginBottom: spacing.xs,
  },
  couponInput: {
    flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm,
    paddingHorizontal: spacing.sm, height: 42, fontSize: 14, color: colors.textPrimary,
    letterSpacing: 1,
  },
  couponApplyBtn: {
    backgroundColor: colors.primary, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, height: 42, alignItems: 'center', justifyContent: 'center',
  },
  couponApplyText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  couponApplied: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#F0FFF4', borderRadius: radius.sm,
    paddingHorizontal: spacing.sm, paddingVertical: 10,
    marginTop: spacing.md, marginBottom: spacing.xs,
    borderWidth: 1, borderColor: '#86EFAC',
  },
  couponAppliedText: { fontSize: 14, fontWeight: '600', color: '#166534' },
  couponRemove: { fontSize: 13, color: colors.error, fontWeight: '600' },
  summary: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, marginTop: spacing.xs,
    borderWidth: 1, borderColor: colors.border,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  summaryLabel: { fontSize: 14, color: colors.textSecondary },
  summaryVal: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  summaryValFree: { fontSize: 14, fontWeight: '700', color: colors.success },
  summaryValSaving: { fontSize: 14, fontWeight: '700', color: '#16A34A' },
  freeNote: { fontSize: 12, color: colors.success, marginBottom: 6 },
  totalRow: { marginTop: spacing.xs, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border },
  totalLabel: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  totalVal: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.lg, backgroundColor: colors.white,
    borderTopWidth: 1, borderTopColor: colors.border,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 8,
  },
  footerTotal: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
  footerItemCount: { fontSize: 12, color: colors.textMuted },
  checkoutBtn: {
    backgroundColor: colors.primary, borderRadius: radius.pill,
    paddingHorizontal: spacing.xl, height: 52,
    alignItems: 'center', justifyContent: 'center',
  },
  checkoutBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyIcon: { fontSize: 64, marginBottom: spacing.md },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 },
  emptySub: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.xl },
  browseBtn: {
    backgroundColor: colors.primary, borderRadius: radius.pill,
    paddingHorizontal: spacing.xl, paddingVertical: 14,
  },
  browseBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
})
