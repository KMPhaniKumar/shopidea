import React, { useEffect } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useAuthStore } from '../store/authStore'
import { useSellerStore } from '../store/sellerStore'
import { colors } from '../constants/theme'

import PhoneScreen from '../screens/auth/PhoneScreen'
import OTPScreen from '../screens/auth/OTPScreen'
import ProfileSetupScreen from '../screens/auth/ProfileSetupScreen'
import StoreNameScreen from '../screens/onboarding/StoreNameScreen'
import CategoryScreen from '../screens/onboarding/CategoryScreen'
import LocationScreen from '../screens/onboarding/LocationScreen'
import LocationPickerScreen from '../screens/onboarding/LocationPickerScreen'
import LogoScreen from '../screens/onboarding/LogoScreen'
import StoreReadyScreen from '../screens/onboarding/StoreReadyScreen'
import AddProductScreen from '../screens/products/AddProductScreen'
import EditProductScreen from '../screens/products/EditProductScreen'
import EditStoreScreen from '../screens/store/EditStoreScreen'
import OrderDetailScreen from '../screens/orders/OrderDetailScreen'
import StoreReviewsScreen from '../screens/reviews/StoreReviewsScreen'
import AnalyticsScreen from '../screens/analytics/AnalyticsScreen'
import PayoutHistoryScreen from '../screens/payouts/PayoutHistoryScreen'
import BankAccountScreen from '../screens/payouts/BankAccountScreen'
import CouponsScreen from '../screens/marketing/CouponsScreen'
import BroadcastScreen from '../screens/marketing/BroadcastScreen'
import SellerTabNavigator from './SellerTabNavigator'

const Stack = createNativeStackNavigator()

export default function RootNavigator() {
  const { session, profile, loading: authLoading, initialize } = useAuthStore()
  const { store, loading: storeLoading, fetchStore } = useSellerStore()

  useEffect(() => {
    const unsubscribe = initialize()
    return unsubscribe
  }, [])

  useEffect(() => {
    if (session?.user) fetchStore(session.user.id)
  }, [session?.user?.id])

  if (authLoading || (session && storeLoading)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  const isAuthenticated = !!session
  const hasProfile = !!profile?.name
  const hasStore = !!store

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <>
            <Stack.Screen name="Phone" component={PhoneScreen} />
            <Stack.Screen name="OTP" component={OTPScreen} />
            <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
          </>
        ) : !hasProfile ? (
          <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
        ) : !hasStore ? (
          <>
            <Stack.Screen name="StoreName" component={StoreNameScreen} />
            <Stack.Screen name="Category" component={CategoryScreen} />
            <Stack.Screen name="Location" component={LocationScreen} />
            <Stack.Screen name="LocationPicker" component={LocationPickerScreen} options={{ presentation: 'fullScreenModal' }} />
            <Stack.Screen name="Logo" component={LogoScreen} />
            <Stack.Screen name="StoreReady" component={StoreReadyScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Tabs" component={SellerTabNavigator} />
            <Stack.Screen name="AddProduct" component={AddProductScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="EditProduct" component={EditProductScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="EditStore" component={EditStoreScreen} />
            <Stack.Screen name="OrderDetail" component={OrderDetailScreen} />
            <Stack.Screen name="StoreReviews" component={StoreReviewsScreen} />
            <Stack.Screen name="Analytics" component={AnalyticsScreen} />
            <Stack.Screen name="PayoutHistory" component={PayoutHistoryScreen} />
            <Stack.Screen name="BankAccount" component={BankAccountScreen} />
            <Stack.Screen name="Coupons" component={CouponsScreen} />
            <Stack.Screen name="Broadcast" component={BroadcastScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}
