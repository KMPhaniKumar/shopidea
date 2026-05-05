import React, { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, FlatList, TouchableOpacity,
  StyleSheet, Image, ActivityIndicator, Alert, Linking,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RouteProp } from '@react-navigation/native'
import { colors, radius, spacing } from '../../constants/theme'
import { useAuthStore } from '../../store/authStore'
import { getStoreBySlug, getStoreProducts, toggleFollowStore, CATEGORIES } from '../../services/discoveryService'
import { CartItem } from '../../services/orderService'

type Props = {
  navigation: NativeStackNavigationProp<any>
  route: RouteProp<{ Storefront: { slug: string } }, 'Storefront'>
}

interface CartEntry { item: CartItem; qty: number }

export default function StorefrontScreen({ navigation, route }: Props) {
  const { slug } = route.params
  const session = useAuthStore(s => s.session)
  const [store, setStore] = useState<any>(null)
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isFollowing, setIsFollowing] = useState(false)
  const [cart, setCart] = useState<Record<string, CartEntry>>({}) // keyed by productId

  useEffect(() => {
    Promise.all([getStoreBySlug(slug), getStoreProducts('__placeholder__')]).then(([s]) => {
      setStore(s)
      if (s) getStoreProducts(s.id).then(setProducts)
      setLoading(false)
    })
  }, [slug])

  useEffect(() => {
    if (!store) return
    getStoreBySlug(slug).then(setStore)
    getStoreProducts(store?.id).then(setProducts)
  }, [])

  function addToCart(product: any) {
    const key = product.id
    setCart(prev => ({
      ...prev,
      [key]: {
        item: {
          productId: product.id,
          name: product.name,
          image: product.images?.[0] ?? '',
          price: product.price,
          qty: 1,
        },
        qty: (prev[key]?.qty ?? 0) + 1,
      },
    }))
  }

  function removeFromCart(productId: string) {
    setCart(prev => {
      const entry = prev[productId]
      if (!entry || entry.qty <= 1) {
        const next = { ...prev }
        delete next[productId]
        return next
      }
      return { ...prev, [productId]: { ...entry, qty: entry.qty - 1 } }
    })
  }

  const cartItems = Object.values(cart).map(e => ({ ...e.item, qty: e.qty }))
  const subtotal = cartItems.reduce((sum, i) => sum + i.price * i.qty, 0)
  const cartCount = cartItems.reduce((sum, i) => sum + i.qty, 0)

  function handleCheckout() {
    if (!session?.user) { Alert.alert('Sign in required', 'Please sign in to place an order'); return }
    if (cartItems.length === 0) return
    navigation.navigate('Checkout', {
      storeId: store.id,
      storeName: store.store_name,
      items: cartItems,
      subtotal,
    })
  }

  async function handleFollow() {
    if (!session?.user) { Alert.alert('Sign in to follow stores'); return }
    const nowFollowing = await toggleFollowStore(session.user.id, store.id)
    setIsFollowing(nowFollowing)
  }

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (!store) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textMuted }}>Store not found</Text>
      </View>
    )
  }

  const cat = CATEGORIES.find(c => c.id === store.category)

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        {store.logo_url ? (
          <Image source={{ uri: store.logo_url }} style={styles.headerLogo} />
        ) : (
          <Text style={{ fontSize: 24 }}>{cat?.icon ?? '🏪'}</Text>
        )}
        <TouchableOpacity style={[styles.followBtn, isFollowing && styles.followingBtn]} onPress={handleFollow}>
          <Text style={[styles.followBtnText, isFollowing && styles.followingBtnText]}>
            {isFollowing ? '✓ Following' : '+ Follow'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Store info */}
        <View style={styles.storeInfo}>
          <View style={styles.storeNameRow}>
            <Text style={styles.storeName}>{store.store_name}</Text>
            {store.is_verified && <Text style={styles.verified}>✓ Verified</Text>}
          </View>
          {store.rating_avg > 0 && (
            <Text style={styles.storeRating}>⭐ {store.rating_avg.toFixed(1)} · {store.total_reviews} reviews</Text>
          )}
          <Text style={styles.storeMeta}>{cat?.label} · {store.area ?? store.city}</Text>
          {!store.is_open && (
            <View style={styles.closedBanner}>
              <Text style={styles.closedText}>🔴 Currently closed</Text>
            </View>
          )}
          {store.whatsapp_number && (
            <TouchableOpacity
              style={styles.whatsappBtn}
              onPress={() => Linking.openURL(`https://wa.me/${store.whatsapp_number.replace('+', '')}`)}
            >
              <Text style={styles.whatsappText}>💬 Chat on WhatsApp</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Products */}
        <Text style={styles.sectionTitle}>Products ({products.length})</Text>
        {products.length === 0 ? (
          <View style={styles.emptyProducts}>
            <Text style={styles.emptyText}>No products listed yet</Text>
          </View>
        ) : (
          <View style={styles.productGrid}>
            {products.map(product => {
              const qty = cart[product.id]?.qty ?? 0
              return (
                <View key={product.id} style={styles.productCard}>
                  {product.images?.[0] ? (
                    <Image source={{ uri: product.images[0] }} style={styles.productImage} />
                  ) : (
                    <View style={[styles.productImage, styles.productImagePlaceholder]}>
                      <Text style={{ fontSize: 32 }}>📦</Text>
                    </View>
                  )}
                  <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
                  <Text style={styles.productPrice}>₹{product.price}</Text>
                  {product.stock !== null && product.stock === 0 ? (
                    <View style={styles.outOfStock}>
                      <Text style={styles.outOfStockText}>Out of stock</Text>
                    </View>
                  ) : qty === 0 ? (
                    <TouchableOpacity style={styles.addBtn} onPress={() => addToCart(product)}>
                      <Text style={styles.addBtnText}>Add</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.qtyRow}>
                      <TouchableOpacity style={styles.qtyBtn} onPress={() => removeFromCart(product.id)}>
                        <Text style={styles.qtyBtnText}>−</Text>
                      </TouchableOpacity>
                      <Text style={styles.qtyVal}>{qty}</Text>
                      <TouchableOpacity style={styles.qtyBtn} onPress={() => addToCart(product)}>
                        <Text style={styles.qtyBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )
            })}
          </View>
        )}
      </ScrollView>

      {/* Cart footer */}
      {cartCount > 0 && (
        <View style={styles.cartFooter}>
          <View>
            <Text style={styles.cartTotal}>₹{subtotal}</Text>
            <Text style={styles.cartCount}>{cartCount} item{cartCount !== 1 ? 's' : ''}</Text>
          </View>
          <TouchableOpacity style={styles.checkoutBtn} onPress={handleCheckout}>
            <Text style={styles.checkoutBtnText}>Proceed to Checkout →</Text>
          </TouchableOpacity>
        </View>
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
  headerLogo: { width: 36, height: 36, borderRadius: 8 },
  followBtn: {
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.primary,
  },
  followingBtn: { backgroundColor: colors.primary },
  followBtnText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  followingBtnText: { color: colors.white },
  body: { padding: spacing.md, paddingBottom: 100 },
  storeInfo: { marginBottom: spacing.lg },
  storeNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 4 },
  storeName: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  verified: { fontSize: 13, color: colors.primary, fontWeight: '700' },
  storeRating: { fontSize: 14, color: colors.textSecondary, marginBottom: 2 },
  storeMeta: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.sm },
  closedBanner: {
    backgroundColor: '#FEF2F2', borderRadius: radius.sm, paddingHorizontal: spacing.sm,
    paddingVertical: 6, alignSelf: 'flex-start', marginBottom: spacing.sm,
  },
  closedText: { fontSize: 13, color: colors.error, fontWeight: '600' },
  whatsappBtn: {
    alignSelf: 'flex-start', paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.pill, backgroundColor: '#25D366',
  },
  whatsappText: { fontSize: 14, fontWeight: '700', color: colors.white },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  emptyProducts: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 14, color: colors.textMuted },
  productGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  productCard: {
    width: '47%', backgroundColor: colors.surface,
    borderRadius: radius.lg, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.xs,
  },
  productImage: { width: '100%', height: 140 },
  productImagePlaceholder: { backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center' },
  productName: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, padding: spacing.xs, paddingBottom: 2 },
  productPrice: { fontSize: 15, fontWeight: '800', color: colors.textPrimary, paddingHorizontal: spacing.xs, paddingBottom: spacing.xs },
  addBtn: {
    marginHorizontal: spacing.xs, marginBottom: spacing.xs,
    backgroundColor: colors.primary, borderRadius: radius.sm,
    height: 36, alignItems: 'center', justifyContent: 'center',
  },
  addBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  outOfStock: {
    marginHorizontal: spacing.xs, marginBottom: spacing.xs, height: 36,
    alignItems: 'center', justifyContent: 'center',
  },
  outOfStockText: { fontSize: 12, color: colors.textMuted },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: spacing.xs, marginBottom: spacing.xs },
  qtyBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  qtyBtnText: { color: colors.white, fontSize: 18, fontWeight: '700', lineHeight: 22 },
  qtyVal: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  cartFooter: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.lg, backgroundColor: colors.white,
    borderTopWidth: 1, borderTopColor: colors.border,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, elevation: 8,
  },
  cartTotal: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
  cartCount: { fontSize: 12, color: colors.textMuted },
  checkoutBtn: {
    backgroundColor: colors.primary, borderRadius: radius.pill,
    paddingHorizontal: spacing.xl, height: 52,
    alignItems: 'center', justifyContent: 'center',
  },
  checkoutBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
})
