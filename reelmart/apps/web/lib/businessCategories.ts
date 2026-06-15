// Single source of truth for seller business types and the product
// sub-categories shown during product registration.
//
// Keeping both here guarantees the product category list always ALIGNS with
// the store's chosen business type: every business type has a matching set of
// sub-categories, and unknown/legacy values fall back to a small generic list
// (never the entire flattened set).

export const BUSINESS_TYPES = [
  'Fashion',
  'Jewellery',
  'Electronics',
  'Home & Kitchen',
  'Beauty & Wellness',
  'Handicrafts',
  'Books & Stationery',
  'Fitness',
  'Other',
] as const

// Fallback for the 'Other' business type and any unknown/legacy store category.
export const GENERIC_PRODUCT_CATEGORIES = ['General', 'Other']

// Product sub-categories keyed by business type. Keys must match BUSINESS_TYPES.
export const PRODUCT_CATEGORIES: Record<string, string[]> = {
  'Fashion': ['Sarees', 'Kurtis', 'Lehengas', "Men's Wear", 'Kids Wear', 'Western Wear'],
  'Jewellery': ['Gold Jewellery', 'Silver Jewellery', 'Artificial Jewellery', 'Bangles', 'Necklaces'],
  'Electronics': ['Mobile Accessories', 'Earphones', 'Chargers', 'Gadgets', 'Smart Watches'],
  'Home & Kitchen': ['Cookware', 'Home Decor', 'Furniture', 'Bedding', 'Storage'],
  'Beauty & Wellness': ['Skincare', 'Haircare', 'Makeup', 'Perfumes', 'Organic Products'],
  'Handicrafts': ['Pottery', 'Paintings', 'Handmade Bags', 'Embroidery', 'Wood Craft'],
  'Books & Stationery': ['Books', 'Notebooks', 'Art Supplies', 'Gifts'],
  'Fitness': ['Equipment', 'Supplements', 'Yoga Products', 'Sports Gear'],
  'Other': GENERIC_PRODUCT_CATEGORIES,
}

// Sub-categories to offer for a store's business type. Falls back to the small
// generic list for 'Other' / unknown values — NOT the full flattened set.
export function productCategoriesFor(storeCategory: string | null | undefined): string[] {
  if (storeCategory && PRODUCT_CATEGORIES[storeCategory]) return PRODUCT_CATEGORIES[storeCategory]
  return GENERIC_PRODUCT_CATEGORIES
}
