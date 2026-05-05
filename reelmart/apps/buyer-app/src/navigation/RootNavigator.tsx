import React, { useEffect } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useAuthStore } from '../store/authStore'
import { colors } from '../constants/theme'

import PhoneScreen from '../screens/auth/PhoneScreen'
import OTPScreen from '../screens/auth/OTPScreen'
import ProfileSetupScreen from '../screens/auth/ProfileSetupScreen'
import StorefrontScreen from '../screens/store/StorefrontScreen'
import CheckoutScreen from '../screens/checkout/CheckoutScreen'
import PaymentScreen from '../screens/checkout/PaymentScreen'
import OrderTrackingScreen from '../screens/orders/OrderTrackingScreen'
import WriteReviewScreen from '../screens/reviews/WriteReviewScreen'
import AddressesScreen from '../screens/profile/AddressesScreen'
import LocationPickerScreen from '../screens/shared/LocationPickerScreen'
import WishlistScreen from '../screens/profile/WishlistScreen'
import ReturnRequestScreen from '../screens/returns/ReturnRequestScreen'
import TabNavigator from './TabNavigator'

const Stack = createNativeStackNavigator()

export default function RootNavigator() {
  const { session, profile, loading, initialize } = useAuthStore()

  useEffect(() => {
    const unsubscribe = initialize()
    return unsubscribe
  }, [])

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  const isAuthenticated = !!session
  const needsProfile = isAuthenticated && !profile?.name

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <>
            <Stack.Screen name="Phone" component={PhoneScreen} />
            <Stack.Screen name="OTP" component={OTPScreen} />
            <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
          </>
        ) : needsProfile ? (
          <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
        ) : (
          <>
            <Stack.Screen name="Tabs" component={TabNavigator} />
            <Stack.Screen name="Storefront" component={StorefrontScreen} />
            <Stack.Screen name="OrderTracking" component={OrderTrackingScreen} />
            <Stack.Screen name="Addresses" component={AddressesScreen} />
            <Stack.Screen name="LocationPicker" component={LocationPickerScreen} options={{ presentation: 'fullScreenModal' }} />
            <Stack.Screen name="Wishlist" component={WishlistScreen} />
            <Stack.Screen name="Checkout" component={CheckoutScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="Payment" component={PaymentScreen} options={{ gestureEnabled: false }} />
            <Stack.Screen name="WriteReview" component={WriteReviewScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="ReturnRequest" component={ReturnRequestScreen} options={{ presentation: 'modal' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}
