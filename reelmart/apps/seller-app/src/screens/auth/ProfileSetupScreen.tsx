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
    const { error } = await updateProfile({ name: name.trim(), role: 'seller' })
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
          <Text style={styles.icon}>🏪</Text>
        </View>

        <Text style={styles.heading}>Set up your profile</Text>
        <Text style={styles.sub}>Just your name to get started. You can add more details later.</Text>

        <Text style={styles.label}>Your Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Priya Sharma"
          placeholderTextColor={colors.textMuted}
          value={name}
          onChangeText={setName}
          autoFocus
          maxLength={50}
        />

        <View style={styles.roleCard}>
          <Text style={styles.roleIcon}>✓</Text>
          <View style={styles.roleInfo}>
            <Text style={styles.roleTitle}>Seller Account</Text>
            <Text style={styles.roleDesc}>Manage your store, products and orders</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color={colors.white} />
            : <Text style={styles.buttonText}>Start Selling →</Text>
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
    lineHeight: 22,
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
    marginBottom: spacing.lg,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF0E9',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.xl,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: '#FFD5BE',
  },
  roleIcon: { fontSize: 20, color: colors.primary, fontWeight: '800' },
  roleInfo: { flex: 1 },
  roleTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  roleDesc: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
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
