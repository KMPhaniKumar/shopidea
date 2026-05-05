import React, { useState } from 'react'
import {
  View, Text, TouchableOpacity, TextInput, ScrollView,
  StyleSheet, ActivityIndicator, Alert, Image,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RouteProp } from '@react-navigation/native'
import { colors, radius, spacing } from '../../constants/theme'
import { useAuthStore } from '../../store/authStore'
import { submitReview } from '../../services/reviewService'

let ImagePicker: any
try { ImagePicker = require('expo-image-picker') } catch { ImagePicker = null }

type Props = {
  navigation: NativeStackNavigationProp<any>
  route: RouteProp<{ WriteReview: { orderId: string; storeId: string; storeName: string } }, 'WriteReview'>
}

const STAR_LABELS = ['', 'Terrible', 'Bad', 'Okay', 'Good', 'Excellent']

export default function WriteReviewScreen({ navigation, route }: Props) {
  const { orderId, storeId, storeName } = route.params
  const session = useAuthStore(s => s.session)
  const [rating, setRating] = useState(0)
  const [text, setText] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  async function pickPhoto() {
    if (!ImagePicker) return
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) { Alert.alert('Permission needed', 'Allow photo access to add review photos'); return }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: 3 - photos.length,
    })
    if (!result.canceled) {
      setPhotos(prev => [...prev, ...result.assets.map((a: any) => a.uri)].slice(0, 3))
    }
  }

  async function handleSubmit() {
    if (!session?.user) return
    if (rating === 0) { Alert.alert('Rate your experience', 'Please select a star rating'); return }

    setLoading(true)
    try {
      await submitReview({
        orderId,
        buyerId: session.user.id,
        storeId,
        rating,
        reviewText: text,
        photoUris: photos,
      })
      Alert.alert(
        '🎉 Review submitted!',
        `You earned ${photos.length > 0 ? 20 : 10} loyalty coins!`,
        [{ text: 'Done', onPress: () => navigation.goBack() }]
      )
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to submit review')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Write a Review</Text>
        <TouchableOpacity onPress={handleSubmit} disabled={loading || rating === 0}>
          {loading
            ? <ActivityIndicator size="small" color={colors.primary} />
            : <Text style={[styles.submit, rating === 0 && styles.submitDim]}>Submit</Text>
          }
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.storeName}>{storeName}</Text>

        {/* Star rating */}
        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map(star => (
            <TouchableOpacity key={star} onPress={() => setRating(star)} style={styles.starBtn}>
              <Text style={[styles.star, star <= rating && styles.starActive]}>★</Text>
            </TouchableOpacity>
          ))}
        </View>
        {rating > 0 && <Text style={styles.ratingLabel}>{STAR_LABELS[rating]}</Text>}

        {/* Review text */}
        <TextInput
          style={styles.textInput}
          placeholder="Share your experience with this seller..."
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={setText}
          multiline
          numberOfLines={5}
          maxLength={500}
          textAlignVertical="top"
        />
        <Text style={styles.charCount}>{text.length}/500</Text>

        {/* Photo upload */}
        <Text style={styles.photoLabel}>Add Photos (optional)</Text>
        <View style={styles.photoRow}>
          {photos.map((uri, i) => (
            <View key={i} style={styles.photoThumb}>
              <Image source={{ uri }} style={styles.photoImg} />
              <TouchableOpacity style={styles.photoRemove} onPress={() => setPhotos(p => p.filter((_, j) => j !== i))}>
                <Text style={styles.photoRemoveText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          {photos.length < 3 && (
            <TouchableOpacity style={styles.photoAdd} onPress={pickPhoto}>
              <Text style={styles.photoAddIcon}>📷</Text>
              <Text style={styles.photoAddText}>Add Photo</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.coinHint}>
          🪙 Earn {photos.length > 0 ? 20 : 10} loyalty coins for this review
          {photos.length === 0 ? ' · +10 more with photos' : ''}
        </Text>
      </ScrollView>
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
  cancel: { fontSize: 16, color: colors.textSecondary },
  title: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  submit: { fontSize: 16, fontWeight: '700', color: colors.primary },
  submitDim: { opacity: 0.4 },
  body: { padding: spacing.lg, paddingBottom: 40 },
  storeName: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.lg, textAlign: 'center' },
  starsRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  starBtn: { padding: 4 },
  star: { fontSize: 44, color: colors.border },
  starActive: { color: '#FBBF24' },
  ratingLabel: { textAlign: 'center', fontSize: 16, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.lg },
  textInput: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.md, fontSize: 15, color: colors.textPrimary,
    minHeight: 120, marginBottom: 4,
  },
  charCount: { fontSize: 12, color: colors.textMuted, textAlign: 'right', marginBottom: spacing.lg },
  photoLabel: { fontSize: 14, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.sm },
  photoRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  photoThumb: { width: 80, height: 80, borderRadius: radius.md, overflow: 'hidden' },
  photoImg: { width: '100%', height: '100%' },
  photoRemove: {
    position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center',
  },
  photoRemoveText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  photoAdd: {
    width: 80, height: 80, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  photoAddIcon: { fontSize: 24 },
  photoAddText: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  coinHint: {
    backgroundColor: '#FFF8E7', borderRadius: radius.md, padding: spacing.md,
    fontSize: 13, color: '#92400E', fontWeight: '600',
  },
})
