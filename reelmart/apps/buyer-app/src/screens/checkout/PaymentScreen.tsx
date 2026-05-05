import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RouteProp } from '@react-navigation/native'
import { colors, spacing } from '../../constants/theme'
import { useAuthStore } from '../../store/authStore'

// RazorpayCheckout is a native module — install with:
// yarn add react-native-razorpay
let RazorpayCheckout: any
try { RazorpayCheckout = require('react-native-razorpay').default } catch { RazorpayCheckout = null }

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3003').replace(/\/$/, '')
const RAZORPAY_KEY_ID = process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID ?? ''

type Props = {
  navigation: NativeStackNavigationProp<any>
  route: RouteProp<{ Payment: { orderId: string; orderNumber: string; amount: number } }, 'Payment'>
}

export default function PaymentScreen({ navigation, route }: Props) {
  const { orderId, orderNumber, amount } = route.params
  const session = useAuthStore(s => s.session)
  const profile = useAuthStore(s => s.profile)
  const [status, setStatus] = useState<'initiating' | 'processing' | 'success' | 'failed'>('initiating')

  useEffect(() => {
    initiatePayment()
  }, [])

  async function initiatePayment() {
    if (!session?.access_token) {
      Alert.alert('Error', 'Not authenticated')
      navigation.goBack()
      return
    }

    if (!RazorpayCheckout) {
      Alert.alert('Payment unavailable', 'Razorpay SDK not installed. Run: yarn add react-native-razorpay')
      navigation.goBack()
      return
    }

    try {
      setStatus('processing')

      // Create Razorpay order via payment-service
      const res = await fetch(`${API_URL}/api/payments/create-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ orderId, amount }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Failed to create payment order')

      const { razorpayOrderId } = json.data

      const options = {
        description: `Order ${orderNumber}`,
        currency: 'INR',
        key: RAZORPAY_KEY_ID,
        amount: amount * 100, // in paise
        name: 'ReelMart',
        order_id: razorpayOrderId,
        prefill: {
          contact: session.user?.phone ?? '',
          name: profile?.name ?? '',
        },
        theme: { color: colors.primary },
      }

      const paymentData = await RazorpayCheckout.open(options)

      // Verify payment via payment-service
      const verifyRes = await fetch(`${API_URL}/api/payments/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          orderId,
          razorpay_order_id: paymentData.razorpay_order_id,
          razorpay_payment_id: paymentData.razorpay_payment_id,
          razorpay_signature: paymentData.razorpay_signature,
        }),
      })
      const verifyJson = await verifyRes.json()
      if (!verifyJson.success) throw new Error(verifyJson.error ?? 'Payment verification failed')

      setStatus('success')
      setTimeout(() => navigation.replace('OrderTracking', { orderId }), 1200)
    } catch (e: any) {
      if (e?.code === 'PAYMENT_CANCELLED') {
        navigation.goBack()
        return
      }
      setStatus('failed')
      Alert.alert(
        'Payment Failed',
        e.message || 'Something went wrong. Please try again.',
        [
          { text: 'Retry', onPress: () => { setStatus('initiating'); initiatePayment() } },
          { text: 'Go Back', onPress: () => navigation.goBack() },
        ]
      )
    }
  }

  const stateConfig = {
    initiating: { icon: '💳', label: 'Setting up payment...' },
    processing: { icon: '🔄', label: 'Processing payment...' },
    success:    { icon: '✅', label: 'Payment successful!' },
    failed:     { icon: '❌', label: 'Payment failed' },
  }[status]

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>{stateConfig.icon}</Text>
      <Text style={styles.label}>{stateConfig.label}</Text>
      {(status === 'initiating' || status === 'processing') && (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.lg }} />
      )}
      <Text style={styles.amount}>₹{amount}</Text>
      <Text style={styles.orderNum}>{orderNumber}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, padding: spacing.xl },
  icon: { fontSize: 64, marginBottom: spacing.md },
  label: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  amount: { fontSize: 28, fontWeight: '800', color: colors.primary, marginTop: spacing.xl },
  orderNum: { fontSize: 14, color: colors.textMuted, marginTop: spacing.xs },
})
