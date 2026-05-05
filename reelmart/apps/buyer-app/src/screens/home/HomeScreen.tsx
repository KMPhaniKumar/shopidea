import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, TextInput, Image, ActivityIndicator, RefreshControl,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { colors, radius, spacing } from '../../constants/theme'
import { useAuthStore } from '../../store/authStore'
import { useCartStore } from '../../store/cartStore'
import {
  getTopRatedStores, getNewStores, getFollowedStores, getStoresByCity,
  search, CATEGORIES, StoreCard,
} from '../../services/discoveryService'

const CITIES = ['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Hyderabad', 'Pune', 'Kolkata', 'Ahmedabad', 'Jaipur', 'Surat']

type Props = { navigation: NativeStackNavigationProp<any> }

function StoreChip({ store, onPress }: { store: StoreCard; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.chip} onPress={onPress} activeOpacity={0.8}>
      {store.logo_url ? (
        <Image source={{ uri: store.logo_url }} style={styles.chipLogo} />
      ) : (
        <View style={[styles.chipLogo, styles.chipLogoPlaceholder]}>
          <Text style={{ fontSize: 18 }}>🏪</Text>
        </View>
      )}
      <Text style={styles.chipName} numberOfLines={1}>{store.store_name}</Text>
      {store.rating_avg > 0 && (
        <Text style={styles.chipRating}>⭐ {store.rating_avg.toFixed(1)}</Text>
      )}
    </TouchableOpacity>
  )
}

