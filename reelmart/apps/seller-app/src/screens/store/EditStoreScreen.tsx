import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, Switch,
  StyleSheet, ScrollView, ActivityIndicator, Alert,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useSellerStore } from '../../store/sellerStore'
import { colors, radius, spacing } from '../../constants/theme'
import { getStoreUrl } from '../../services/storeService'

type Props = { navigation: NativeStackNavigationProp<any> }

export default function EditStoreScreen({ navigation }: Props) {
  const { store, updateStore } = useSellerStore()
  const [storeName, setStoreName] = useState(store?.store_name ?? '')
  const [description, setDescription] = useState(store?.description ?? '')
  const [city, setCity] = useState(store?.city ?? '')
  const [area, setArea] = useState(store?.area ?? '')
  const [whatsapp, setWhatsapp] = useState(store?.whatsapp_number ?? '')
  const [isOpen, setIsOpen] = useState(store?.is_open ?? true)
  const [loading, setLoading] = useState(false)

  async function handleSave() {
    if (storeName.trim().length < 3) {
      Alert.alert('Invalid name', 'Store name must be at least 3 characters.')
      return
    }
    setLoading(true)
    const { error } = await updateStore({
      store_name: storeName.trim(),
      description: description.trim() || null,
      city: city.trim(),
      area: area.trim() || null,
      whatsapp_number: whatsapp.trim() || null,
      is_open: isOpen,
    })
    setLoading(false)
    if (error) {
      Alert.alert('Error', error)
    } else {
      Alert.alert('Saved', 'Store details updated successfully.')
    }
  }

  if (!store) return null

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.inner}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Edit Store</Text>
        {loading
          ? <ActivityIndicator size="small" color={colors.primary} />
          : <TouchableOpacity onPress={handleSave}><Text style={styles.saveBtn}>Save</Text></TouchableOpacity>
        }
      </View>
      <View style={styles.urlCard}>
        <Text style={styles.urlLabel}>Your store link</Text>
        <Text style={styles.url}>{getStoreUrl(store.store_slug)}</Text>
      </View>

      <View style={styles.openRow}>
        <View>
          <Text style={styles.openLabel}>Store is {isOpen ? 'Open' : 'Closed'}</Text>
          <Text style={styles.openSub}>
            {isOpen ? 'Buyers can place orders' : 'Orders paused'}
          </Text>
        </View>
        <Switch
          value={isOpen}
          onValueChange={setIsOpen}
          trackColor={{ false: colors.border, true: '#FFD5BE' }}
          thumbColor={isOpen ? colors.primary : colors.textMuted}
        />
      </View>

      <Text style={styles.label}>Store Name</Text>
      <TextInput
        style={styles.input}
        value={storeName}
        onChangeText={setStoreName}
        maxLength={40}
      />

      <Text style={styles.label}>Description (optional)</Text>
      <TextInput
        style={[styles.input, styles.textarea]}
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={3}
        maxLength={200}
        placeholder="Tell buyers what you sell..."
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.label}>City</Text>
      <TextInput
        style={styles.input}
        value={city}
        onChangeText={setCity}
      />

      <Text style={styles.label}>Area / Locality (optional)</Text>
      <TextInput
        style={styles.input}
        value={area}
        onChangeText={setArea}
      />

      <Text style={styles.label}>WhatsApp Number (optional)</Text>
      <TextInput
        style={styles.input}
        value={whatsapp}
        onChangeText={setWhatsapp}
        keyboardType="number-pad"
        maxLength={10}
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={loading}
        activeOpacity={0.85}
      >
        {loading
          ? <ActivityIndicator color={colors.white} />
          : <Text style={styles.buttonText}>Save Changes</Text>
        }
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  inner: { padding: spacing.lg, paddingBottom: 40 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: spacing.md, marginBottom: spacing.lg,
  },
  back: { fontSize: 16, color: colors.primary, fontWeight: '600' },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  saveBtn: { fontSize: 16, color: colors.primary, fontWeight: '700' },
  urlCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.xl,
    borderWidth: 1, borderColor: colors.border,
  },
  urlLabel: { fontSize: 12, color: colors.textMuted, marginBottom: 4, fontWeight: '500' },
  url: { fontSize: 15, fontWeight: '700', color: colors.primary },
  openRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.xl,
    borderWidth: 1, borderColor: colors.border,
  },
  openLabel: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  openSub: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  label: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: spacing.xs },
  input: {
    borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: spacing.md,
    height: 52, fontSize: 16, color: colors.textPrimary, marginBottom: spacing.md,
  },
  textarea: { height: 90, paddingTop: spacing.sm, textAlignVertical: 'top' },
  button: {
    backgroundColor: colors.primary, borderRadius: radius.pill,
    height: 52, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
})
