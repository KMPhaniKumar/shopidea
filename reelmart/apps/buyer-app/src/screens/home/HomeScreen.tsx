import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, TextInput, Image, ActivityIndicator, RefreshControl, Dimensions,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import LocationPromptModal from '../../components/LocationPromptModal'
import { getSavedAddresses, SavedAddress } from '../../lib/savedAddresses'
import AsyncStorage from '@react-native-async-storage/async-storage'

const ADDR_KEY = '@reelmart_default_address_id'
import { colors, radius, spacing } from '../../constants/theme'
import { useAuthStore } from '../../store/authStore'
import { useCartStore } from '../../store/cartStore'
import {
  getAllTopRated, getAllNewStores, getAllStoresByCategory, getFollowedStores,
  search, CATEGORIES, StoreCard,
} from '../../services/discoveryService'

const { width } = Dimensions.get('window')
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
        <Text style={styles.storeRowMeta}>
          {cat?.label}{store.city ? ` · ${store.city}` : ''}
        </Text>
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
  const [categoryStores, setCategoryStores] = useState<StoreCard[]>([])
  const [filtered, setFiltered] = useState<StoreCard[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [clothingStores, setClothingStores] = useState<StoreCard[]>([])
  const [jewelleryStores, setJewelleryStores] = useState<StoreCard[]>([])
  const [beautyStores, setBeautyStores] = useState<StoreCard[]>([])
  const [searching, setSearching] = useState(false)

  const loadHome = useCallback(async () => {
    try {
      const [tr, ns, fw, cl, jw, bt] = await Promise.all([
        getAllTopRated().catch(() => []),
        getAllNewStores().catch(() => []),
        session?.user ? getFollowedStores(session.user.id).catch(() => []) : Promise.resolve([]),
        getAllStoresByCategory('clothing').catch(() => []),
        getAllStoresByCategory('jewellery').catch(() => []),
        getAllStoresByCategory('beauty').catch(() => []),
      ])
      setTopRated(tr)
      setNewStores(ns)
      setFollowed(fw)
      setClothingStores(cl)
      setJewelleryStores(jw)
      setBeautyStores(bt)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [session?.user?.id])

  useEffect(() => { if (session?.user) fetchCart(session.user.id) }, [session?.user?.id])
  useEffect(() => { setLoading(true); loadHome() }, [loadHome])

  // Load stores when category is selected
  useEffect(() => {
    if (!selectedCategory) { setCategoryStores([]); return }
    getAllStoresByCategory(selectedCategory).then(setCategoryStores)
  }, [selectedCategory])

  // Search
  useEffect(() => {
    if (!searchQuery.trim()) { setFiltered([]); setSearching(false); return }
    setSearching(true)
    const timer = setTimeout(async () => {
      const res = await search(searchQuery, city)
      setFiltered(res.stores)
      setSearching(false)
    }, 400)
    return () => clearTimeout(timer)
  }, [searchQuery])

  async function refreshDefaultAddress() {
    const [addrs, savedId] = await Promise.all([
      getSavedAddresses(),
      AsyncStorage.getItem(ADDR_KEY),
    ])
    const match = (savedId ? addrs.find(a => a.id === savedId) : null) ?? addrs[0] ?? null
    setDefaultAddress(match)
  }

  useEffect(() => { refreshDefaultAddress() }, [])

  const goToStore = (slug: string) => navigation.navigate('Storefront', { slug })
  const showSearch = !!searchQuery.trim()
  const showCategoryFeed = !!selectedCategory && !showSearch

  return (
    <View style={styles.container}>
      <LocationPromptModal
        visible={locationModalVisible}
        onClose={() => { setLocationModalVisible(false); refreshDefaultAddress() }}
        onCitySet={detectedCity => setCity(detectedCity)}
      />

      {/* Hero Header */}
      <View style={styles.hero}>

        {/* Logo centered */}
        <TouchableOpacity
          style={styles.heroTopRow}
          onPress={() => { setSearchQuery(''); setSelectedCategory(null) }}
          activeOpacity={0.85}
        >
          <Image source={require('../../../assets/logo.png')} style={styles.heroLogo} resizeMode="cover" />
        </TouchableOpacity>

        {/* Categories under logo */}
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.heroCategoryContent}
          style={styles.heroCategoryScroll}
        >
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

        {/* Search bar */}
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search stores or products..."
            placeholderTextColor="#AAAAAA"
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
            <View style={{ flex: 1 }}>
              <Text style={styles.addressText} numberOfLines={1} ellipsizeMode="tail">
                {[defaultAddress.line1, defaultAddress.area, defaultAddress.city, defaultAddress.state, defaultAddress.pincode].filter(Boolean).join(', ')}
              </Text>
            </View>
          ) : (
            <Text style={[styles.addressText, styles.addressPlaceholder]}>Set your address</Text>
          )}
          <Text style={styles.addressChevron}>▾</Text>
        </TouchableOpacity>
      </View>


      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
      ) : showSearch ? (
        /* Search results */
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
      ) : showCategoryFeed ? (
        /* Category feed */
        <ScrollView contentContainerStyle={styles.body}>
          {categoryStores.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>{CATEGORIES.find(c => c.id === selectedCategory)?.icon ?? '🏪'}</Text>
              <Text style={styles.emptyText}>No stores in this category yet</Text>
              <Text style={styles.emptySubText}>Check back soon!</Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionTitle}>
                {CATEGORIES.find(c => c.id === selectedCategory)?.icon} {CATEGORIES.find(c => c.id === selectedCategory)?.label} ({categoryStores.length})
              </Text>
              {categoryStores.map(s => <StoreRow key={s.id} store={s} onPress={() => goToStore(s.store_slug)} />)}
            </>
          )}
        </ScrollView>
      ) : (
        /* Home feed — all categories */
        <ScrollView
          contentContainerStyle={styles.body}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadHome() }} tintColor={colors.primary} />}
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
              <Text style={styles.sectionTitle}>⭐ Top Rated</Text>
              {topRated.slice(0, 5).map(s => <StoreRow key={s.id} store={s} onPress={() => goToStore(s.store_slug)} />)}
            </View>
          )}

          {/* New stores */}
          {newStores.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🆕 New Arrivals</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipRow}>
                  {newStores.map(s => <StoreChip key={s.id} store={s} onPress={() => goToStore(s.store_slug)} />)}
                </View>
              </ScrollView>
            </View>
          )}

          {/* Clothing Seller Group — Orange */}
          {clothingStores.length > 0 && (
            <View style={[styles.section, styles.groupOrange]}>
              <View style={styles.sectionHeader}>
                <View style={styles.groupBadge}>
                  <Text style={styles.groupBadgeText}>👗 Clothing Sellers</Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedCategory('clothing')}>
                  <Text style={styles.groupSeeAll}>See all →</Text>
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipRow}>
                  {clothingStores.map(s => <StoreChip key={s.id} store={s} onPress={() => goToStore(s.store_slug)} />)}
                </View>
              </ScrollView>
            </View>
          )}

          {/* Jewellery Seller Group — Green */}
          {jewelleryStores.length > 0 && (
            <View style={[styles.section, styles.groupGreen]}>
              <View style={styles.sectionHeader}>
                <View style={styles.groupBadge}>
                  <Text style={styles.groupBadgeText}>💍 Jewellery Sellers</Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedCategory('jewellery')}>
                  <Text style={styles.groupSeeAll}>See all →</Text>
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipRow}>
                  {jewelleryStores.map(s => <StoreChip key={s.id} store={s} onPress={() => goToStore(s.store_slug)} />)}
                </View>
              </ScrollView>
            </View>
          )}

          {/* Beauty Seller Group — Blue */}
          {beautyStores.length > 0 && (
            <View style={[styles.section, styles.groupBlue]}>
              <View style={styles.sectionHeader}>
                <View style={styles.groupBadge}>
                  <Text style={styles.groupBadgeText}>💄 Beauty Sellers</Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedCategory('beauty')}>
                  <Text style={styles.groupSeeAll}>See all →</Text>
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipRow}>
                  {beautyStores.map(s => <StoreChip key={s.id} store={s} onPress={() => goToStore(s.store_slug)} />)}
                </View>
              </ScrollView>
            </View>
          )}

          {/* Other category sections */}
          {CATEGORIES.filter(c => !['clothing','jewellery','beauty'].includes(c.id)).map(cat => {
            const catStores = topRated.filter(s => s.category === cat.id)
            if (catStores.length === 0) return null
            return (
              <View key={cat.id} style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>{cat.icon} {cat.label}</Text>
                  <TouchableOpacity onPress={() => setSelectedCategory(cat.id)}>
                    <Text style={styles.sectionSeeAll}>See all →</Text>
                  </TouchableOpacity>
                </View>
                {catStores.slice(0, 3).map(s => <StoreRow key={s.id} store={s} onPress={() => goToStore(s.store_slug)} />)}
              </View>
            )
          })}

          {topRated.length === 0 && newStores.length === 0 && (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🏪</Text>
              <Text style={styles.emptyText}>No stores yet</Text>
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

  hero: {
    backgroundColor: colors.white,
    paddingTop: 54, paddingBottom: 14,
    paddingHorizontal: 0,
  },
  heroTopRow: {
    alignItems: 'center',
    marginBottom: 14,
  },
  heroLogoCard: {},
  heroLogo: {
    width: 100, height: 100, borderRadius: 50,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, elevation: 5,
  },

  heroCategoryScroll: { marginBottom: 14 },
  heroCategoryContent: { gap: 8, paddingHorizontal: 2 },

  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md, height: 46,
    marginHorizontal: spacing.lg,
  },
  searchIcon: { fontSize: 16, marginRight: spacing.xs },
  searchInput: { flex: 1, fontSize: 15, color: '#1A1A1A' },
  searchClear: { fontSize: 14, color: '#AAAAAA', paddingLeft: spacing.xs },

  addressBar: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#F3F4F6',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
    marginTop: 8, marginHorizontal: spacing.lg,
  },
  addressPin: { fontSize: 11 },
  addressText: { fontSize: 11, fontWeight: '600', color: '#1A1A1A', lineHeight: 16 },
  addressPlaceholder: { color: 'rgba(0,0,0,0.45)', fontWeight: '500' },
  addressChevron: { fontSize: 10, color: 'rgba(0,0,0,0.45)' },

  categoryScroll: { flexGrow: 0, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  categoryContent: { paddingHorizontal: spacing.lg, paddingVertical: 12, gap: spacing.xs },

  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 9,
    borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.white, marginRight: spacing.xs,
  },
  catChipActive: { borderColor: colors.primary, backgroundColor: '#FFF0E9' },
  catIcon: { fontSize: 22 },
  catLabel: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  catLabelActive: { color: colors.primary },

  body: { padding: spacing.md, paddingBottom: 40 },
  section: { marginBottom: spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center' },

  groupOrange: { backgroundColor: '#FF6B2B', borderRadius: 16, padding: 14, marginBottom: 16 },
  groupGreen:  { backgroundColor: '#1A6B5A', borderRadius: 16, padding: 14, marginBottom: 16 },
  groupBlue:   { backgroundColor: '#1E4DA0', borderRadius: 16, padding: 14, marginBottom: 16 },
  groupBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  groupBadgeText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  groupSeeAll: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  sectionTitle: {
    fontSize: 16, fontWeight: '800', color: colors.textPrimary,
    marginBottom: spacing.sm, letterSpacing: -0.3,
  },
  sectionSeeAll: { fontSize: 13, fontWeight: '600', color: colors.primary },
  chipRow: { flexDirection: 'row', gap: spacing.sm },

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

  empty: { alignItems: 'center', paddingVertical: 70 },
  emptyIcon: { fontSize: 52, marginBottom: spacing.md },
  emptyText: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  emptySubText: { fontSize: 13, color: colors.textMuted, marginTop: 6 },
})
