import React, { useEffect } from 'react'
import { ActivityIndicator, View, Text } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useAuthStore } from '../store/authStore'
import { colors } from '../constants/theme'

import PhoneScreen from '../screens/auth/PhoneScreen'
import OTPScreen from '../screens/auth/OTPScreen'
import ProfileSetupScreen from '../screens/auth/ProfileSetupScreen'

// Placeholder — replaced in Agent 08 (discovery/home)
function MainApp() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 18, color: colors.primary, fontWeight: '700' }}>
        Welcome to ReelMart
      </Text>
    </View>
  )
}

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
          <Stack.Screen name="Main" component={MainApp} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}
