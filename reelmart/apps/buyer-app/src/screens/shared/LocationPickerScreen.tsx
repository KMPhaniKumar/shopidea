import React, { useRef, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Platform,
} from 'react-native'
import MapView, { Region, PROVIDER_GOOGLE } from 'react-native-maps'
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete'
import * as Location from 'expo-location'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RouteProp } from '@react-navigation/native'
import { colors, radius, spacing } from '../../constants/theme'

const MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ?? ''

const INDIA_REGION: Region = {
  latitude: 20.5937,
  longitude: 78.9629,
  latitudeDelta: 20,
  longitudeDelta: 20,
}

export interface PickedLocation {
  line1: string
  area: string
  city: string
  state: string
  pincode: string
  latitude: number
  longitude: number
}

type Props = {
  navigation: NativeStackNavigationProp<any>
  route: RouteProp<{ LocationPicker: { callbackScreen: string } }, 'LocationPicker'>
}

export default function LocationPickerScreen({ navigation, route }: Props) {
  const { callbackScreen } = route.params
  const mapRef = useRef<MapView>(null)
  const [region, setRegion] = useState<Region>(INDIA_REGION)
  const [resolving, setResolving] = useState(false)
  const [address, setAddress] = useState<PickedLocation | null>(null)

  async function reverseGeocode(lat: number, lng: number) {
    setResolving(true)
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${MAPS_KEY}`
      )
      const json = await res.json()
      if (!json.results || json.results.length === 0) {
        setAddress(null)
        return
      }
      const components: { types: string[]; long_name: string; short_name: string }[] =
        json.results[0].address_components ?? []

      const get = (...types: string[]) =>
        components.find(c => types.some(t => c.types.includes(t)))?.long_name ?? ''

      setAddress({
        line1: [get('street_number'), get('route')].filter(Boolean).join(' '),
        area: get('sublocality_level_1', 'sublocality', 'neighborhood'),
        city: get('locality', 'administrative_area_level_2'),
        state: get('administrative_area_level_1'),
        pincode: get('postal_code'),
        latitude: lat,
        longitude: lng,
      })
    } catch {
      setAddress(null)
    } finally {
      setResolving(false)
    }
  }

  async function handleGPS() {
    const { status } = await Location.requestForegroundPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission denied', 'Please enable location access in Settings to use this feature.')
      return
    }
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
    const newRegion: Region = {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    }
    setRegion(newRegion)
    mapRef.current?.animateToRegion(newRegion, 600)
    await reverseGeocode(pos.coords.latitude, pos.coords.longitude)
  }

  function handleRegionChangeComplete(r: Region) {
    setRegion(r)
    reverseGeocode(r.latitude, r.longitude)
  }

  function handleConfirm() {
    if (!address) return
    navigation.navigate({
      name: callbackScreen,
      params: { pickedLocation: address },
      merge: true,
    })
  }

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchWrapper}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <GooglePlacesAutocomplete
          placeholder="Search area, street, landmark..."
          fetchDetails
          onPress={(data, details) => {
            if (!details?.geometry) return
            const { lat, lng } = details.geometry.location
            const newRegion: Region = { latitude: lat, longitude: lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }
            setRegion(newRegion)
            mapRef.current?.animateToRegion(newRegion, 600)
            reverseGeocode(lat, lng)
          }}
          query={{ key: MAPS_KEY, language: 'en', components: 'country:in' }}
          styles={{
            container: { flex: 1 },
            textInput: styles.searchInput,
            listView: styles.searchDropdown,
            row: { paddingVertical: 12, paddingHorizontal: 12 },
            description: { fontSize: 14, color: colors.textPrimary },
          }}
          enablePoweredByContainer={false}
          keyboardShouldPersistTaps="handled"
        />
      </View>

      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={INDIA_REGION}
        region={region}
        onRegionChangeComplete={handleRegionChangeComplete}
        showsUserLocation
        showsMyLocationButton={false}
      />

      {/* Fixed center pin */}
      <View style={styles.pinContainer} pointerEvents="none">
        <Text style={styles.pin}>📍</Text>
        <View style={styles.pinShadow} />
      </View>

      {/* GPS button */}
      <TouchableOpacity style={styles.gpsBtn} onPress={handleGPS}>
        <Text style={styles.gpsBtnText}>📌</Text>
      </TouchableOpacity>

      {/* Bottom address card */}
      <View style={styles.bottomCard}>
        {resolving ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />
        ) : address ? (
          <>
            <Text style={styles.deliverLabel}>Delivering to:</Text>
            <Text style={styles.addressLine1} numberOfLines={1}>
              {[address.line1, address.area].filter(Boolean).join(', ') || 'Unnamed location'}
            </Text>
            <Text style={styles.addressLine2} numberOfLines={1}>
              {[address.city, address.state, address.pincode].filter(Boolean).join(', ')}
            </Text>
          </>
        ) : (
          <Text style={styles.resolveHint}>Drag the map to pin your delivery location</Text>
        )}

        <TouchableOpacity
          style={[styles.confirmBtn, (!address || resolving) && styles.confirmBtnDisabled]}
          onPress={handleConfirm}
          disabled={!address || resolving}
        >
          <Text style={styles.confirmBtnText}>Confirm this location →</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },

  searchWrapper: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: colors.white,
    paddingTop: Platform.OS === 'ios' ? 52 : 12,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    shadowColor: '#000', shadowOpacity: 0.1, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4,
    elevation: 4,
  },
  backBtn: {
    width: 40, height: 44, alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.xs,
  },
  backText: { fontSize: 22, color: colors.primary, fontWeight: '700' },
  searchInput: {
    height: 44, borderRadius: radius.md, fontSize: 15,
    backgroundColor: colors.surface, color: colors.textPrimary,
    paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  searchDropdown: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    marginTop: 4,
  },

  map: { flex: 1 },

  pinContainer: {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 160,
  },
  pin: { fontSize: 36 },
  pinShadow: {
    width: 10, height: 4, borderRadius: 5,
    backgroundColor: 'rgba(0,0,0,0.2)',
    marginTop: 2,
  },

  gpsBtn: {
    position: 'absolute', right: spacing.md, bottom: 200,
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4,
    elevation: 4,
  },
  gpsBtnText: { fontSize: 22 },

  bottomCard: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: spacing.lg,
    shadowColor: '#000', shadowOpacity: 0.12, shadowOffset: { width: 0, height: -3 }, shadowRadius: 8,
    elevation: 8,
    minHeight: 160,
  },
  deliverLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  addressLine1: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  addressLine2: { fontSize: 14, color: colors.textSecondary, marginBottom: spacing.md },
  resolveHint: { fontSize: 15, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.md },

  confirmBtn: {
    backgroundColor: colors.primary, borderRadius: radius.pill,
    height: 52, alignItems: 'center', justifyContent: 'center',
  },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmBtnText: { color: colors.white, fontWeight: '700', fontSize: 16 },
})
