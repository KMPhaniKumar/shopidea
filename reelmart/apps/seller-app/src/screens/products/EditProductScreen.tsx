import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, Image,
  StyleSheet, ScrollView, ActivityIndicator, Alert, Switch,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RouteProp } from '@react-navigation/native'
import { colors, radius, spacing } from '../../constants/theme'
import { updateProduct, deleteProduct, VariantGroup } from '../../services/productService'
import { useSellerStore } from '../../store/sellerStore'
import { useProductStore } from '../../store/productStore'
import VariantBuilder from '../../components/products/VariantBuilder'
import type { ProductWithVariants } from '../../store/productStore'

type Props = {
  navigation: NativeStackNavigationProp<any>
  route: RouteProp<{ EditProduct: { product: ProductWithVariants } }, 'EditProduct'>
}

const MAX_PHOTOS = 5

export default function EditProductScreen({ navigation, route }: Props) {
  const { product } = route.params
  const store = useSellerStore(s => s.store)
  const { updateProduct: updateStore, removeProduct } = useProductStore()

  const [name, setName] = useState(product.name)
  const [description, setDescription] = useState(product.description ?? '')
  const [price, setPrice] = useState(String(product.price))
  const [comparePrice, setComparePrice] = useState(product.compare_price ? String(product.compare_price) : '')
  const [isUnlimited, setIsUnlimited] = useState(product.stock_type === 'unlimited')
  const [stockCount, setStockCount] = useState(String(product.stock_count))
  const [lowStock, setLowStock] = useState(String(product.low_stock_threshold))
  const [existingImages, setExistingImages] = useState<string[]>(product.images)
  const [newImageUris, setNewImageUris] = useState<string[]>([])
  const [variants, setVariants] = useState<VariantGroup[]>(
    product.product_variants.reduce<VariantGroup[]>((groups, v) => {
      const existing = groups.find(g => g.type === v.variant_type)
      const opt = { name: v.name, priceAdjustment: v.price_adjustment, stock: v.stock_count }
      if (existing) { existing.options.push(opt); return groups }
      return [...groups, { type: v.variant_type as VariantGroup['type'], options: [opt] }]
    }, [])
  )
  const [loading, setLoading] = useState(false)

  async function pickImage() {
    const total = existingImages.length + newImageUris.length
    if (total >= MAX_PHOTOS) { Alert.alert('Max photos', `Up to ${MAX_PHOTOS} photos allowed.`); return }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.9,
    })
    if (!result.canceled) setNewImageUris(prev => [...prev, result.assets[0].uri])
  }

  async function handleSave() {
    if (name.trim().length < 2) { Alert.alert('Check details', 'Enter a product name.'); return }
    const p = parseFloat(price)
    if (!price || isNaN(p) || p <= 0) { Alert.alert('Check details', 'Enter a valid price.'); return }
    if (!store) return

    setLoading(true)
    try {
      await updateProduct(product.id, store.id, {
        name, description, price: p,
        comparePrice: comparePrice ? parseFloat(comparePrice) : undefined,
        stockType: isUnlimited ? 'unlimited' : 'counted',
        stockCount: parseInt(stockCount) || 0,
        lowStockThreshold: parseInt(lowStock) || 5,
        imageUris: newImageUris,
        existingImages,
        variants,
      })
      updateStore(product.id, {
        name: name.trim(),
        price: p,
        stock_type: isUnlimited ? 'unlimited' : 'counted',
        stock_count: parseInt(stockCount) || 0,
      })
      navigation.goBack()
    } catch (e: any) {
      Alert.alert('Error', e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    Alert.alert('Delete Product', `Delete "${product.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          removeProduct(product.id)
          await deleteProduct(product.id)
          navigation.goBack()
        },
      },
    ])
  }

  const allImages = [...existingImages, ...newImageUris]

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Edit Product</Text>
        <TouchableOpacity
          style={[styles.saveBtn, loading && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? <ActivityIndicator size="small" color={colors.white} /> : <Text style={styles.saveBtnText}>Save</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
          {allImages.map((uri, i) => (
            <View key={i} style={styles.photoThumb}>
              <Image source={{ uri }} style={styles.thumbImg} />
              <TouchableOpacity
                style={styles.removePhoto}
                onPress={() => {
                  if (i < existingImages.length) setExistingImages(prev => prev.filter((_, idx) => idx !== i))
                  else setNewImageUris(prev => prev.filter((_, idx) => idx !== (i - existingImages.length)))
                }}
              >
                <Text style={styles.removePhotoText}>✕</Text>
              </TouchableOpacity>
              {i === 0 && <View style={styles.mainBadge}><Text style={styles.mainBadgeText}>Main</Text></View>}
            </View>
          ))}
          {allImages.length < MAX_PHOTOS && (
            <TouchableOpacity style={styles.addPhoto} onPress={pickImage}>
              <Text style={styles.addPhotoIcon}>📷</Text>
              <Text style={styles.addPhotoText}>{allImages.length}/{MAX_PHOTOS}</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        <Text style={styles.label}>Product Name *</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} maxLength={80} />

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.textarea]} value={description}
          onChangeText={setDescription} multiline numberOfLines={3} maxLength={300}
        />

        <View style={styles.priceRow}>
          <View style={styles.priceField}>
            <Text style={styles.label}>Price *</Text>
            <View style={styles.priceInput}>
              <Text style={styles.rupee}>₹</Text>
              <TextInput style={styles.priceTextInput} keyboardType="decimal-pad" value={price} onChangeText={setPrice} />
            </View>
          </View>
          <View style={styles.priceField}>
            <Text style={styles.label}>Original Price</Text>
            <View style={[styles.priceInput, styles.comparePriceInput]}>
              <Text style={styles.rupee}>₹</Text>
              <TextInput style={styles.priceTextInput} keyboardType="decimal-pad" value={comparePrice} onChangeText={setComparePrice} />
            </View>
          </View>
        </View>

        <View style={styles.stockHeader}>
          <Text style={styles.label}>Stock</Text>
          <View style={styles.unlimitedRow}>
            <Text style={styles.unlimitedLabel}>Unlimited</Text>
            <Switch
              value={isUnlimited} onValueChange={setIsUnlimited}
              trackColor={{ false: colors.border, true: '#FFD5BE' }}
              thumbColor={isUnlimited ? colors.primary : colors.textMuted}
            />
          </View>
        </View>
        {!isUnlimited && (
          <View style={styles.stockRow}>
            <View style={styles.stockField}>
              <Text style={styles.stockLabel}>Quantity</Text>
              <TextInput style={styles.stockInput} keyboardType="number-pad" value={stockCount} onChangeText={setStockCount} />
            </View>
            <View style={styles.stockField}>
              <Text style={styles.stockLabel}>Low stock alert at</Text>
              <TextInput style={styles.stockInput} keyboardType="number-pad" value={lowStock} onChangeText={setLowStock} />
            </View>
          </View>
        )}

        <Text style={[styles.label, { marginTop: spacing.md }]}>Variants</Text>
        <VariantBuilder variants={variants} onChange={setVariants} basePrice={parseFloat(price) || 0} />

        <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
          <Text style={styles.deleteBtnText}>Delete Product</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, paddingTop: 52,
  },
  cancel: { fontSize: 16, color: colors.textSecondary },
  title: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  saveBtn: { backgroundColor: colors.primary, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, minWidth: 64, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  form: { padding: spacing.md, paddingBottom: 40 },
  photoRow: { marginBottom: spacing.md },
  photoThumb: { width: 96, height: 96, borderRadius: radius.md, marginRight: spacing.sm, overflow: 'hidden', position: 'relative' },
  thumbImg: { width: '100%', height: '100%' },
  removePhoto: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.55)', width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  removePhotoText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  mainBadge: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(255,107,43,0.85)', alignItems: 'center', paddingVertical: 2 },
  mainBadgeText: { color: colors.white, fontSize: 10, fontWeight: '700' },
  addPhoto: { width: 96, height: 96, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  addPhotoIcon: { fontSize: 24, marginBottom: 4 },
  addPhotoText: { fontSize: 12, color: colors.textMuted, fontWeight: '500' },
  label: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: spacing.xs },
  input: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 52, fontSize: 16, color: colors.textPrimary, marginBottom: spacing.md },
  textarea: { height: 88, paddingTop: spacing.sm, textAlignVertical: 'top' },
  priceRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xs },
  priceField: { flex: 1 },
  priceInput: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 52, marginBottom: spacing.xs },
  comparePriceInput: { borderStyle: 'dashed' },
  rupee: { fontSize: 16, color: colors.textSecondary, marginRight: 4 },
  priceTextInput: { flex: 1, fontSize: 18, fontWeight: '600', color: colors.textPrimary },
  stockHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  unlimitedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  unlimitedLabel: { fontSize: 14, color: colors.textSecondary },
  stockRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  stockField: { flex: 1 },
  stockLabel: { fontSize: 13, color: colors.textSecondary, marginBottom: 4 },
  stockInput: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 48, fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  deleteBtn: { marginTop: spacing.xl, borderWidth: 1.5, borderColor: colors.error, borderRadius: radius.pill, height: 48, alignItems: 'center', justifyContent: 'center' },
  deleteBtnText: { color: colors.error, fontSize: 15, fontWeight: '700' },
})
