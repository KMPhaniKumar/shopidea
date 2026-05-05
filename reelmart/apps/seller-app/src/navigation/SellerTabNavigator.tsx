import React from 'react'
import { Text } from 'react-native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { colors } from '../constants/theme'
import DashboardScreen from '../screens/dashboard/DashboardScreen'
import ProductListScreen from '../screens/products/ProductListScreen'
import OrderListScreen from '../screens/orders/OrderListScreen'
import SettingsScreen from '../screens/settings/SettingsScreen'

const Tab = createBottomTabNavigator()

export default function SellerTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          borderTopColor: colors.border,
          borderTopWidth: 1,
          paddingBottom: 10,
          paddingTop: 8,
          height: 68,
          backgroundColor: colors.white,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarLabel: 'Dashboard',
          tabBarIcon: () => <Text style={{ fontSize: 22 }}>🏠</Text>,
        }}
      />
      <Tab.Screen
        name="Products"
        component={ProductListScreen}
        options={{
          tabBarLabel: 'Products',
          tabBarIcon: () => <Text style={{ fontSize: 22 }}>📦</Text>,
        }}
      />
      <Tab.Screen
        name="Orders"
        component={OrderListScreen}
        options={{
          tabBarLabel: 'Orders',
          tabBarIcon: () => <Text style={{ fontSize: 22 }}>📋</Text>,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: () => <Text style={{ fontSize: 22 }}>⚙️</Text>,
        }}
      />
    </Tab.Navigator>
  )
}
