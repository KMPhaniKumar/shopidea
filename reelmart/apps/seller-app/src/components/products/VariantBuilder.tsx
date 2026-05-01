import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView,
} from 'react-native'
import { colors, radius, spacing } from '../../constants/theme'
import type { VariantGroup } from '../../services/productService'

const VARIANT_TYPES = [
  { id: 'size',   label: 'Size',   examples: '500g, 1kg, Small, Large' },
  { id: 'color',  label: 'Color',  examples: 'Red, Blue, Green' },
  { id: 'flavor', label: 'Flavor', examples: 'Mango, Vanilla, Chocolate' },
  { id: 'weight', label: 'Weight', examples: '250g, 500g, 1kg' },
  { id: 'other',  label: 'Other',  examples: 'Any custom option' },
] as const

interface Props {
  variants: VariantGroup[]
  onChange: (variants: VariantGroup[]) => void
  basePrice: number
}

export default function VariantBuilder({ variants, onChange, basePrice }: Props) {
  const [showTypeMenu, setShowTypeMenu] = useState(false)

  function addGroup(type: VariantGroup['type']) {
    onChange([...variants, { type, options: [{ name: '', priceAdjustment: 0, stock: 0 }] }])
    setShowTypeMenu(false)
  }

  function removeGroup(groupIndex: number) {
    onChange(variants.filter((_, i) => i !== groupIndex))
  }

  function addOption(groupIndex: number) {
    const updated = [...variants]
    updated[groupIndex].options.push({ name: '', priceAdjustment: 0, stock: 0 })
    onChange(updated)
  }

  function removeOption(groupIndex: number, optionIndex: number) {
    const updated = [...variants]
    updated[groupIndex].options = updated[groupIndex].options.filter((_, i) => i !== optionIndex)
    if (updated[groupIndex].options.length === 0) {
      onChange(updated.filter((_, i) => i !== groupIndex))
    } else {
      onChange(updated)
    }
  }

  function updateOption(
    groupIndex: number,
    optionIndex: number,
    field: 'name' | 'priceAdjustment' | 'stock',
    value: string
  ) {
    const updated = [...variants]
    if (field === 'name') {
      updated[groupIndex].options[optionIndex].name = value
    } else if (field === 'priceAdjustment') {
      updated[groupIndex].options[optionIndex].priceAdjustment = parseFloat(value) || 0
    } else {
      updated[groupIndex].options[optionIndex].stock = parseInt(value) || 0
    }
    onChange(updated)
  }

  return (
    <View>
      {variants.map((group, gi) => {
        const typeInfo = VARIANT_TYPES.find(t => t.id === group.type)
        return (
          <View key={gi} style={styles.groupCard}>
            <View style={styles.groupHeader}>
              <View style={styles.groupTag}>
                <Text style={styles.groupTagText}>{typeInfo?.label}</Text>
              </View>
              <TouchableOpacity onPress={() => removeGroup(gi)}>
                <Text style={styles.removeGroup}>Remove</Text>
              </TouchableOpacity>
            </View>

            {group.options.map((opt, oi) => (
              <View key={oi} style={styles.optionRow}>
                <TextInput
                  style={[styles.optInput, styles.optName]}
                  placeholder={typeInfo?.examples.split(',')[0].trim()}
                  placeholderTextColor={colors.textMuted}
                  value={opt.name}
                  onChangeText={v => updateOption(gi, oi, 'name', v)}
                />
                <View style={styles.priceBox}>
                  <Text style={styles.pricePrefix}>₹</Text>
                  <TextInput
                    style={styles.priceInput}
                    placeholder={String(basePrice)}
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                    value={opt.priceAdjustment !== 0 ? String(basePrice + opt.priceAdjustment) : ''}
                    onChangeText={v => {
                      const entered = parseFloat(v) || 0
                      updateOption(gi, oi, 'priceAdjustment', String(entered - basePrice))
                    }}
                  />
                </View>
                <TouchableOpacity
                  style={styles.removeOpt}
                  onPress={() => removeOption(gi, oi)}
                >
                  <Text style={styles.removeOptText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity style={styles.addOption} onPress={() => addOption(gi)}>
              <Text style={styles.addOptionText}>+ Add option</Text>
            </TouchableOpacity>
          </View>
        )
      })}

      {showTypeMenu ? (
        <View style={styles.typeMenu}>
          {VARIANT_TYPES.filter(t => !variants.find(v => v.type === t.id)).map(type => (
            <TouchableOpacity
              key={type.id}
              style={styles.typeOption}
              onPress={() => addGroup(type.id as VariantGroup['type'])}
            >
              <Text style={styles.typeLabel}>{type.label}</Text>
              <Text style={styles.typeExamples}>{type.examples}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <TouchableOpacity style={styles.addVariantBtn} onPress={() => setShowTypeMenu(true)}>
          <Text style={styles.addVariantText}>+ Add Variants</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  groupCard: {
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.md,
    marginBottom: spacing.sm,
  },
  groupHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: spacing.sm,
  },
  groupTag: {
    backgroundColor: '#FFF0E9', paddingHorizontal: spacing.sm,
    paddingVertical: 4, borderRadius: radius.sm,
  },
  groupTagText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  removeGroup: { fontSize: 13, color: colors.error },
  optionRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.xs, alignItems: 'center' },
  optInput: {
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.sm, paddingHorizontal: spacing.sm,
    height: 40, fontSize: 14, color: colors.textPrimary,
  },
  optName: { flex: 2 },
  priceBox: {
    flex: 1.5, flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.sm, paddingHorizontal: spacing.sm,
    height: 40,
  },
  pricePrefix: { fontSize: 14, color: colors.textSecondary, marginRight: 2 },
  priceInput: { flex: 1, fontSize: 14, color: colors.textPrimary },
  removeOpt: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center',
  },
  removeOptText: { fontSize: 12, color: colors.error, fontWeight: '700' },
  addOption: { marginTop: spacing.xs },
  addOptionText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  typeMenu: {
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, overflow: 'hidden', marginBottom: spacing.sm,
  },
  typeOption: {
    padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  typeLabel: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  typeExamples: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  addVariantBtn: {
    borderWidth: 1.5, borderColor: colors.primary, borderStyle: 'dashed',
    borderRadius: radius.md, padding: spacing.md,
    alignItems: 'center', marginBottom: spacing.sm,
  },
  addVariantText: { fontSize: 14, fontWeight: '600', color: colors.primary },
})
