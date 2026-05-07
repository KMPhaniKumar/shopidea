import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, Image, Dimensions, ScrollView,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useAuthStore } from '../../store/authStore'
import { colors, radius, spacing } from '../../constants/theme'
import { AuthStackParamList } from '../../navigation/types'

type Props = { navigation: NativeStackNavigationProp<AuthStackParamList, 'Phone'> }

const { width } = Dimensions.get('window')
const GREEN = '#00B98E'
const DEV_PHONE = '9999999999'

function isValidIndianPhone(phone: string): boolean {
  return /^[6-9]\d{9}$/.test(phone.replace(/\s/g, ''))
}

export default function PhoneScreen({ navigation }: Props) {
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const sendOTP = useAuthStore(s => s.sendOTP)

  async function handleContinue() {
    const cleaned = phone.replace(/\s/g, '')
    if (!isValidIndianPhone(cleaned)) {
      Alert.alert('Invalid number', 'Enter a valid 10-digit Indian mobile number.')
      return
    }
    setLoading(true)
    const { error } = await sendOTP(cleaned)
    setLoading(false)
    if (error) { Alert.alert('Error', error); return }
    navigation.navigate('OTP', { phone: cleaned })
  }

  function fillDevNumber() {
    setPhone(DEV_PHONE)
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
      {/* Top dark brand panel */}
      <View style={styles.topPanel}>
        <View style={styles.orangeGlow} />
        <View style={styles.greenGlow} />
        <View style={styles.logoCard}>
          <Image
            source={require('../../../assets/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
        <Text style={styles.tagline}>Real Products. Real Sellers.</Text>
      </View>

      {/* Bottom form panel */}
      <View style={styles.formPanel}>
        {/* accent bar */}
        <View style={styles.accentBar}>
          <View style={[styles.accentPill, { backgroundColor: colors.primary, width: 36 }]} />
          <View style={[styles.accentPill, { backgroundColor: GREEN, width: 14 }]} />
        </View>

        <Text style={styles.heading}>Login / Sign Up 👋</Text>
        <Text style={styles.sub}>Discover and shop from local sellers near you</Text>

        <View style={styles.phoneRow}>
          <View style={styles.prefixBox}>
            <Text style={styles.prefix}>+91</Text>
          </View>
          <TextInput
            style={styles.input}
            placeholder="98765 43210"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            maxLength={10}
            value={phone}
            onChangeText={setPhone}
            autoFocus
          />
        </View>

        {__DEV__ && (
          <TouchableOpacity onPress={fillDevNumber} style={styles.devBanner} activeOpacity={0.7}>
            <Text style={styles.devBannerText}>🛠 DEV — Tap to use {DEV_PHONE} (OTP: 123456)</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color={colors.white} />
            : <Text style={styles.buttonText}>Continue →</Text>
          }
        </TouchableOpacity>

        <Text style={styles.terms}>
          By continuing you agree to our Terms of Service and Privacy Policy
        </Text>
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A1A1A' },

  topPanel: {
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 36,
    overflow: 'hidden',
  },
  orangeGlow: {
    position: 'absolute', top: -60, left: -60,
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: '#FF6B2B',
    opacity: 0.15,
  },
  greenGlow: {
    position: 'absolute', bottom: -40, right: -40,
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: '#00B98E',
    opacity: 0.12,
  },
  logoCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  logo: { width: width * 0.85, height: 130 },
  tagline: {
    fontSize: 13,
    color: '#AAAAAA',
    letterSpacing: 1.2,
  },

  formPanel: {
    flex: 1,
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: spacing.lg,
    paddingTop: 28,
  },
  accentBar: { flexDirection: 'row', gap: 6, marginBottom: 20 },
  accentPill: { height: 4, borderRadius: 99 },

  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  sub: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  phoneRow: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  prefixBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  prefix: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    height: 52,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  devBanner: {
    backgroundColor: '#FEF3C7', borderRadius: 8, padding: 10,
    borderLeftWidth: 3, borderLeftColor: '#F59E0B',
    marginTop: -8, marginBottom: 12,
  },
  devBannerText: { fontSize: 12, color: '#92400E', fontWeight: '600' },
  terms: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
})
