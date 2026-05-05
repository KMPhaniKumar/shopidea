import React, { useEffect, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Alert, ScrollView,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RouteProp } from '@react-navigation/native'
import { colors, radius, spacing } from '../../constants/theme'
import { useAuthStore } from '../../store/authStore'
import {
  getSavedAddresses, saveAddress, deleteAddress, setDefaultAddress, SavedAddress,
} from '../../services/profileService'
import { PickedLocation } from '../shared/LocationPickerScreen'

type Props = {
  navigation: NativeStackNavigationProp<any>
  route: RouteProp<{ Addresses: { pickedLocation?: PickedLocation } }, 'Addresses'>
}

const LABELS = ['Home', 'Work', 'Other']

function AddressCard({ address, onSetDefault, onDelete }: {
  address: SavedAddress
  onSetDefault: () => void
  onDelete: () => void
}) {
  return (
    <View style={[styles.addressCard, address.is_default && styles.addressCardDefault]}>
      <View style={styles.addressCardHeader}>
        <View style={styles.labelBadge}>
          <Text style={styles.labelText}>{address.label}</Text>
        </View>
        {address.is_default && (
          <View style={styles.defaultBadge}>
            <Text style={styles.defaultBadgeText}>Default</Text>
          </View>
        )}
      </View>
      <Text style={styles.addressName}>{address.name} · {address.phone}</Text>
      <Text style={styles.addressLine}>{address.line1}</Text>
      <Text style={styles.addressLine}>{address.city}, {address.state} – {address.pincode}</Text>
      <View style={styles.addressActions}>
        {!address.is_default && (
          <TouchableOpacity onPress={onSetDefault} style={styles.actionBtn}>
            <Text style={styles.actionBtnText}>Set Default</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={onDelete} style={[styles.actionBtn, styles.actionBtnDelete]}>
          <Text style={[styles.actionBtnText, styles.actionBtnDeleteText]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

function ConfirmAddressForm({
  picked,
  onSave,
  onBack,
}: {
  picked: PickedLocation
  onSave: (data: any) => void
  onBack: () => void
}) {
  const [label, setLabel] = useState('Home')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [line1, setLine1] = useState(picked.line1 || '')
  const [isDefault, setIsDefault] = useState(false)

  function handleSubmit() {
    if (!name.trim() || !phone.trim() || !line1.trim()) {
      Alert.alert('Missing fields', 'Please fill in name, phone and address line 1')
      return
    }
    if (!/^[6-9]\d{9}$/.test(phone)) { Alert.alert('Invalid phone', 'Enter a valid 10-digit Indian phone'); return }
    onSave({ label, name, phone, line1, city: picked.city, state: picked.state, pincode: picked.pincode, isDefault })
  }

  const Field = ({ label: l, value, onChange, kb, max, placeholder }: any) => (
    <View style={{ marginBottom: spacing.sm }}>
      <Text style={styles.fieldLabel}>{l}</Text>
      <TextInput
        style={styles.fieldInput}
        value={value}
        onChangeText={onChange}
        keyboardType={kb ?? 'default'}
        maxLength={max}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
      />
    </View>
  )

  return (
    <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
      <Text style={styles.formTitle}>Confirm Address</Text>

      {/* Selected address preview */}
      <View style={styles.pickedPreview}>
        <Text style={styles.pickedPreviewIcon}>📍</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.pickedPreviewArea} numberOfLines={1}>
            {[picked.area, picked.city].filter(Boolean).join(', ')}
          </Text>
          <Text style={styles.pickedPreviewState} numberOfLines={1}>
            {[picked.state, picked.pincode].filter(Boolean).join(' – ')}
          </Text>
        </View>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.changeLink}>Change</Text>
        </TouchableOpacity>
      </View>

      {/* Label picker */}
      <View style={styles.labelRow}>
        {LABELS.map(l => (
          <TouchableOpacity
            key={l}
            style={[styles.labelChip, label === l && styles.labelChipActive]}
            onPress={() => setLabel(l)}
          >
            <Text style={[styles.labelChipText, label === l && styles.labelChipTextActive]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Field l="Recipient Name *" value={name} onChange={setName} placeholder="Enter full name" />
      <Field l="Phone *" value={phone} onChange={setPhone} kb="number-pad" max={10} placeholder="10-digit mobile number" />
      <Field l="Address Line 1 *" value={line1} onChange={setLine1} placeholder="Flat/House No, Street" />

      <TouchableOpacity style={styles.defaultToggle} onPress={() => setIsDefault(v => !v)}>
        <View style={[styles.checkbox, isDefault && styles.checkboxActive]}>
          {isDefault && <Text style={styles.checkboxTick}>✓</Text>}
        </View>
        <Text style={styles.defaultToggleText}>Set as default address</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.saveBtn} onPress={handleSubmit}>
        <Text style={styles.saveBtnText}>Save Address</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.cancelBtn} onPress={onBack}>
        <Text style={styles.cancelBtnText}>← Back to map</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

export default function AddressesScreen({ navigation, route }: Props) {
  const session = useAuthStore(s => s.session)
  const [addresses, setAddresses] = useState<SavedAddress[]>([])
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState<PickedLocation | null>(null)

  // Receive picked location from map picker
  const pickedLocation = route.params?.pickedLocation
  useEffect(() => {
    if (pickedLocation) {
      setConfirming(pickedLocation)
      navigation.setParams({ pickedLocation: undefined })
    }
  }, [pickedLocation])

  async function load() {
    if (!session?.user) return
    const data = await getSavedAddresses(session.user.id)
    setAddresses(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [session?.user?.id])

  async function handleSave(data: any) {
    if (!session?.user) return
    await saveAddress(session.user.id, data)
    setConfirming(null)
    load()
  }

  async function handleDelete(addressId: string) {
    if (!session?.user) return
    Alert.alert('Delete address?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await deleteAddress(addressId, session.user.id)
          load()
        },
      },
    ])
  }

  async function handleSetDefault(addressId: string) {
    if (!session?.user) return
    await setDefaultAddress(addressId, session.user.id)
    load()
  }

  function openMapPicker() {
    navigation.navigate('LocationPicker', { callbackScreen: 'Addresses' })
  }

  if (confirming) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setConfirming(null)}>
            <Text style={styles.back}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Add Address</Text>
          <View style={{ width: 48 }} />
        </View>
        <ConfirmAddressForm
          picked={confirming}
          onSave={handleSave}
          onBack={() => setConfirming(null)}
        />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Addresses</Text>
        <TouchableOpacity onPress={openMapPicker}>
          <Text style={styles.addBtn}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
      ) : addresses.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📍</Text>
          <Text style={styles.emptyTitle}>No saved addresses</Text>
          <Text style={styles.emptySub}>Add an address to speed up checkout</Text>
          <TouchableOpacity style={styles.emptyAddBtn} onPress={openMapPicker}>
            <Text style={styles.emptyAddBtnText}>Add Address on Map</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={addresses}
          keyExtractor={a => a.id}
          renderItem={({ item }) => (
            <AddressCard
              address={item}
              onSetDefault={() => handleSetDefault(item.id)}
              onDelete={() => handleDelete(item.id)}
            />
          )}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 40 }}
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
  addBtn: { fontSize: 15, color: colors.primary, fontWeight: '700' },
  addressCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  addressCardDefault: { borderColor: colors.primary, borderWidth: 1.5 },
  addressCardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  labelBadge: { backgroundColor: '#F3F4F6', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  labelText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  defaultBadge: { backgroundColor: '#FFF0E9', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  defaultBadgeText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  addressName: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  addressLine: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  addressActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  actionBtn: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  actionBtnText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  actionBtnDelete: { borderColor: '#FCA5A5' },
  actionBtnDeleteText: { color: colors.error },

  form: { padding: spacing.lg, paddingBottom: 40 },
  formTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.md },

  pickedPreview: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: '#F0FDF4', borderRadius: radius.md, borderWidth: 1, borderColor: '#86EFAC',
    padding: spacing.md, marginBottom: spacing.md,
  },
  pickedPreviewIcon: { fontSize: 22 },
  pickedPreviewArea: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  pickedPreviewState: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  changeLink: { fontSize: 14, fontWeight: '700', color: colors.primary },

  labelRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  labelChip: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.border },
  labelChipActive: { borderColor: colors.primary, backgroundColor: '#FFF0E9' },
  labelChipText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  labelChipTextActive: { color: colors.primary },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 },
  fieldInput: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, height: 46, fontSize: 15, color: colors.textPrimary,
  },
  defaultToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkboxTick: { color: colors.white, fontSize: 13, fontWeight: '700' },
  defaultToggleText: { fontSize: 15, color: colors.textPrimary },
  saveBtn: {
    backgroundColor: colors.primary, borderRadius: radius.pill,
    height: 52, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm,
  },
  saveBtnText: { color: colors.white, fontWeight: '700', fontSize: 16 },
  cancelBtn: { height: 44, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { fontSize: 15, color: colors.textSecondary },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyIcon: { fontSize: 52, marginBottom: spacing.md },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.xs },
  emptySub: { fontSize: 14, color: colors.textMuted, marginBottom: spacing.lg },
  emptyAddBtn: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: spacing.xl, paddingVertical: 14 },
  emptyAddBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
})
