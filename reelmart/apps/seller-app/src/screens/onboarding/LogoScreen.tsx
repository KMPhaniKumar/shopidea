import React, { useState } from 'react'
import {
  View, Text, TouchableOpacity, Image,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RouteProp } from '@react-navigation/native'
import { colors, radius, spacing } from '../../constants/theme'
import { createStore, uploadLogo } from '../../services/storeService'
import { useAuthStore } from '../../store/authStore'
import { useSellerStore } from '../../store/sellerStore'
import { OnboardingStackParamList } from '../../navigation/types'
import type { Database } from '../../types/supabase'

type Props = {
  navigation: NativeStackNavigationProp<OnboardingStackParamList, 'Logo'>
  route: RouteProp<OnboardingStackParamList, 'Logo'>
}

type CategoryId = Database['public']['Tables']['stores']['Row']['category']

export default function LogoScreen({ navigation, route }: Props) {
  const { storeName, category, city, area, whatsappNumber } = route.params
  const [logoUri, setLogoUri] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const session = useAuthStore(s => s.session)
  const setStore = useSellerStore(s => s.setStore)

  async function pickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow access to your photo library to upload a logo.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })
    if (!result.canceled) setLogoUri(result.assets[0].uri)
  }

  async function handleFinish() {
    if (!session?.user) return
    setLoading(true)
    try {
      const store = await createStore({
        sellerId: session.user.id,
        storeName,
        category: category as CategoryId,
        city,
        area,
        whatsappNumber,
      })
      if (logoUri) {
        const logoUrl = await uploadLogo(store.id, logoUri)
        const { supabase } = await import('../../lib/supabase')
        const { data: updated } = await supabase
          .from('stores').update({ logo_url: logoUrl }).eq('id', store.id).select('*').single()
        if (updated) {
          setStore(updated)
          navigation.replace('StoreReady', {
            storeId: updated.id,
            storeName: updated.store_name,
            slug: updated.store_slug,
          })
          return
        }
      }
      setStore(store)
      navigation.replace('StoreReady', {
        storeId: store.id,
        storeName: store.store_name,
        slug: store.store_slug,
      })
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create store. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <View style={styles.stepRow}>
        {[0,1,2,3].map(i => (
          <View key={i} style={[styles.step, styles.stepActive]} />
        ))}
      </View>

      <Text style={styles.heading}>Add your store logo</Text>
      <Text style={styles.sub}>Helps buyers recognise your brand</Text>

      <TouchableOpacity style={styles.logoBox} onPress={pickImage} activeOpacity={0.8}>
        {logoUri ? (
          <Image source={{ uri: logoUri }} style={styles.logo} />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderIcon}>📷</Text>
            <Text style={styles.placeholderText}>Tap to upload</Text>
          </View>
        )}
        {logoUri && (
          <View style={styles.changeOverlay}>
            <Text style={styles.changeText}>Change</Text>
          </View>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleFinish}
        disabled={loading}
        activeOpacity={0.85}
      >
        {loading
          ? <ActivityIndicator color={colors.white} />
          : <Text style={styles.buttonText}>Create My Store 🚀</Text>
        }
      </TouchableOpacity>

      {!logoUri && (
        <TouchableOpacity style={styles.skipBtn} onPress={handleFinish} disabled={loading}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white, padding: spacing.lg, paddingTop: spacing.xl },
  back: { marginBottom: spacing.lg },
  backText: { fontSize: 16, color: colors.primary, fontWeight: '600' },
  stepRow: { flexDirection: 'row', gap: 6, marginBottom: spacing.xl },
  step: { flex: 1, height: 4, borderRadius: radius.pill, backgroundColor: colors.border },
  stepActive: { backgroundColor: colors.primary },
  heading: { fontSize: 26, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.xs },
  sub: { fontSize: 15, color: colors.textSecondary, marginBottom: spacing.xl },
  logoBox: {
    width: 140, height: 140, borderRadius: 70,
    alignSelf: 'center', marginBottom: spacing.xl,
    overflow: 'hidden',
    borderWidth: 2, borderColor: colors.border,
    borderStyle: 'dashed',
  },
  logo: { width: '100%', height: '100%' },
  placeholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  placeholderIcon: { fontSize: 32, marginBottom: spacing.xs },
  placeholderText: { fontSize: 13, color: colors.textMuted, fontWeight: '500' },
  changeOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)', padding: 6, alignItems: 'center',
  },
  changeText: { color: colors.white, fontSize: 12, fontWeight: '600' },
  button: {
    backgroundColor: colors.primary, borderRadius: radius.pill,
    height: 52, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  skipBtn: { alignItems: 'center', padding: spacing.sm },
  skipText: { fontSize: 15, color: colors.textMuted },
})
