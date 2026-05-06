import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { colors, radius, spacing } from '../../constants/theme'
import { getSavedAddresses, removeAddress, SavedAddress } from '../../lib/savedAddresses'
import AsyncStorage from '@react-native-async-storage/async-storage'

const CITY_KEY = '@reelmart_city'

type Props = { navigation: NativeStackNavigationProp<any> }

function AddressCard({
  address, isDefault, onSetDefault, onDelete,
}: {
  address: SavedAddress; isDefault: boolean
  onSetDefault: () => void; onDelete: () => void
}) {
  return (
    <View style={[styles.card, isDefault && styles.cardDefault]}>
      <View style={styles.cardTop}>
        <View style={styles.labelBadge}>
          <Text style={styles.labelText}>{address.label || 'Home'}</Text>
        </View>
        {isDefault && (
          <View style={styles.defaultBadge}>
            <Text style={styles.defaultBadgeText}>Default</Text>
          </View>
        )}
      </View>

      {address.name ? (
        <Text style={styles.addrName}>{address.name}{address.phone ? ` · ${address.phone}` : ''}</Text>
      ) : null}
      {address.line1 ? <Text style={styles.addrLine}>{address.line1}</Text> : null}
      <Text style={styles.addrLine}>
        {[address.area, address.city].filter(Boolean).join(', ')}
      </Text>
      {(address.state || address.pincode) ? (
        <Text style={styles.addrLine}>
          {[address.state, address.pincode].filter(Boolean).join(' – ')}
        </Text>
      ) : null}

      <View style={styles.actions}>
        {!isDefault && (
          <TouchableOpacity style={styles.actionBtn} onPress={onSetDefault}>
            <Text style={styles.actionBtnText}>Set Default</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDelete]} onPress={onDelete}>
          <Text style={[styles.actionBtnText, styles.actionBtnDeleteText]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

export default function AddressesScreen({ navigation }: Props) {
  const [addresses, setAddresses] = useState<SavedAddress[]>([])
  const [defaultCity, setDefaultCity] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [addrs, city] = await Promise.all([
      getSavedAddresses(),
      AsyncStorage.getItem(CITY_KEY),
    ])
    setAddresses(addrs)
    setDefaultCity(city)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [])

  async function handleSetDefault(addr: SavedAddress) {
    await AsyncStorage.setItem(CITY_KEY, addr.city)
    setDefaultCity(addr.city)
  }

  async function handleDelete(id: string) {
    Alert.alert('Delete address?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const updated = await removeAddress(id)
          setAddresses(updated)
          if (updated.length > 0 && defaultCity === addresses.find(a => a.id === id)?.city) {
            await AsyncStorage.setItem(CITY_KEY, updated[0].city)
            setDefaultCity(updated[0].city)
          }
        },
      },
    ])
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Saved Addresses</Text>
        <View style={{ width: 48 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
      ) : addresses.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📍</Text>
          <Text style={styles.emptyTitle}>No saved addresses</Text>
          <Text style={styles.emptySub}>Add an address from the home screen or during checkout</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {addresses.map(addr => (
            <AddressCard
              key={addr.id}
              address={addr}
              isDefault={addr.city === defaultCity}
              onSetDefault={() => handleSetDefault(addr)}
              onDelete={() => handleDelete(addr.id)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F7' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: 56, paddingBottom: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  back: { fontSize: 16, color: colors.primary, fontWeight: '600', width: 48 },
  title: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },

  body: { padding: spacing.md, paddingBottom: 40 },

  card: {
    backgroundColor: colors.white, borderRadius: 16,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1.5, borderColor: '#EEEEEE',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  cardDefault: { borderColor: colors.primary },

  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  labelBadge: {
    backgroundColor: '#F3F4F6', borderRadius: radius.pill,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  labelText: { fontSize: 12, fontWeight: '700', color: '#555555' },
  defaultBadge: {
    backgroundColor: '#FFF0E9', borderRadius: radius.pill,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  defaultBadgeText: { fontSize: 12, fontWeight: '700', color: colors.primary },

  addrName: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  addrLine: { fontSize: 13, color: '#666666', lineHeight: 20 },

  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: 12 },
  actionBtn: {
    paddingHorizontal: 16, paddingVertical: 6,
    borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.border,
  },
  actionBtnText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  actionBtnDelete: { borderColor: '#FCA5A5' },
  actionBtnDeleteText: { color: '#EF4444' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon: { fontSize: 52, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary, marginBottom: 8 },
  emptySub: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
})
