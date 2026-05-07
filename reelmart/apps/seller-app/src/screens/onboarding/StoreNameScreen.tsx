import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { colors, radius, spacing } from '../../constants/theme'
import { generateSlug } from '../../services/storeService'
import { OnboardingStackParamList } from '../../navigation/types'

type Props = { navigation: NativeStackNavigationProp<OnboardingStackParamList, 'StoreName'> }

export default function StoreNameScreen({ navigation }: Props) {
  const [storeName, setStoreName] = useState('')
  const slug = generateSlug(storeName)
  const isValid = storeName.trim().length >= 3

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <View style={styles.stepRow}>
          <View style={[styles.step, styles.stepActive]} />
          <View style={styles.step} />
          <View style={styles.step} />
          <View style={styles.step} />
        </View>

        <Text style={styles.heading}>What's your shop name?</Text>
        <Text style={styles.sub}>This becomes your unique store link</Text>

        <TextInput
          style={styles.input}
          placeholder="e.g. Priya's Kitchen"
          placeholderTextColor={colors.textMuted}
          value={storeName}
          onChangeText={setStoreName}
          maxLength={40}
          autoFocus
        />

        {storeName.length >= 3 && (
          <View style={styles.urlPreview}>
            <Text style={styles.urlLabel}>Your store link</Text>
            <View style={styles.urlBox}>
              <Text style={styles.urlDomain}>reelmart.in/store/
              <Text style={styles.urlSlug}>{slug}</Text>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[styles.button, !isValid && styles.buttonDisabled]}
          onPress={() => navigation.navigate('Category', { storeName: storeName.trim() })}
          disabled={!isValid}
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
  inner: { flexGrow: 1, padding: spacing.lg, paddingTop: spacing.xl },
  stepRow: { flexDirection: 'row', gap: 6, marginBottom: spacing.xl },
  step: {
    flex: 1, height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  stepActive: { backgroundColor: colors.primary },
  heading: {
    fontSize: 26, fontWeight: '700',
    color: colors.textPrimary, marginBottom: spacing.xs,
  },
  sub: { fontSize: 15, color: colors.textSecondary, marginBottom: spacing.xl },
  input: {
    borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 56, fontSize: 18, fontWeight: '600',
    color: colors.textPrimary, marginBottom: spacing.lg,
  },
  urlPreview: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.xl,
    borderWidth: 1, borderColor: colors.border,
  },
  urlLabel: { fontSize: 12, color: colors.textMuted, marginBottom: 6, fontWeight: '500' },
  urlBox: { flexDirection: 'row', alignItems: 'center' },
  urlDomain: { fontSize: 15, color: colors.textSecondary },
  urlSlug: { fontSize: 15, fontWeight: '700', color: colors.primary },
  button: {
    backgroundColor: colors.primary, borderRadius: radius.pill,
    height: 52, alignItems: 'center', justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
})
