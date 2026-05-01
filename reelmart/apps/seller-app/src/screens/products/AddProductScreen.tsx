import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, Image,
  StyleSheet, ScrollView, ActivityIndicator, Alert, Switch,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { colors, radius, spacing } from '../../constants/theme'
import { createProduct, VariantGroup } from '../../services/productService'
import { useSellerStore } from '../../store/sellerStore'
import { useProductStore } from '../../store/productStore'
import VariantBuilder from '../../components/products/VariantBuilder'

type Props = { navigation: NativeStackNavigationProp<any> }

const MAX_PHOTOS = 5

export default function AddProductScreen({ navigation }: Props) {
  const store = useSellerStore(s => s.store)
  const addProduct = useProductStore(s => s.addProduct)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [comparePrice, setComparePrice] = useState('')
  const [isUnlimited, setIsUnlimited] = useState(true)
  const [stockCount, setStockCount] = useState('10')
  const [lowStock, setLowStock] = useState('5')
  const [imageUris, setImageUris] = useState<string[]>([])
  const [variants, setVariants] = useState<VariantGroup[]>([])
  const [loading, setLoading] = useState(false)

  async function pickImage() {
    if (imageUris.length >= MAX_PHOTOS) {
      Alert.alert('Max photos', `You can add up to ${MAX_PHOTOS} photos.`)
      return
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow access to your photos.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    })
    if (!result.canceled) {
      setImageUris(prev => [...prev, result.assets[0].uri])
    }
  }

  function removeImage(index: number) {
    setImageUris(prev => prev.filter((_, i) => i !== index))
  }

  function validate(): string | null {
    if (name.trim().length < 2) return 'Enter a product name (min 2 characters).'
    const p = parseFloat(price)
    if (!price || isNaN(p) || p <= 0) return 'Enter a valid price.'
    if (!isUnlimited && (parseInt(stockCount) < 0)) return 'Enter a valid stock count.'
    for (const group of variants) {
      for (const opt of group.options) {
        if (!opt.name.trim()) return 'Fill in all variant option names.'
      }
    }
    return null
  }

  async function handleSave() {
    const err = validate()
    if (err) { Alert.alert('Check details', err); return }
    if (!store) return

    setLoading(true)
    try {
      const product = await createProduct({
        storeId: store.id,
        name: name.trim(),
        description: description.trim() || undefined,
        price: parseFloat(price),
        comparePrice: comparePrice ? parseFloat(comparePrice) : undefined,
        stockType: isUnlimited ? 'unlimited' : 'counted',
        stockCount: isUnlimited ? 0 : parseInt(stockCount),
        lowStockThreshold: parseInt(lowStock) || 5,
        imageUris,
        variants,
      })
      addProduct(product as any)
      navigation.goBack()
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save product.')
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
        <Text style={styles.title}>Add Product</Text>
        <TouchableOpacity
          style={[styles.saveBtn, loading && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator size="small" color={colors.white} />
            : <Text style={styles.saveBtnText}>Save</Text>
          }
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">

        {/* Photo picker */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
          {imageUris.map((uri, i) => (
            <View key={i} style={styles.photoThumb}>
              <Image source={{ uri }} style={styles.thumbImg} />
              <TouchableOpacity style={styles.removePhoto} onPress={() => removeImage(i)}>
                <Text style={styles.removePhotoText}>✕</Text>
              </TouchableOpacity>
              {i === 0 && <View style={styles.mainBadge}><Text style={styles.mainBadgeText}>Main</Text></View>}
            </View>
          ))}
          {imageUris.length < MAX_PHOTOS && (
            <TouchableOpacity style={styles.addPhoto} onPress={pickImage}>
              <Text style={styles.addPhotoIcon}>📷</Text>
              <Text style={styles.addPhotoText}>{imageUris.length}/{MAX_PHOTOS}</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {/* Name */}
        <Text style={styles.label}>Product Name *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Homemade Mango Pickle"
          placeholderTextColor={colors.textMuted}
          value={name}
          onChangeText={setName}
          maxLength={80}
        />

        {/* Description */}
        <Text style={styles.label}>Description (optional)</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          placeholder="Ingredients, size, how to use..."
          placeholderTextColor={colors.textMuted}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
          maxLength={300}
        />

        {/* Pricing */}
        <View style={styles.priceRow}>
          <View style={styles.priceField}>
            <Text style={styles.label}>Price *</Text>
            <View style={styles.priceInput}>
              <Text style={styles.rupee}>₹</Text>
              <TextInput
                style={styles.priceTextInput}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                value={price}
                onChangeText={setPrice}
              />
            </View>
          </View>
          <View style={styles.priceField}>
            <Text style={styles.label}>Original Price</Text>
            <View style={[styles.priceInput, styles.comparePriceInput]}>
              <Text style={styles.rupee}>₹</Text>
              <TextInput
                style={styles.priceTextInput}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                value={comparePrice}
                onChangeText={setComparePrice}
              />
            </View>
          </View>
        </View>
        {comparePrice && parseFloat(comparePrice) > parseFloat(price || '0') && (
          <Text style={styles.discountBadge}>
            {Math.round((1 - parseFloat(price) / parseFloat(comparePrice)) * 100)}% off
          </Text>
        )}

        {/* Stock */}
        <View style={styles.stockHeader}>
          <Text style={styles.label}>Stock</Text>
          <View style={styles.unlimitedRow}>
            <Text style={styles.unlimitedLabel}>Unlimited</Text>
            <Switch
              value={isUnlimited}
              onValueChange={setIsUnlimited}
              trackColor={{ false: colors.border, true: '#FFD5BE' }}
              thumbColor={isUnlimited ? colors.primary : colors.textMuted}
            />
          </View>
        </View>
        {!isUnlimited && (
          <View style={styles.stockRow}>
            <View style={styles.stockField}>
              <Text style={styles.stockLabel}>Quantity</Text>
              <TextInput
                style={styles.stockInput}
                keyboardType="number-pad"
                value={stockCount}
                onChangeText={setStockCount}
              />
            </View>
            <View style={styles.stockField}>
              <Text style={styles.stockLabel}>Low stock alert at</Text>
              <TextInput
                style={styles.stockInput}
                keyboardType="number-pad"
                value={lowStock}
                onChangeText={setLowStock}
              />
            </View>
          </View>
        )}

        {/* Variants */}
        <Text style={[styles.label, { marginTop: spacing.md }]}>Variants (optional)</Text>
        <Text style={styles.hint}>Add sizes, colors, flavors, or weights</Text>
        <VariantBuilder
          variants={variants}
          onChange={setVariants}
          basePrice={parseFloat(price) || 0}
        />

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
    paddingTop: 52,
  },
  cancel: { fontSize: 16, color: colors.textSecondary },
  title: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  saveBtn: {
    backgroundColor: colors.primary, paddingHorizontal: spacing.md,
    paddingVertical: 8, borderRadius: radius.pill, minWidth: 64, alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  form: { padding: spacing.md, paddingBottom: 40 },
  photoRow: { marginBottom: spacing.md },
  photoThumb: { width: 96, height: 96, borderRadius: radius.md, marginRight: spacing.sm, overflow: 'hidden', position: 'relative' },
  thumbImg: { width: '100%', height: '100%' },
  removePhoto: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: 'rgba(0,0,0,0.55)', width: 22, height: 22,
    borderRadius: 11, alignItems: 'center', justifyContent: 'center',
  },
  removePhotoText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  mainBadge: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(255,107,43,0.85)', alignItems: 'center', paddingVertical: 2,
  },
  mainBadgeText: { color: colors.white, fontSize: 10, fontWeight: '700' },
  addPhoto: {
    width: 96, height: 96, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface,
  },
  addPhotoIcon: { fontSize: 24, marginBottom: 4 },
  addPhotoText: { fontSize: 12, color: colors.textMuted, fontWeight: '500' },
  label: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: spacing.xs },
  input: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, height: 52,
    fontSize: 16, color: colors.textPrimary, marginBottom: spacing.md,
  },
  textarea: { height: 88, paddingTop: spacing.sm, textAlignVertical: 'top' },
  priceRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xs },
  priceField: { flex: 1 },
  priceInput: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, height: 52, marginBottom: spacing.xs,
  },
  comparePriceInput: { borderStyle: 'dashed' },
  rupee: { fontSize: 16, color: colors.textSecondary, marginRight: 4 },
  priceTextInput: { flex: 1, fontSize: 18, fontWeight: '600', color: colors.textPrimary },
  discountBadge: {
    backgroundColor: '#DCFCE7', color: '#16A34A',
    fontSize: 13, fontWeight: '700', paddingHorizontal: spacing.sm,
    paddingVertical: 4, borderRadius: radius.sm, alignSelf: 'flex-start',
    marginBottom: spacing.md,
  },
  stockHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  unlimitedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  unlimitedLabel: { fontSize: 14, color: colors.textSecondary },
  stockRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  stockField: { flex: 1 },
  stockLabel: { fontSize: 13, color: colors.textSecondary, marginBottom: 4 },
  stockInput: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, height: 48,
    fontSize: 16, fontWeight: '600', color: colors.textPrimary,
  },
  hint: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.sm, marginTop: -4 },
})
