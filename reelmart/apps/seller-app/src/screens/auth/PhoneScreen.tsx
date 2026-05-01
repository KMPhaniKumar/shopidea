import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useAuthStore } from '../../store/authStore'
import { colors, radius, spacing } from '../../constants/theme'
import { AuthStackParamList } from '../../navigation/types'

type Props = { navigation: NativeStackNavigationProp<AuthStackParamList, 'Phone'> }

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
    if (error) {
      Alert.alert('Error', error)
      return
    }
    navigation.navigate('OTP', { phone: cleaned })
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <View style={styles.logoRow}>
          <Text style={styles.logoReel}>Reel</Text>
          <Text style={styles.logoMart}>Mart</Text>
        </View>
        <Text style={styles.tagline}>Real Products. Real Sellers.</Text>

        <Text style={styles.heading}>Seller Login</Text>
        <Text style={styles.sub}>Enter your WhatsApp number to continue</Text>

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

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color={colors.white} />
            : <Text style={styles.buttonText}>Send OTP</Text>
          }
        </TouchableOpacity>

        <Text style={styles.terms}>
          By continuing you agree to our Terms of Service and Privacy Policy
        </Text>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  inner: { flex: 1, padding: spacing.lg, justifyContent: 'center' },
  logoRow: { flexDirection: 'row', marginBottom: spacing.xs },
  logoReel: { fontSize: 32, fontWeight: '800', color: colors.primary },
  logoMart: { fontSize: 32, fontWeight: '800', color: colors.black },
  tagline: {
    fontSize: 13,
    color: colors.textMuted,
    letterSpacing: 1.5,
    marginBottom: spacing.xxl,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  sub: {
    fontSize: 15,
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
  terms: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
})