function StoreRow({ store, onPress }: { store: StoreCard; onPress: () => void }) {
  const cat = CATEGORIES.find(c => c.id === store.category)
  return (
    <TouchableOpacity style={styles.storeRow} onPress={onPress} activeOpacity={0.8}>
      {store.logo_url ? (
        <Image source={{ uri: store.logo_url }} style={styles.storeRowLogo} />
      ) : (
        <View style={[styles.storeRowLogo, styles.storeRowLogoPlaceholder]}>
          <Text style={{ fontSize: 28 }}>{cat?.icon ?? '🏪'}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <View style={styles.storeRowHeader}>
          <Text style={styles.storeRowName} numberOfLines={1}>{store.store_name}</Text>
          {store.is_verified && <Text style={styles.verifiedBadge}>✓</Text>}
        </View>
        <Text style={styles.storeRowMeta}>{cat?.label} · {store.area ?? store.city}</Text>
        {store.rating_avg > 0 && (
          <Text style={styles.storeRowRating}>⭐ {store.rating_avg.toFixed(1)} ({store.total_reviews} reviews)</Text>
        )}
      </View>
    </TouchableOpacity>
  )
}

export default function HomeScreen({ navigation }: Props) {
  const session = useAuthStore(s => s.session)
  const { itemCount: cartCount, fetchCart } = useCartStore()
  const [city, setCity] = useState('Mumbai')
  const [showCityPicker, setShowCityPicker] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [topRated, setTopRated] = useState<StoreCard[]>([])
  const [newStores, setNewStores] = useState<StoreCard[]>([])
  const [followed, setFollowed] = useState<StoreCard[]>([])
  const [filtered, setFiltered] = useState<StoreCard[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searching, setSearching] = useState(false)

  const loadAll = useCallback(async () => {
    const [tr, ns, fw] = await Promise.all([
      getTopRatedStores(city),
      getNewStores(city),
      session?.user ? getFollowedStores(session.user.id) : Promise.resolve([]),
    ])
    setTopRated(tr)
    setNewStores(ns)
    setFollowed(fw)
    setLoading(false)
    setRefreshing(false)
  }, [city, session?.user?.id])

  useEffect(() => { if (session?.user) fetchCart(session.user.id) }, [session?.user?.id])
  useEffect(() => { setLoading(true); loadAll() }, [loadAll])

  useEffect(() => {
    if (!searchQuery.trim() && !selectedCategory) { setFiltered([]); setSearching(false); return }
    setSearching(true)
    const timer = setTimeout(async () => {
      if (searchQuery.trim()) {
        const res = await search(searchQuery, city)
        setFiltered(res.stores)
      } else if (selectedCategory) {
        const stores = await getStoresByCity(city, selectedCategory)
        setFiltered(stores)
      }
      setSearching(false)
    }, 400)
    return () => clearTimeout(timer)
  }, [searchQuery, selectedCategory, city])

  const goToStore = (slug: string) => navigation.navigate('Storefront', { slug })

  const showSearch = !!searchQuery.trim() || !!selectedCategory

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setShowCityPicker(v => !v)} style={styles.cityBtn}>
          <Text style={styles.cityIcon}>📍</Text>
          <Text style={styles.cityName}>{city}</Text>
          <Text style={styles.cityChevron}>▾</Text>
        </TouchableOpacity>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Cart')}>
            <Text style={styles.iconBtnText}>🛒</Text>
            {cartCount > 0 && (
              <View style={styles.cartBadge}><Text style={styles.cartBadgeText}>{cartCount}</Text></View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Profile')}>
            <Text style={styles.iconBtnText}>👤</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* City picker dropdown */}
      {showCityPicker && (
        <View style={styles.cityDropdown}>
          {CITIES.map(c => (
            <TouchableOpacity key={c} style={styles.cityOption} onPress={() => { setCity(c); setShowCityPicker(false) }}>
              <Text style={[styles.cityOptionText, c === city && styles.cityOptionActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Search bar */}
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search stores or products..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={t => { setSearchQuery(t); setSelectedCategory(null) }}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Text style={styles.searchClear}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Category chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll} contentContainerStyle={styles.categoryContent}>
        {CATEGORIES.map(cat => (
          <TouchableOpacity
            key={cat.id}
            style={[styles.catChip, selectedCategory === cat.id && styles.catChipActive]}
            onPress={() => { setSelectedCategory(p => p === cat.id ? null : cat.id); setSearchQuery('') }}
          >
            <Text style={styles.catIcon}>{cat.icon}</Text>
            <Text style={[styles.catLabel, selectedCategory === cat.id && styles.catLabelActive]}>{cat.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
      ) : showSearch ? (
        /* Search / filtered results */
        <ScrollView contentContainerStyle={styles.body}>
          {searching ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          ) : filtered.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={styles.emptyText}>No stores found</Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionTitle}>Results ({filtered.length})</Text>
              {filtered.map(s => <StoreRow key={s.id} store={s} onPress={() => goToStore(s.store_slug)} />)}
            </>
          )}
        </ScrollView>
      ) : (
        /* Home feed */
        <ScrollView
          contentContainerStyle={styles.body}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAll() }} tintColor={colors.primary} />}
        >
          {/* Followed stores */}
          {followed.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Your Stores</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipRow}>
                  {followed.map(s => <StoreChip key={s.id} store={s} onPress={() => goToStore(s.store_slug)} />)}
                </View>
              </ScrollView>
            </View>
          )}

          {/* Top rated */}
          {topRated.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>⭐ Top Rated in {city}</Text>
              {topRated.slice(0, 5).map(s => <StoreRow key={s.id} store={s} onPress={() => goToStore(s.store_slug)} />)}
            </View>
          )}

          {/* New stores */}
          {newStores.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🆕 New in {city}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipRow}>
                  {newStores.map(s => <StoreChip key={s.id} store={s} onPress={() => goToStore(s.store_slug)} />)}
                </View>
              </ScrollView>
            </View>
          )}

          {topRated.length === 0 && newStores.length === 0 && (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🏪</Text>
              <Text style={styles.emptyText}>No stores in {city} yet</Text>
              <Text style={styles.emptySubText}>Check back soon!</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: 56, paddingBottom: spacing.sm,
  },
  cityBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cityIcon: { fontSize: 16 },
  cityName: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  cityChevron: { fontSize: 12, color: colors.textSecondary, marginLeft: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  iconBtnText: { fontSize: 22 },
  cartBadge: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: colors.primary, borderRadius: 8, minWidth: 16, height: 16,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  cartBadgeText: { fontSize: 10, fontWeight: '800', color: colors.white },
  cityDropdown: {
    position: 'absolute', top: 96, left: spacing.lg, right: spacing.lg, zIndex: 100,
    backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 8,
  },
  cityOption: { paddingHorizontal: spacing.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  cityOptionText: { fontSize: 15, color: colors.textPrimary },
  cityOptionActive: { color: colors.primary, fontWeight: '700' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: spacing.lg, marginVertical: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radius.pill,
    paddingHorizontal: spacing.md, height: 44,
    borderWidth: 1, borderColor: colors.border,
  },
  searchIcon: { fontSize: 16, marginRight: spacing.xs },
  searchInput: { flex: 1, fontSize: 15, color: colors.textPrimary },
  searchClear: { fontSize: 14, color: colors.textMuted, paddingLeft: spacing.xs },
  categoryScroll: { flexGrow: 0 },
  categoryContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.xs },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.sm, paddingVertical: 6,
    borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.white, marginRight: spacing.xs,
  },
  catChipActive: { borderColor: colors.primary, backgroundColor: '#FFF0E9' },
  catIcon: { fontSize: 16 },
  catLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  catLabelActive: { color: colors.primary },
  body: { padding: spacing.md, paddingBottom: 40 },
  section: { marginBottom: spacing.lg },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    width: 100, alignItems: 'center', padding: spacing.sm,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipLogo: { width: 52, height: 52, borderRadius: 26, marginBottom: 6 },
  chipLogoPlaceholder: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  chipName: { fontSize: 12, fontWeight: '600', color: colors.textPrimary, textAlign: 'center' },
  chipRating: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  storeRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.sm, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  storeRowLogo: { width: 56, height: 56, borderRadius: radius.md },
  storeRowLogoPlaceholder: { backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center' },
  storeRowHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  storeRowName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  verifiedBadge: { fontSize: 13, color: colors.primary, fontWeight: '700' },
  storeRowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  storeRowRating: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyText: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  emptySubText: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
})
