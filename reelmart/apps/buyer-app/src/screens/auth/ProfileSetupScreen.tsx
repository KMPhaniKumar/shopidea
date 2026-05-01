import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useAuthStore } from '../../store/authStore'
import { colors, radius, spacing } from '../../constants/theme'
import { AuthStackParamList } from '../../navigation/types'

type Props = { navigation: NativeStackNavigationProp<AuthStackParamList, 'ProfileSetup'> }

export default function ProfileSetupScreen({ navigation }: Props) {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const updateProfile = useAuthStore(s => s.updateProfile)

  async function handleContinue() {
    if (name.trim().length < 2) {
      Alert.alert('Enter your name', 'Name must be at least 2 characters.')
      return
    }
    setLoading(true)
    const { error } = await updateProfile({ name: name.trim(), role: 'buyer' })
    setLoading(false)
    if (error) {
      Alert.alert('Error', error)
      return
    }
    navigation.replace('Done')
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>👋</Text>
        </View>

        <Text style={styles.heading}>What's your name?</Text>
        <Text style={styles.sub}>So sellers know who placed the order</Text>

        <Text style={styles.label}>Your Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Arjun Kumar"
          placeholderTextColor={colors.textMuted}
          value={name}
          onChangeText={setName}
          autoFocus
          maxLength={50}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color={colors.white} />
            : <Text style={styles.buttonText}>Start Shopping →</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  inner: { flexGrow: 1, padding: spacing.lg, justifyContent: 'center' },
  iconContainer: {
    width: 80, height: 80,
    backgroundColor: '#FFF0E9',
    borderRadius: radius.xl,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  icon: { fontSize: 36 },
  heading: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  sub: {
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 52,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: spacing.xl,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
})
