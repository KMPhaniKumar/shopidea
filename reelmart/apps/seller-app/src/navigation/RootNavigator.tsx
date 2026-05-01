import React, { useEffect } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useAuthStore } from '../store/authStore'
import { useSellerStore } from '../store/sellerStore'
import { colors } from '../constants/theme'

// Auth
import PhoneScreen from '../screens/auth/PhoneScreen'
import OTPScreen from '../screens/auth/OTPScreen'
import ProfileSetupScreen from '../screens/auth/ProfileSetupScreen'

// Onboarding
import StoreNameScreen from '../screens/onboarding/StoreNameScreen'
import CategoryScreen from '../screens/onboarding/CategoryScreen'
import LocationScreen from '../screens/onboarding/LocationScreen'
import LogoScreen from '../screens/onboarding/LogoScreen'
import StoreReadyScreen from '../screens/onboarding/StoreReadyScreen'

// Products
import ProductListScreen from '../screens/products/ProductListScreen'
import AddProductScreen from '../screens/products/AddProductScreen'
import EditProductScreen from '../screens/products/EditProductScreen'

// Store
import EditStoreScreen from '../screens/store/EditStoreScreen'

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
            <Stack.Screen name="Logo" component={LogoScreen} />
            <Stack.Screen name="StoreReady" component={StoreReadyScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="ProductList" component={ProductListScreen} />
            <Stack.Screen name="AddProduct" component={AddProductScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="EditProduct" component={EditProductScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="EditStore" component={EditStoreScreen} options={{ headerShown: true, title: 'Edit Store' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}
