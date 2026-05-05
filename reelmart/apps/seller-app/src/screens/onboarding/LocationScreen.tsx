import React, { useEffect, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, Alert,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RouteProp } from '@react-navigation/native'
import { colors, radius, spacing } from '../../constants/theme'
import { OnboardingStackParamList } from '../../navigation/types'

type Props = {
  navigation: NativeStackNavigationProp<OnboardingStackParamList, 'Location'>
  route: RouteProp<OnboardingStackParamList, 'Location'>
}

const CITIES = [
  'Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai',
  'Kolkata', 'Pune', 'Ahmedabad', 'Jaipur', 'Surat',
  'Lucknow', 'Kanpur', 'Nagpur', 'Indore', 'Bhopal',
]

export default function LocationScreen({ navigation, route }: Props) {
  const { storeName, category } = route.params
  const pickedLocation = route.params?.pickedLocation

  const [city, setCity] = useState('')
  const [area, setArea] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [citySuggestions, setCitySuggestions] = useState<string[]>([])
  const [pickedLatLng, setPickedLatLng] = useState<{ latitude: number; longitude: number } | null>(null)

  // Apply returned location from map picker
  useEffect(() => {
    if (pickedLocation) {
      setCity(pickedLocation.city || '')
      setArea(pickedLocation.area || '')
      setPickedLatLng({ latitude: pickedLocation.latitude, longitude: pickedLocation.longitude })
      setCitySuggestions([])
      // clear the param so re-navigating back doesn't re-apply
      navigation.setParams({ pickedLocation: undefined })
    }
  }, [pickedLocation])

  function onCityChange(text: string) {
    setCity(text)
    setPickedLatLng(null)
    if (text.length >= 2) {
      setCitySuggestions(
        CITIES.filter(c => c.toLowerCase().startsWith(text.toLowerCase())).slice(0, 4)
      )
    } else {
      setCitySuggestions([])
    }
  }

  function handleContinue() {
    if (city.trim().length < 2) {
      Alert.alert('Enter city', 'Please enter your city.')
      return
    }
    navigation.navigate('Logo', {
      storeName,
      category,
      city: city.trim(),
      area: area.trim() || undefined,
      whatsappNumber: whatsapp.trim() || undefined,
      latitude: pickedLatLng?.latitude,
      longitude: pickedLatLng?.longitude,
    })
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.stepRow}>
          {[0,1,2,3].map(i => (
            <View key={i} style={[styles.step, i <= 2 && styles.stepActive]} />
          ))}
        </View>

        <Text style={styles.heading}>Where is your store?</Text>
        <Text style={styles.sub}>Buyers nearby will discover you first</Text>

        {/* Map picker button */}
        <TouchableOpacity
          style={styles.mapPickerBtn}
          onPress={() => navigation.navigate('LocationPicker', { callbackScreen: 'Location' })}
        >
          <Text style={styles.mapPickerIcon}>🗺️</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.mapPickerLabel}>
              {pickedLatLng ? 'Location pinned on map ✓' : 'Pick on map'}
            </Text>
            <Text style={styles.mapPickerSub}>
              {pickedLatLng
                ? `${[area, city].filter(Boolean).join(', ')}`
                : 'Tap to open Google Maps and pin your store location'}
            </Text>
          </View>
          <Text style={styles.mapPickerArrow}>›</Text>
        </TouchableOpacity>

        <Text style={styles.orDividerText}>— or type manually —</Text>

        <Text style={styles.label}>City *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Mumbai"
          placeholderTextColor={colors.textMuted}
          value={city}
          onChangeText={onCityChange}
        />
        {citySuggestions.length > 0 && (
          <View style={styles.suggestions}>
            {citySuggestions.map(c => (
              <TouchableOpacity
                key={c}
                style={styles.suggestion}
                onPress={() => { setCity(c); setCitySuggestions([]) }}
              >
                <Text style={styles.suggestionText}>📍 {c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={styles.label}>Area / Locality (optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Bandra West"
          placeholderTextColor={colors.textMuted}
          value={area}
          onChangeText={setArea}
        />

        <Text style={styles.label}>WhatsApp Number (optional)</Text>
        <View style={styles.phoneRow}>
          <View style={styles.prefixBox}>
            <Text style={styles.prefix}>+91</Text>
          </View>
          <TextInput
            style={[styles.input, styles.phoneInput]}
            placeholder="98765 43210"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            maxLength={10}
            value={whatsapp}
            onChangeText={setWhatsapp}
          />
        </View>
        <Text style={styles.hint}>Buyers can message you directly on WhatsApp</Text>

        <TouchableOpacity
          style={[styles.button, city.trim().length < 2 && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={city.trim().length < 2}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>Continue →</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  inner: { padding: spacing.lg, paddingTop: spacing.xl },
  back: { marginBottom: spacing.lg },
  backText: { fontSize: 16, color: colors.primary, fontWeight: '600' },
  stepRow: { flexDirection: 'row', gap: 6, marginBottom: spacing.xl },
  step: { flex: 1, height: 4, borderRadius: radius.pill, backgroundColor: colors.border },
  stepActive: { backgroundColor: colors.primary },
  heading: { fontSize: 26, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.xs },
  sub: { fontSize: 15, color: colors.textSecondary, marginBottom: spacing.lg },

  mapPickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.md, backgroundColor: '#FFF8F5',
  },
  mapPickerIcon: { fontSize: 24 },
  mapPickerLabel: { fontSize: 15, fontWeight: '700', color: colors.primary },
  mapPickerSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  mapPickerArrow: { fontSize: 22, color: colors.primary },

  orDividerText: { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.md },

  label: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: spacing.xs },
  input: {
    borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: spacing.md,
    height: 52, fontSize: 16, color: colors.textPrimary, marginBottom: spacing.md,
  },
  suggestions: {
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, marginTop: -spacing.sm,
    marginBottom: spacing.md, overflow: 'hidden',
  },
  suggestion: { padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  suggestionText: { fontSize: 15, color: colors.textPrimary },
  phoneRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: 4 },
  prefixBox: {
    borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: spacing.md,
    justifyContent: 'center', backgroundColor: colors.surface,
  },
  prefix: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  phoneInput: { flex: 1, marginBottom: 0 },
  hint: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.xl },
  button: {
    backgroundColor: colors.primary, borderRadius: radius.pill,
    height: 52, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
})
