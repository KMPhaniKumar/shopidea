import React, { useState, useEffect, useRef } from 'react'
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  Dimensions, KeyboardAvoidingView, Platform, ScrollView,
  TextInput, ActivityIndicator,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { colors, radius, spacing } from '../constants/theme'
import { getSavedAddresses, saveAddress, removeAddress, SavedAddress } from '../lib/savedAddresses'

const CITY_KEY = '@reelmart_city'
const ADDR_KEY = '@reelmart_default_address_id'
const MAPS_KEY = 'AIzaSyDtu00tuOZpIzPRASPFScWJRu1GkpaaSIU'
const { height: SCREEN_H } = Dimensions.get('window')

interface Props {
  visible: boolean
  onClose: () => void
  onCitySet: (city: string) => void
}

interface Prediction {
  place_id: string
  main_text: string
  secondary_text: string
}

interface DraftAddress {
  line1: string
  area: string
  city: string
  state: string
  pincode: string
  name: string
  phone: string
  altPhone: string
  addressType: 'Home' | 'Work'
}

const EMPTY_DRAFT: DraftAddress = {
  line1: '', area: '', city: '', state: '', pincode: '',
  name: '', phone: '', altPhone: '', addressType: 'Home',
}

function getComponent(components: any[], ...types: string[]): string {
  for (const type of types) {
    const match = components.find((c: any) => c.types.includes(type))
    if (match?.long_name) return match.long_name
  }
  return ''
}

function SimpleInput({
  placeholder, value, onChangeText, keyboardType, maxLength, autoFocus,
}: {
  placeholder: string; value: string; onChangeText: (v: string) => void
  keyboardType?: any; maxLength?: number; autoFocus?: boolean
}) {
  const [focused, setFocused] = useState(false)
  return (
    <TextInput
      style={[formStyles.input, focused && formStyles.inputFocused]}
      placeholder={placeholder}
      placeholderTextColor="#AAAAAA"
      value={value}
      onChangeText={onChangeText}
      keyboardType={keyboardType ?? 'default'}
      maxLength={maxLength}
      autoFocus={autoFocus}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  )
}

