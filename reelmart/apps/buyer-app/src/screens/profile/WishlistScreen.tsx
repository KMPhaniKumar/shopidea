import React, { useEffect, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, Image,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { colors, radius, spacing } from '../../constants/theme'
import { useAuthStore } from '../../store/authStore'
import { getWishlist, toggleWishlist, WishlistItem } from '../../services/profileService'

type Props = { navigation: NativeStackNavigationProp<any> }

export default function WishlistScreen({ navigation }: Props) {
  const session = useAuthStore(s => s.session)
  const [items, setItems] = useState<WishlistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [removing, setRemoving] = useState<string | null>(null)

  useEffect(() => {
    if (!session?.user) return
    getWishlist(session.user.id).then(data => {
      setItems(data)
      setLoading(false)
    })
  }, [session?.user?.id])

  async function handleRemove(productId: string) {
    if (!session?.user) return
    setRemoving(productId)
    await toggleWishlist(session.user.id, productId)
    setItems(prev => prev.filter(i => i.product_id !== productId))
    setRemoving(null)
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
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Wishlist ({items.length})</Text>
        <View style={{ width: 40 }} />
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>❤️</Text>
          <Text style={styles.emptyTitle}>Your wishlist is empty</Text>
          <Text style={styles.emptySub}>Tap ❤️ on any product to save it here</Text>
          <TouchableOpacity style={styles.browseBtn} onPress={() => navigation.navigate('Tabs', { screen: 'Home' })}>
            <Text style={styles.browseBtnText}>Browse Stores →</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => i.product_id}
          numColumns={2}
          renderItem={({ item }) => {
            const p = item.products
            if (!p) return null
            const isRemoving = removing === item.product_id
            return (
              <View style={styles.card}>
                <TouchableOpacity
                  onPress={() => p.stores && navigation.navigate('Storefront', { slug: p.stores.store_slug })}
                  activeOpacity={0.9}
                >
                  {p.images?.[0] ? (
                    <Image source={{ uri: p.images[0] }} style={styles.cardImage} />
                  ) : (
                    <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
                      <Text style={{ fontSize: 36 }}>📦</Text>
                    </View>
                  )}
                  {!p.is_available && (
                    <View style={styles.unavailableBadge}>
                      <Text style={styles.unavailableText}>Unavailable</Text>
                    </View>
                  )}
                </TouchableOpacity>
                <View style={styles.cardBody}>
                  <Text style={styles.productName} numberOfLines={2}>{p.name}</Text>
                  <Text style={styles.storeName}>{p.stores?.store_name}</Text>
                  <View style={styles.cardFooter}>
                    <Text style={styles.price}>₹{p.price}</Text>
                    <TouchableOpacity
                      style={[styles.removeBtn, isRemoving && { opacity: 0.5 }]}
                      onPress={() => handleRemove(item.product_id)}
                      disabled={isRemoving}
                    >
                      <Text style={styles.removeBtnText}>♥</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )
          }}
          columnWrapperStyle={{ gap: spacing.sm }}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 40, gap: spacing.sm }}
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
  card: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  cardImage: { width: '100%', height: 150 },
  cardImagePlaceholder: { backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center' },
  unavailableBadge: {
    position: 'absolute', top: 8, left: 8,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: radius.sm,
    paddingHorizontal: 6, paddingVertical: 3,
  },
  unavailableText: { fontSize: 11, fontWeight: '700', color: colors.white },
  cardBody: { padding: spacing.sm },
  productName: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, marginBottom: 2 },
  storeName: { fontSize: 11, color: colors.textMuted, marginBottom: spacing.xs },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  price: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  removeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  removeBtnText: { fontSize: 20, color: '#EF4444' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyIcon: { fontSize: 64, marginBottom: spacing.md },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 },
  emptySub: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.xl },
  browseBtn: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: spacing.xl, paddingVertical: 14 },
  browseBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
})
