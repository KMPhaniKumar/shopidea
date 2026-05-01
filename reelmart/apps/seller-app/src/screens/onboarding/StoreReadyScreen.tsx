import React from 'react'
import {
  View, Text, TouchableOpacity, Share,
  StyleSheet, Linking,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RouteProp } from '@react-navigation/native'
import { colors, radius, spacing } from '../../constants/theme'
import { getStoreUrl } from '../../services/storeService'
import { OnboardingStackParamList } from '../../navigation/types'

type Props = {
  navigation: NativeStackNavigationProp<OnboardingStackParamList, 'StoreReady'>
  route: RouteProp<OnboardingStackParamList, 'StoreReady'>
}

export default function StoreReadyScreen({ route }: Props) {
  const { storeName, slug } = route.params
  const storeUrl = getStoreUrl(slug)

  async function shareWhatsApp() {
    const message = `🛍️ Check out *${storeName}* on ReelMart!\n\nShop now: ${storeUrl}\n\n✅ Secure payments | 📦 Fast delivery`
    const waUrl = `whatsapp://send?text=${encodeURIComponent(message)}`
    const canOpen = await Linking.canOpenURL(waUrl)
    if (canOpen) {
      await Linking.openURL(waUrl)
    } else {
      await Share.share({ message })
    }
  }

  async function shareGeneral() {
    await Share.share({
      message: `🛍️ ${storeName} is now on ReelMart!\n\nOrder here: ${storeUrl}`,
      url: storeUrl,
    })
  }

  return (
    <View style={styles.container}>
      <View style={styles.celebration}>
        <Text style={styles.emoji}>🎉</Text>
        <Text style={styles.heading}>Your store is live!</Text>
        <Text style={styles.sub}>Share your link and start getting orders</Text>
      </View>

      <View style={styles.urlCard}>
        <Text style={styles.urlLabel}>Your store link</Text>
        <Text style={styles.url}>{storeUrl}</Text>
      </View>

      <TouchableOpacity style={styles.waButton} onPress={shareWhatsApp} activeOpacity={0.85}>
        <Text style={styles.waIcon}>💬</Text>
        <Text style={styles.waButtonText}>Share on WhatsApp</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.shareButton} onPress={shareGeneral} activeOpacity={0.85}>
        <Text style={styles.shareButtonText}>Share Link</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.dashboardButton}
        onPress={() => {
          // RootNavigator will pick this up and navigate to main app
          // since store now exists in sellerStore
        }}
        activeOpacity={0.85}
      >
        <Text style={styles.dashboardButtonText}>Go to Dashboard →</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: colors.white,
    padding: spacing.lg, justifyContent: 'center',
  },
  celebration: { alignItems: 'center', marginBottom: spacing.xl },
  emoji: { fontSize: 64, marginBottom: spacing.md },
  heading: {
    fontSize: 28, fontWeight: '700',
    color: colors.textPrimary, marginBottom: spacing.xs,
  },
  sub: { fontSize: 15, color: colors.textSecondary, textAlign: 'center' },
  urlCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.xl,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  urlLabel: { fontSize: 12, color: colors.textMuted, marginBottom: 6, fontWeight: '500' },
  url: { fontSize: 16, fontWeight: '700', color: colors.primary },
  waButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#25D366', borderRadius: radius.pill,
    height: 52, marginBottom: spacing.sm, gap: spacing.sm,
  },
  waIcon: { fontSize: 20 },
  waButtonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  shareButton: {
    borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radius.pill, height: 52,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xl,
  },
  shareButtonText: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  dashboardButton: {
    backgroundColor: colors.primary, borderRadius: radius.pill,
    height: 52, alignItems: 'center', justifyContent: 'center',
  },
  dashboardButtonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
})
