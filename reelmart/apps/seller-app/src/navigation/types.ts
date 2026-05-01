export type AuthStackParamList = {
  Phone: undefined
  OTP: { phone: string }
  ProfileSetup: undefined
  Done: undefined
}

export type OnboardingStackParamList = {
  StoreName: undefined
  Category: { storeName: string }
  Location: { storeName: string; category: string }
  Logo: { storeName: string; category: string; city: string; area?: string; whatsappNumber?: string }
  StoreReady: { storeId: string; storeName: string; slug: string }
}

export type MainTabParamList = {
  Dashboard: undefined
  Orders: undefined
  Products: undefined
  Store: undefined
  Profile: undefined
}