export default function LocationPromptModal({ visible, onClose, onCitySet }: Props) {
  const [savedCity, setSavedCity] = useState<string | null>(null)
  const [defaultAddrId, setDefaultAddrId] = useState<string | null>(null)
  const [addresses, setAddresses] = useState<SavedAddress[]>([])
  const [step, setStep] = useState<'search' | 'form'>('search')
  const [isManual, setIsManual] = useState(false)
  const [query, setQuery] = useState('')
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [searching, setSearching] = useState(false)
  const [draft, setDraft] = useState<DraftAddress>(EMPTY_DRAFT)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    async function init() {
      const [city, addrId, addrs] = await Promise.all([
        AsyncStorage.getItem(CITY_KEY),
        AsyncStorage.getItem(ADDR_KEY),
        getSavedAddresses(),
      ])
      if (city) { setSavedCity(city); onCitySet(city) }
      setDefaultAddrId(addrId)
      setAddresses(addrs)
    }
    init()
  }, [])

  useEffect(() => {
    if (visible) {
      getSavedAddresses().then(setAddresses)
      setStep('search')
      setIsManual(false)
      setQuery('')
      setPredictions([])
      setDraft(EMPTY_DRAFT)
    }
  }, [visible])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) { setPredictions([]); setSearching(false); return }
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&key=${MAPS_KEY}&language=en&components=country:in&types=geocode`
        const res = await fetch(url)
        const json = await res.json()
        if (json.status === 'OK') {
          setPredictions(json.predictions.map((p: any) => ({
            place_id: p.place_id,
            main_text: p.structured_formatting?.main_text ?? p.description,
            secondary_text: p.structured_formatting?.secondary_text ?? '',
          })))
        } else {
          setPredictions([])
        }
      } catch {
        setPredictions([])
      } finally {
        setSearching(false)
      }
    }, 350)
  }, [query])

  async function selectPrediction(pred: Prediction) {
    try {
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${pred.place_id}&key=${MAPS_KEY}&fields=address_components&language=en`
      const res = await fetch(url)
      const json = await res.json()
      const c = json.result?.address_components ?? []
      const area =
        getComponent(c, 'sublocality_level_1') ||
        getComponent(c, 'sublocality_level_2') ||
        getComponent(c, 'sublocality') ||
        getComponent(c, 'neighborhood') ||
        getComponent(c, 'locality')
      const city =
        getComponent(c, 'administrative_area_level_2') ||
        getComponent(c, 'locality') ||
        getComponent(c, 'administrative_area_level_1')
      const state = getComponent(c, 'administrative_area_level_1')
      const pincode = getComponent(c, 'postal_code')
      setDraft(prev => ({ ...prev, line1: '', area, city, state, pincode }))
    } catch {
      setDraft(prev => ({ ...prev, area: pred.main_text }))
    }
    setQuery('')
    setPredictions([])
    setStep('form')
  }

  async function handleSaveAddress() {
    const city = draft.city || draft.area
    const saved = await saveAddress({
      label: draft.addressType,
      line1: draft.line1,
      area: draft.area,
      city,
      state: draft.state,
      pincode: draft.pincode,
      name: draft.name,
      phone: draft.phone,
      alt_phone: draft.altPhone || null,
    })
    await Promise.all([
      AsyncStorage.setItem(CITY_KEY, city),
      AsyncStorage.setItem(ADDR_KEY, saved.id),
    ])
    setSavedCity(city)
    onCitySet(city)
    onClose()
  }

  async function pickSavedAddress(addr: SavedAddress) {
    await Promise.all([
      AsyncStorage.setItem(CITY_KEY, addr.city),
      AsyncStorage.setItem(ADDR_KEY, addr.id),
    ])
    setSavedCity(addr.city)
    setDefaultAddrId(addr.id)
    onCitySet(addr.city)
    onClose()
  }

  async function handleDeleteAddress(id: string) {
    const updated = await removeAddress(id)
    setAddresses(updated)
  }

  const areaDisplayLine1 = draft.area
  const areaDisplayLine2 = [draft.city, draft.state, draft.pincode].filter(Boolean).join(', ')

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.sheet, step === 'form' && styles.sheetTall]}>
          <View style={styles.handle} />

          {step === 'search' ? (
            <>
              {/* Header */}
              <View style={styles.header}>
                <Text style={styles.headerTitle}>Select delivery address</Text>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={styles.closeBtn}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Search box */}
              <View style={styles.searchBox}>
                <Text style={styles.searchIcon}>🔍</Text>
                <TextInput
                  style={styles.searchInput}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search for area, street name..."
                  placeholderTextColor="#AAAAAA"
                  autoCorrect={false}
                />
                {searching
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : query.length > 0
                    ? <TouchableOpacity onPress={() => setQuery('')}>
                        <Text style={styles.searchClear}>✕</Text>
                      </TouchableOpacity>
                    : null
                }
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                {/* Saved addresses */}
                {addresses.length > 0 && (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Saved addresses</Text>
                    <Text style={styles.cardSub}>From your saved list</Text>
                    {addresses.map((addr, i) => (
                      <TouchableOpacity
                        key={addr.id}
                        style={[styles.addrRow, i < addresses.length - 1 && styles.addrRowBorder]}
                        onPress={() => pickSavedAddress(addr)}
                        activeOpacity={0.75}
                      >
                        <View style={styles.addrIconBox}>
                          <Text style={{ fontSize: 22 }}>🏠</Text>
                          <Text style={styles.addrIconLabel}>
                            {addr.id === defaultAddrId ? "You're here" : addr.label || 'Saved'}
                          </Text>
                        </View>
                        <View style={styles.addrInfo}>
                          <View style={styles.addrNameRow}>
                            <Text style={styles.addrName} numberOfLines={1}>
                              {addr.name || addr.label || addr.line1}
                            </Text>
                            {addr.id === defaultAddrId && (
                              <View style={styles.selectedBadge}>
                                <Text style={styles.selectedBadgeText}>Selected</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.addrFull} numberOfLines={2}>
                            {[addr.line1, addr.area, addr.city, addr.pincode].filter(Boolean).join(', ')}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => handleDeleteAddress(addr.id)}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Text style={styles.deleteBtn}>✕</Text>
                        </TouchableOpacity>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Empty state */}
                {addresses.length === 0 && !query && (
                  <View style={styles.emptyCard}>
                    <Text style={styles.emptyIcon}>🏠</Text>
                    <Text style={styles.emptyText}>No saved addresses yet</Text>
                    <Text style={styles.emptySub}>Search above to add your default address</Text>
                  </View>
                )}

                {/* Related places */}
                {predictions.length > 0 && (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Related places</Text>
                    {predictions.map((pred, i) => (
                      <TouchableOpacity
                        key={pred.place_id}
                        style={[styles.predRow, i < predictions.length - 1 && styles.addrRowBorder]}
                        onPress={() => selectPrediction(pred)}
                        activeOpacity={0.75}
                      >
                        <View style={styles.predIconBox}>
                          <Text style={{ fontSize: 18 }}>📍</Text>
                        </View>
                        <View style={styles.addrInfo}>
                          <Text style={styles.predMain} numberOfLines={1}>{pred.main_text}</Text>
                          <Text style={styles.predSub} numberOfLines={1}>{pred.secondary_text}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Add manually option */}
                <TouchableOpacity
                  style={styles.manualBtn}
                  onPress={() => { setDraft(EMPTY_DRAFT); setIsManual(true); setStep('form') }}
                  activeOpacity={0.75}
                >
                  <Text style={styles.manualBtnIcon}>✏️</Text>
                  <View>
                    <Text style={styles.manualBtnText}>Can't find your address?</Text>
                    <Text style={styles.manualBtnSub}>Add address manually</Text>
                  </View>
                  <Text style={styles.manualBtnArrow}>›</Text>
                </TouchableOpacity>

                {savedCity && !query && (
                  <TouchableOpacity onPress={onClose} style={styles.keepBtn}>
                    <Text style={styles.keepText}>Continue with {savedCity}</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </>
          ) : (
            <>
              {/* Form header */}
              <View style={styles.header}>
                <Text style={styles.headerTitle}>Deliver To</Text>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={styles.closeBtn}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                {/* Info banner */}
                <View style={formStyles.infoBanner}>
                  <Text style={formStyles.infoIcon}>ⓘ</Text>
                  <Text style={formStyles.infoText}>
                    Ensure your address details are accurate for a smooth delivery experience
                  </Text>
                </View>

                {/* Flat / House */}
                <SimpleInput
                  placeholder="Flat / House / Building name *"
                  value={draft.line1}
                  onChangeText={v => setDraft(p => ({ ...p, line1: v }))}
                  autoFocus
                />

                {/* Area — read-only display (from Google) or editable fields (manual) */}
                {isManual ? (
                  <>
                    <SimpleInput
                      placeholder="Area / Locality *"
                      value={draft.area}
                      onChangeText={v => setDraft(p => ({ ...p, area: v }))}
                    />
                    <View style={formStyles.twoCol}>
                      <View style={{ flex: 1 }}>
                        <SimpleInput
                          placeholder="City *"
                          value={draft.city}
                          onChangeText={v => setDraft(p => ({ ...p, city: v }))}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <SimpleInput
                          placeholder="Pincode"
                          value={draft.pincode}
                          onChangeText={v => setDraft(p => ({ ...p, pincode: v }))}
                          keyboardType="numeric"
                          maxLength={6}
                        />
                      </View>
                    </View>
                    <SimpleInput
                      placeholder="State"
                      value={draft.state}
                      onChangeText={v => setDraft(p => ({ ...p, state: v }))}
                    />
                  </>
                ) : (
                  <View style={formStyles.areaBox}>
                    <View style={formStyles.areaContent}>
                      <Text style={formStyles.areaLabel}>Area / Sector / Locality</Text>
                      <Text style={formStyles.areaLine1} numberOfLines={2}>{areaDisplayLine1}</Text>
                      <Text style={formStyles.areaLine2}>{areaDisplayLine2}</Text>
                    </View>
                    <TouchableOpacity
                      style={formStyles.changeBtn}
                      onPress={() => setStep('search')}
                    >
                      <Text style={formStyles.changeBtnText}>Change</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Name */}
                <SimpleInput
                  placeholder="Enter your full name *"
                  value={draft.name}
                  onChangeText={v => setDraft(p => ({ ...p, name: v }))}
                />

                {/* Phone */}
                <SimpleInput
                  placeholder="10-digit mobile number *"
                  value={draft.phone}
                  onChangeText={v => setDraft(p => ({ ...p, phone: v }))}
                  keyboardType="phone-pad"
                  maxLength={10}
                />

                {/* Alternate phone */}
                <SimpleInput
                  placeholder="Alternate phone number (Optional)"
                  value={draft.altPhone}
                  onChangeText={v => setDraft(p => ({ ...p, altPhone: v }))}
                  keyboardType="phone-pad"
                  maxLength={10}
                />

                {/* Address type */}
                <Text style={formStyles.typeLabel}>Type of address</Text>
                <View style={formStyles.typeRow}>
                  {(['Home', 'Work'] as const).map(type => (
                    <TouchableOpacity
                      key={type}
                      style={[formStyles.typeBtn, draft.addressType === type && formStyles.typeBtnActive]}
                      onPress={() => setDraft(p => ({ ...p, addressType: type }))}
                    >
                      <Text style={formStyles.typeIcon}>{type === 'Home' ? '🏠' : '🏢'}</Text>
                      <Text style={[formStyles.typeBtnText, draft.addressType === type && formStyles.typeBtnTextActive]}>
                        {type}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Save button */}
                <TouchableOpacity
                  style={[formStyles.saveBtn, !(draft.city || draft.area) && formStyles.saveBtnDisabled]}
                  onPress={handleSaveAddress}
                  disabled={!(draft.city || draft.area)}
                  activeOpacity={0.88}
                >
                  <Text style={formStyles.saveBtnText}>Save address</Text>
                </TouchableOpacity>

              </ScrollView>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const formStyles = StyleSheet.create({
  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#FFF8EE', borderRadius: 12,
    padding: 14, marginBottom: 16,
    borderWidth: 1, borderColor: '#FFE0B2',
  },
  infoIcon: { fontSize: 16, color: colors.primary },
  infoText: { flex: 1, fontSize: 13, color: colors.primary, lineHeight: 20 },

  input: {
    borderWidth: 1.5, borderColor: '#E5E5E5',
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 14, color: '#1A1A1A', marginBottom: 12,
    backgroundColor: '#FFFFFF',
  },
  inputFocused: { borderColor: colors.primary },

  areaBox: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#E5E5E5',
    borderRadius: 12, padding: 14, marginBottom: 12,
    backgroundColor: '#F8F8F8', gap: 12,
  },
  areaContent: { flex: 1 },
  areaLabel: { fontSize: 11, fontWeight: '700', color: '#AAAAAA', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  areaLine1: { fontSize: 13, color: '#444444', lineHeight: 19 },
  areaLine2: { fontSize: 13, fontWeight: '800', color: '#1A1A1A', marginTop: 2 },
  changeBtn: {
    borderWidth: 1.5, borderColor: colors.primary,
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7,
  },
  changeBtnText: { fontSize: 13, fontWeight: '700', color: colors.primary },

  typeLabel: { fontSize: 13, fontWeight: '600', color: '#555555', marginBottom: 10 },
  typeRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  typeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: '#E5E5E5',
    borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  typeBtnActive: { borderColor: colors.primary, backgroundColor: '#FFF0E9' },
  typeIcon: { fontSize: 16 },
  typeBtnText: { fontSize: 14, fontWeight: '600', color: '#666666' },
  typeBtnTextActive: { color: colors.primary },

  twoCol: { flexDirection: 'row', gap: 10 },

  saveBtn: {
    backgroundColor: '#3355FF',
    borderRadius: 14, paddingVertical: 17,
    alignItems: 'center', marginBottom: 16,
  },
  saveBtnDisabled: { backgroundColor: '#CCCCCC' },
  saveBtnText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
})

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: spacing.lg,
    paddingBottom: 40, paddingTop: 16,
    maxHeight: SCREEN_H * 0.88,
  },
  sheetTall: { maxHeight: SCREEN_H * 0.94 },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#E0E0E0', alignSelf: 'center', marginBottom: 16,
  },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 16,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#1A1A1A' },
  closeBtn: { fontSize: 18, color: '#888888', fontWeight: '600' },

  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#E0E0E0', borderRadius: 14,
    paddingHorizontal: 14, height: 52,
    backgroundColor: '#FAFAFA', marginBottom: 16, gap: 10,
  },
  searchIcon: { fontSize: 16 },
  searchInput: { flex: 1, fontSize: 15, color: '#1A1A1A' },
  searchClear: { fontSize: 15, color: '#AAAAAA' },

  card: {
    backgroundColor: '#FFFFFF', borderRadius: 16,
    borderWidth: 1, borderColor: '#F0F0F0', marginBottom: 14,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
    overflow: 'hidden',
  },
  cardTitle: {
    fontSize: 15, fontWeight: '800', color: '#1A1A1A',
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 2,
  },
  cardSub: { fontSize: 12, color: '#AAAAAA', paddingHorizontal: 16, paddingBottom: 10 },

  addrRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  addrRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  addrIconBox: {
    width: 56, height: 56, borderRadius: 12, backgroundColor: '#EDF4FF',
    alignItems: 'center', justifyContent: 'center',
  },
  addrIconLabel: { fontSize: 9, color: '#4A90D9', fontWeight: '700', marginTop: 2 },
  addrInfo: { flex: 1 },
  addrNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  addrName: { fontSize: 14, fontWeight: '800', color: '#1A1A1A', flex: 1 },
  selectedBadge: {
    backgroundColor: '#EBF4FF', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2,
  },
  selectedBadgeText: { fontSize: 11, fontWeight: '700', color: '#2D7DD2' },
  addrFull: { fontSize: 12, color: '#888888', lineHeight: 18 },
  deleteBtn: { fontSize: 14, color: '#CCCCCC', paddingLeft: 8 },

  predRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  predIconBox: {
    width: 48, height: 48, borderRadius: 12, backgroundColor: '#F5F5F5',
    alignItems: 'center', justifyContent: 'center',
  },
  predMain: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', marginBottom: 2 },
  predSub: { fontSize: 12, color: '#888888' },

  emptyCard: {
    alignItems: 'center', paddingVertical: 32,
    backgroundColor: '#FAFAFA', borderRadius: 16,
    borderWidth: 1, borderColor: '#F0F0F0', marginBottom: 14,
  },
  emptyIcon: { fontSize: 36, marginBottom: 10 },
  emptyText: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', marginBottom: 4 },
  emptySub: { fontSize: 13, color: '#AAAAAA', textAlign: 'center' },

  manualBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1.5, borderColor: '#E5E5E5', borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#FAFAFA', marginBottom: 14,
  },
  manualBtnIcon: { fontSize: 20 },
  manualBtnText: { fontSize: 13, fontWeight: '700', color: '#1A1A1A' },
  manualBtnSub: { fontSize: 12, color: '#AAAAAA', marginTop: 1 },
  manualBtnArrow: { fontSize: 22, color: '#CCCCCC', marginLeft: 'auto' as any },

  keepBtn: {
    alignSelf: 'center', marginTop: 4, marginBottom: 8,
    paddingVertical: 10, paddingHorizontal: 24,
    borderRadius: radius.pill, backgroundColor: '#F5F5F7',
  },
  keepText: { fontSize: 13, fontWeight: '700', color: '#555555' },
})
