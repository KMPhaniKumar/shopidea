export type AuthStackParamList = {
  Phone: undefined
  OTP: { phone: string }
  ProfileSetup: undefined
  Done: undefined
}

export type OnboardingStackParamList = {
  StoreName: undefined
  Category: { storeName: string }
  Location: { storeName: string; category: string; pickedLocation?: PickedLocation }
  LocationPicker: { callbackScreen: string }
  Logo: { storeName: string; category: string; city: string; area?: string; whatsappNumber?: string; latitude?: number; longitude?: number }
  StoreReady: { storeId: string; storeName: string; slug: string }
}

export interface PickedLocation {
  line1: string
  area: string
  city: string
  state: string
  pincode: string
  latitude: number
  longitude: number
}

export type MainTabParamList = {
  Dashboard: undefined
  Orders: undefined
  Products: undefined
  Store: undefined
  Profile: undefined
}
