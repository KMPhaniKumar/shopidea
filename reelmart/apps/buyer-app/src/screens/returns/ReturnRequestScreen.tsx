import React, { useState } from 'react'
import {
  View, Text, TouchableOpacity, TextInput, ScrollView,
  StyleSheet, ActivityIndicator, Alert, Image,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RouteProp } from '@react-navigation/native'
import * as ImagePicker from 'expo-image-picker'
import { colors, radius, spacing } from '../../constants/theme'
import { useAuthStore } from '../../store/authStore'
import { RETURN_REASONS, requestReturn } from '../../services/returnService'
import { supabase } from '../../lib/supabase'

type Props = {
  navigation: NativeStackNavigationProp<any>
  route: RouteProp<any, any>
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  requested:         { label: 'Under Review', color: '#D97706' },
  approved:          { label: 'Approved', color: '#16A34A' },
  rejected:          { label: 'Rejected', color: '#DC2626' },
  pickup_scheduled:  { label: 'Pickup Scheduled', color: '#2563EB' },
  picked_up:         { label: 'Picked Up', color: '#7C3AED' },
  refund_initiated:  { label: 'Refund Initiated', color: '#0891B2' },
  refunded:          { label: 'Refunded ✓', color: '#16A34A' },
}

export default function ReturnRequestScreen({ navigation, route }: Props) {
  const { orderId, storeId, deliveredAt, orderNumber } = route.params ?? {}
  const session = useAuthStore(s => s.session)

  const [reason, setReason] = useState('')
  const [description, setDescription] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  async function pickPhoto() {
    if (photos.length >= 3) { Alert.alert('Max 3 photos'); return }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
    })
    if (!result.canceled && result.assets[0]) {
      setPhotos(prev => [...prev, result.assets[0].uri])
    }
  }

  async function uploadPhotos(): Promise<string[]> {
    const urls: string[] = []
    for (const uri of photos) {
      const blob = await (await fetch(uri)).blob()
      const fileName = `${session!.user.id}-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
      const { error } = await supabase.storage
        .from('review-photos')
        .upload(fileName, blob, { contentType: 'image/jpeg', upsert: false })
      if (!error) {
        const { data } = supabase.storage.from('review-photos').getPublicUrl(fileName)
        urls.push(data.publicUrl)
      }
    }
    return urls
  }

  async function handleSubmit() {
    if (!session?.user) return
    if (!reason) { Alert.alert('Select a reason'); return }

    setSubmitting(true)
    const uploadedPhotos = photos.length > 0 ? await uploadPhotos() : []
    const result = await requestReturn({
      orderId,
      buyerId: session.user.id,
      storeId,
      deliveredAt,
      reason,
      description: description.trim() || undefined,
      photos: uploadedPhotos,
    })
    setSubmitting(false)

    if (result.success) {
      Alert.alert(
        'Return Requested',
        "We'll review your request and get back to you within 24 hours.",
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      )
    } else {
      Alert.alert('Error', result.error ?? 'Could not submit return request')
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Request Return</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.orderBadge}>
          <Text style={styles.orderBadgeText}>Order {orderNumber}</Text>
        </View>

        <View style={styles.windowNote}>
          <Text style={styles.windowNoteText}>⏱ Returns accepted within 24 hours of delivery</Text>
        </View>

        {/* Reason */}
        <Text style={styles.sectionLabel}>Reason for Return *</Text>
        {RETURN_REASONS.map(r => (
          <TouchableOpacity
            key={r}
            style={[styles.reasonChip, reason === r && styles.reasonChipActive]}
            onPress={() => setReason(r)}
          >
            <View style={[styles.radio, reason === r && styles.radioActive]}>
              {reason === r && <View style={styles.radioDot} />}
            </View>
            <Text style={[styles.reasonText, reason === r && styles.reasonTextActive]}>{r}</Text>
          </TouchableOpacity>
        ))}

        {/* Description */}
        <Text style={[styles.sectionLabel, { marginTop: spacing.md }]}>Description (optional)</Text>
        <TextInput
          style={styles.descInput}
          value={description}
          onChangeText={setDescription}
          placeholder="Describe the issue in detail..."
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={300}
          textAlignVertical="top"
        />

        {/* Photos */}
        <Text style={[styles.sectionLabel, { marginTop: spacing.md }]}>Photos (optional, max 3)</Text>
        <View style={styles.photoRow}>
          {photos.map((uri, idx) => (
            <TouchableOpacity
              key={idx}
              onPress={() => setPhotos(prev => prev.filter((_, i) => i !== idx))}
            >
              <Image source={{ uri }} style={styles.photo} />
              <View style={styles.photoRemove}><Text style={{ color: colors.white, fontSize: 12 }}>✕</Text></View>
            </TouchableOpacity>
          ))}
          {photos.length < 3 && (
            <TouchableOpacity style={styles.addPhotoBtn} onPress={pickPhoto}>
              <Text style={styles.addPhotoIcon}>📷</Text>
              <Text style={styles.addPhotoText}>Add Photo</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, (!reason || submitting) && { opacity: 0.5 }]}
          onPress={handleSubmit}
          disabled={!reason || submitting}
        >
          {submitting
            ? <ActivityIndicator color={colors.white} />
            : <Text style={styles.submitBtnText}>Submit Return Request</Text>
          }
        </TouchableOpacity>
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
  back: { fontSize: 16, color: colors.primary, fontWeight: '600' },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  body: { padding: spacing.md, paddingBottom: 40 },
  orderBadge: {
    alignSelf: 'flex-start', backgroundColor: '#FFF0E9',
    borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 4, marginBottom: spacing.sm,
  },
  orderBadgeText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  windowNote: {
    backgroundColor: '#FEF3C7', borderRadius: radius.sm,
    padding: spacing.sm, marginBottom: spacing.md,
    borderLeftWidth: 3, borderLeftColor: '#F59E0B',
  },
  windowNoteText: { fontSize: 13, color: '#92400E' },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  reasonChip: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 12, paddingHorizontal: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  reasonChipActive: { backgroundColor: '#FFF0E9' },
  radio: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioActive: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  reasonText: { fontSize: 14, color: colors.textPrimary },
  reasonTextActive: { fontWeight: '600', color: colors.primary },
  descInput: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm,
    padding: spacing.sm, fontSize: 14, color: colors.textPrimary,
    minHeight: 80,
  },
  photoRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginBottom: spacing.lg },
  photo: { width: 80, height: 80, borderRadius: radius.sm },
  photoRemove: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, width: 20, height: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  addPhotoBtn: {
    width: 80, height: 80, borderRadius: radius.sm,
    borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  addPhotoIcon: { fontSize: 22 },
  addPhotoText: { fontSize: 10, color: colors.textMuted },
  submitBtn: {
    backgroundColor: colors.primary, borderRadius: radius.pill,
    height: 52, alignItems: 'center', justifyContent: 'center',
  },
  submitBtnText: { color: colors.white, fontWeight: '700', fontSize: 16 },
})
