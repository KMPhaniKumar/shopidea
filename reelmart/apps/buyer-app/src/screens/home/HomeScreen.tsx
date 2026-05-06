import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, TextInput, Image, ActivityIndicator, RefreshControl, Dimensions,
} from 'react-native'
import LocationPromptModal from '../../components/LocationPromptModal'
import { getSavedAddresses, SavedAddress } from '../../lib/savedAddresses'

const { width } = Dimensions.get('window')
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { colors, radius, spacing } from '../../constants/theme'
import { useAuthStore } from '../../store/authStore'
import { useCartStore } from '../../store/cartStore'
import {
  getTopRatedStores, getNewStores, getFollowedStores, getStoresByCity,
  search, CATEGORIES, StoreCard,
} from '../../services/discoveryService'


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
  const { fetchCart } = useCartStore()
  const [city, setCity] = useState('Mumbai')
  const [defaultAddress, setDefaultAddress] = useState<SavedAddress | null>(null)
  const [locationModalVisible, setLocationModalVisible] = useState(true)
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
    try {
      const [tr, ns, fw] = await Promise.all([
        getTopRatedStores(city).catch(() => []),
        getNewStores(city).catch(() => []),
        session?.user ? getFollowedStores(session.user.id).catch(() => []) : Promise.resolve([]),
      ])
      setTopRated(tr)
      setNewStores(ns)
      setFollowed(fw)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [city, session?.user?.id])

  useEffect(() => { if (session?.user) fetchCart(session.user.id) }, [session?.user?.id])
  useEffect(() => { setLoading(true); loadAll() }, [loadAll])

  function refreshDefaultAddress() {
    getSavedAddresses().then(addrs => setDefaultAddress(addrs[0] ?? null))
  }

  useEffect(() => { refreshDefaultAddress() }, [])

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
      <LocationPromptModal
        visible={locationModalVisible}
        onClose={() => { setLocationModalVisible(false); refreshDefaultAddress() }}
        onCitySet={detectedCity => setCity(detectedCity)}
      />

      {/* Hero Header */}
      <View style={styles.hero}>
        {/* Logo row */}
        <View style={styles.heroTopRow}>
          <View style={styles.heroLogoCard}>
            <Image source={require('../../../assets/logo.png')} style={styles.heroLogo} resizeMode="contain" />
          </View>
        </View>

        {/* Search bar */}
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search stores or products..."
            placeholderTextColor="rgba(255,255,255,0.55)"
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

        {/* Address bar */}
        <TouchableOpacity style={styles.addressBar} onPress={() => setLocationModalVisible(true)} activeOpacity={0.75}>
          <Text style={styles.addressPin}>📍</Text>
          {defaultAddress ? (
            <Text style={styles.addressText} numberOfLines={1}>
              {[defaultAddress.area, defaultAddress.city].filter(Boolean).join(', ')}
            </Text>
          ) : (
            <Text style={[styles.addressText, styles.addressPlaceholder]}>Set your address</Text>
          )}
          <Text style={styles.addressChevron}>▾</Text>
        </TouchableOpacity>
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
  container: { flex: 1, backgroundColor: '#F5F5F7' },

  /* ── Hero header ── */
  hero: {
    backgroundColor: '#1A1A1A',
    paddingTop: 54, paddingBottom: 16,
    paddingHorizontal: spacing.lg,
  },
  heroTopRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 14,
  },
  heroLogoCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  heroLogo: { width: width * 0.42, height: 48 },

  addressBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    marginTop: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'flex-start',
  },
  addressPin: { fontSize: 13 },
  addressText: { fontSize: 13, fontWeight: '700', color: colors.white, maxWidth: 200 },
  addressPlaceholder: { color: 'rgba(255,255,255,0.55)', fontWeight: '500' },
  addressChevron: { fontSize: 11, color: '#AAAAAA' },

  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md, height: 46,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  searchIcon: { fontSize: 16, marginRight: spacing.xs },
  searchInput: { flex: 1, fontSize: 15, color: colors.white },
  searchClear: { fontSize: 14, color: 'rgba(255,255,255,0.6)', paddingLeft: spacing.xs },

  /* ── Category chips ── */
  categoryScroll: { flexGrow: 0, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  categoryContent: { paddingHorizontal: spacing.lg, paddingVertical: 10, gap: spacing.xs },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.white, marginRight: spacing.xs,
  },
  catChipActive: { borderColor: colors.primary, backgroundColor: '#FFF0E9' },
  catIcon: { fontSize: 16 },
  catLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  catLabelActive: { color: colors.primary },

  /* ── Feed ── */
  body: { padding: spacing.md, paddingBottom: 40 },
  section: { marginBottom: spacing.lg },
  sectionTitle: {
    fontSize: 16, fontWeight: '800', color: colors.textPrimary,
    marginBottom: spacing.sm, letterSpacing: -0.3,
  },
  chipRow: { flexDirection: 'row', gap: spacing.sm },

  /* Store chip (horizontal scroll cards) */
  chip: {
    width: 108, alignItems: 'center', padding: 12,
    borderRadius: 16, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.white,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  chipLogo: { width: 56, height: 56, borderRadius: 28, marginBottom: 8 },
  chipLogoPlaceholder: { backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center' },
  chipName: { fontSize: 12, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  chipRating: { fontSize: 11, color: colors.textMuted, marginTop: 2 },

  /* Store row (list card) */
  storeRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.white, borderRadius: 16,
    padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  storeRowLogo: { width: 62, height: 62, borderRadius: 14 },
  storeRowLogoPlaceholder: { backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center' },
  storeRowHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  storeRowName: { fontSize: 15, fontWeight: '800', color: colors.textPrimary, flex: 1 },
  verifiedBadge: {
    fontSize: 11, color: '#00B98E', fontWeight: '800',
    backgroundColor: '#E6FAF4', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  storeRowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  storeRowRating: { fontSize: 12, color: '#F59E0B', fontWeight: '600', marginTop: 2 },

  /* Empty */
  empty: { alignItems: 'center', paddingVertical: 70 },
  emptyIcon: { fontSize: 52, marginBottom: spacing.md },
  emptyText: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  emptySubText: { fontSize: 13, color: colors.textMuted, marginTop: 6 },
})
