import React, { useState } from 'react'
import {
  View, Text, TouchableOpacity,
  StyleSheet, ScrollView,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RouteProp } from '@react-navigation/native'
import { colors, radius, spacing } from '../../constants/theme'
import { OnboardingStackParamList } from '../../navigation/types'

type Props = {
  navigation: NativeStackNavigationProp<OnboardingStackParamList, 'Category'>
  route: RouteProp<OnboardingStackParamList, 'Category'>
}

const CATEGORIES = [
  { id: 'food',       label: 'Food & Snacks',  icon: '🍱' },
  { id: 'jewellery',  label: 'Jewellery',       icon: '💍' },
  { id: 'clothing',   label: 'Clothing',        icon: '👗' },
  { id: 'home',       label: 'Home & Decor',    icon: '🏠' },
  { id: 'beauty',     label: 'Beauty',          icon: '💄' },
  { id: 'electronics',label: 'Electronics',     icon: '📱' },
  { id: 'other',      label: 'Other',           icon: '🛍️' },
] as const

type CategoryId = typeof CATEGORIES[number]['id']

export default function CategoryScreen({ navigation, route }: Props) {
  const { storeName } = route.params
  const [selected, setSelected] = useState<CategoryId | null>(null)

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.inner}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.stepRow}>
          {[0,1,2,3].map(i => (
            <View key={i} style={[styles.step, i <= 1 && styles.stepActive]} />
          ))}
        </View>

        <Text style={styles.heading}>What do you sell?</Text>
        <Text style={styles.sub}>Choose the category that best fits your store</Text>

        <View style={styles.grid}>
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat.id}
              style={[styles.card, selected === cat.id && styles.cardSelected]}
              onPress={() => setSelected(cat.id)}
              activeOpacity={0.8}
            >
              <Text style={styles.icon}>{cat.icon}</Text>
              <Text style={[styles.label, selected === cat.id && styles.labelSelected]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.button, !selected && styles.buttonDisabled]}
          onPress={() => selected && navigation.navigate('Location', { storeName, category: selected })}
          disabled={!selected}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>Continue →</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  inner: { padding: spacing.lg, paddingTop: spacing.xl, paddingBottom: 100 },
  back: { marginBottom: spacing.lg },
  backText: { fontSize: 16, color: colors.primary, fontWeight: '600' },
  stepRow: { flexDirection: 'row', gap: 6, marginBottom: spacing.xl },
  step: { flex: 1, height: 4, borderRadius: radius.pill, backgroundColor: colors.border },
  stepActive: { backgroundColor: colors.primary },
  heading: { fontSize: 26, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.xs },
  sub: { fontSize: 15, color: colors.textSecondary, marginBottom: spacing.xl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  card: {
    width: '47%', borderRadius: radius.lg,
    padding: spacing.md, alignItems: 'center',
    borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardSelected: { borderColor: colors.primary, backgroundColor: '#FFF0E9' },
  icon: { fontSize: 28, marginBottom: spacing.xs },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, textAlign: 'center' },
  labelSelected: { color: colors.primary },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: spacing.lg, backgroundColor: colors.white,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  button: {
    backgroundColor: colors.primary, borderRadius: radius.pill,
    height: 52, alignItems: 'center', justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
})
