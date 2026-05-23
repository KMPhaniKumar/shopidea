import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, Image, Dimensions, ScrollView,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RouteProp } from '@react-navigation/native'
import { useAuthStore } from '../../store/authStore'
import { colors, radius, spacing } from '../../constants/theme'
import { AuthStackParamList } from '../../navigation/types'

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'OTP'>
  route: RouteProp<AuthStackParamList, 'OTP'>
}

const { width } = Dimensions.get('window')
const GREEN = '#00B98E'
const OTP_EXPIRY = 60

export default function OTPScreen({ navigation, route }: Props) {
  const { phone } = route.params
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [countdown, setCountdown] = useState(OTP_EXPIRY)
  const [attempts, setAttempts] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const verifyOTP = useAuthStore(s => s.verifyOTP)
  const sendOTP = useAuthStore(s => s.sendOTP)

  useEffect(() => {
    startTimer()
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  function startTimer() {
    setCountdown(OTP_EXPIRY)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(timerRef.current!); return 0 }
        return c - 1
      })
    }, 1000)
  }

  async function handleVerify() {
    if (otp.length !== 6) { Alert.alert('Invalid OTP', 'Enter the 6-digit code.'); return }
    if (attempts >= 3) { Alert.alert('Too many attempts', 'Please request a new OTP.'); return }
    setLoading(true)
    const { error, isNewUser } = await verifyOTP(phone, otp)
    setLoading(false)
    if (error) {
      setAttempts(a => a + 1)
      Alert.alert('Wrong OTP', 'The code you entered is incorrect. Try again.')
      return
    }
    if (isNewUser) {
      navigation.replace('ProfileSetup')
    }
    // existing user: don't navigate — root navigator will auto-swap to MainTabs once session is set
  }

  async function handleResend() {
    if (countdown > 0) return
    setOtp('')
    setAttempts(0)
    await sendOTP(phone)
    startTimer()
  }

  const maskedPhone = `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Brand */}
        <View style={styles.brand}>
          <Image
            source={require('../../../assets/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        {/* Form */}
        <View style={styles.form}>
          <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          <View style={styles.accentBar}>
            <View style={[styles.accentPill, { backgroundColor: colors.primary, width: 36 }]} />
            <View style={[styles.accentPill, { backgroundColor: GREEN, width: 14 }]} />
          </View>

          <Text style={styles.heading}>Enter OTP</Text>
          <Text style={styles.sub}>
            We sent a 6-digit code to{'\n'}
            <Text style={styles.phone}>{maskedPhone}</Text>
          </Text>

          {__DEV__ && (
            <TouchableOpacity onPress={() => setOtp('123456')} style={styles.devBanner} activeOpacity={0.7}>
              <Text style={styles.devBannerText}>🛠 DEV — Tap to fill OTP 123456</Text>
            </TouchableOpacity>
          )}

          <TextInput
            style={styles.otpInput}
            placeholder="• • • • • •"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            maxLength={6}
            value={otp}
            onChangeText={setOtp}
            autoFocus
            textAlign="center"
          />

          {attempts > 0 && (
            <Text style={styles.attemptsText}>
              {3 - attempts} attempt{3 - attempts !== 1 ? 's' : ''} remaining
            </Text>
          )}

          <TouchableOpacity
            style={[styles.button, (loading || otp.length < 6) && styles.buttonDisabled]}
            onPress={handleVerify}
            disabled={loading || otp.length < 6}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color={colors.white} />
              : <Text style={styles.buttonText}>Verify & Continue →</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity onPress={handleResend} disabled={countdown > 0}>
            <Text style={[styles.resend, countdown > 0 && styles.resendDisabled]}>
              {countdown > 0 ? `Resend OTP in ${countdown}s` : 'Resend OTP'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  scroll: { flexGrow: 1, paddingTop: 56 },

  brand: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  logo: { width: width * 0.6, height: 120 },

  form: {
    paddingHorizontal: spacing.lg,
  },
  back: { marginBottom: 16 },
  backText: { fontSize: 15, color: colors.primary, fontWeight: '600' },
  accentBar: { flexDirection: 'row', gap: 6, marginBottom: 20 },
  accentPill: { height: 4, borderRadius: 99 },

  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  sub: { fontSize: 14, color: colors.textSecondary, marginBottom: spacing.xl, lineHeight: 22 },
  phone: { fontWeight: '700', color: colors.textPrimary },

  devBanner: {
    backgroundColor: '#FEF3C7', borderRadius: 8, padding: 10,
    borderLeftWidth: 3, borderLeftColor: '#F59E0B',
    marginBottom: 16,
  },
  devBannerText: { fontSize: 12, color: '#92400E', fontWeight: '600' },

  otpInput: {
    borderWidth: 2,
    borderColor: GREEN,
    borderRadius: radius.md,
    height: 64,
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 12,
    marginBottom: spacing.sm,
  },
  attemptsText: {
    fontSize: 13, color: colors.error,
    textAlign: 'center', marginBottom: spacing.md,
  },
  button: {
    backgroundColor: GREEN,
    borderRadius: radius.pill,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  resend: { fontSize: 15, color: colors.primary, textAlign: 'center', fontWeight: '600' },
  resendDisabled: { color: colors.textMuted },
})
