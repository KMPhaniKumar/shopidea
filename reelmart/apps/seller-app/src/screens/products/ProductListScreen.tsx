import React, { useEffect, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, Image,
  StyleSheet, Switch, Alert, ActivityIndicator,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { colors, radius, spacing } from '../../constants/theme'
import { useProductStore, ProductWithVariants } from '../../store/productStore'
import { useSellerStore } from '../../store/sellerStore'
import { toggleAvailability, deleteProduct, isLowStock, isOutOfStock } from '../../services/productService'

type Filter = 'all' | 'available' | 'hidden' | 'low_stock'
type Props = { navigation: NativeStackNavigationProp<any> }

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'available', label: 'Available' },
  { id: 'hidden', label: 'Hidden' },
  { id: 'low_stock', label: 'Low Stock' },
]

export default function ProductListScreen({ navigation }: Props) {
  const store = useSellerStore(s => s.store)
  const { products, loading, fetchProducts, updateProduct, removeProduct } = useProductStore()
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    if (store?.id) fetchProducts(store.id)
  }, [store?.id])

  async function handleToggle(product: ProductWithVariants) {
    const next = !product.is_available
    updateProduct(product.id, { is_available: next })
    await toggleAvailability(product.id, next)
  }

  async function handleDelete(product: ProductWithVariants) {
    Alert.alert(
      'Delete Product',
      `Delete "${product.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            removeProduct(product.id)
            await deleteProduct(product.id)
          },
        },
      ]
    )
  }

  const filtered = products.filter(p => {
    if (filter === 'available') return p.is_available
    if (filter === 'hidden') return !p.is_available
    if (filter === 'low_stock') return isLowStock(p)
    return true
  })

  function renderProduct({ item }: { item: ProductWithVariants }) {
    const outOfStock = isOutOfStock(item)
    const lowStock = isLowStock(item)

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('EditProduct', { product: item })}
        onLongPress={() => handleDelete(item)}
      >
        <Image
          source={item.images[0] ? { uri: item.images[0] } : require('../../assets/placeholder.png')}
          style={[styles.thumb, !item.is_available && styles.thumbDim]}
        />
        <View style={styles.info}>
          <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.price}>₹{item.price}</Text>
            {item.compare_price && item.compare_price > item.price && (
              <Text style={styles.comparePrice}>₹{item.compare_price}</Text>
            )}
          </View>
          {item.product_variants.length > 0 && (
            <Text style={styles.variantCount}>{item.product_variants.length} variants</Text>
          )}
          <View style={styles.badges}>
            {outOfStock && <View style={[styles.badge, styles.badgeRed]}><Text style={styles.badgeText}>Out of stock</Text></View>}
            {!outOfStock && lowStock && <View style={[styles.badge, styles.badgeOrange]}><Text style={styles.badgeText}>Low stock: {item.stock_count}</Text></View>}
            {item.stock_type === 'unlimited' && <View style={[styles.badge, styles.badgeGray]}><Text style={styles.badgeText}>Unlimited</Text></View>}
            {item.stock_type === 'counted' && !outOfStock && !lowStock && (
              <View style={[styles.badge, styles.badgeGray]}><Text style={styles.badgeText}>Stock: {item.stock_count}</Text></View>
            )}
          </View>
        </View>
        <Switch
          value={item.is_available}
          onValueChange={() => handleToggle(item)}
          trackColor={{ false: colors.border, true: '#FFD5BE' }}
          thumbColor={item.is_available ? colors.primary : colors.textMuted}
        />
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Products</Text>
        <Text style={styles.count}>{products.length} total</Text>
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.id}
            style={[styles.filterTab, filter === f.id && styles.filterTabActive]}
            onPress={() => setFilter(f.id)}
          >
            <Text style={[styles.filterText, filter === f.id && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📦</Text>
          <Text style={styles.emptyTitle}>
            {filter === 'all' ? 'No products yet' : `No ${filter.replace('_', ' ')} products`}
          </Text>
          {filter === 'all' && (
            <Text style={styles.emptySub}>Tap + to add your first product</Text>
          )}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={renderProduct}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('AddProduct')}
        activeOpacity={0.85}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingTop: 56, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  count: { fontSize: 14, color: colors.textMuted },
  filterRow: {
    flexDirection: 'row', paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm, gap: spacing.xs,
  },
  filterTab: {
    paddingHorizontal: spacing.md, paddingVertical: 7,
    borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.border,
  },
  filterTabActive: { borderColor: colors.primary, backgroundColor: '#FFF0E9' },
  filterText: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  filterTextActive: { color: colors.primary, fontWeight: '700' },
  list: { paddingHorizontal: spacing.md, paddingBottom: 100 },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border, gap: spacing.sm,
  },
  thumb: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: colors.surface },
  thumbDim: { opacity: 0.45 },
  info: { flex: 1 },
  productName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, marginBottom: 4 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 4 },
  price: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  comparePrice: { fontSize: 13, color: colors.textMuted, textDecorationLine: 'line-through' },
  variantCount: { fontSize: 12, color: colors.textSecondary, marginBottom: 4 },
  badges: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm },
  badgeRed: { backgroundColor: '#FEE2E2' },
  badgeOrange: { backgroundColor: '#FFF0E9' },
  badgeGray: { backgroundColor: colors.surface },
  badgeText: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyIcon: { fontSize: 52, marginBottom: spacing.md },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: colors.textPrimary, marginBottom: spacing.xs },
  emptySub: { fontSize: 14, color: colors.textMuted },
  fab: {
    position: 'absolute', bottom: 28, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 8,
  },
  fabText: { color: colors.white, fontSize: 28, fontWeight: '300', lineHeight: 32 },
})
