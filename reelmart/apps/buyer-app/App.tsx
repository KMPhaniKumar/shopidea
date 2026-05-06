import React, { useEffect, useState } from 'react'
import { View, Image, StyleSheet, Animated } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import RootNavigator from './src/navigation/RootNavigator'

SplashScreen.preventAutoHideAsync()

export default function App() {
  const [ready, setReady] = useState(false)
  const opacity = React.useRef(new Animated.Value(1)).current

  useEffect(() => {
    // Let the JS bundle finish loading, then show our splash briefly
    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
        delay: 800,
      }).start(() => setReady(true))
      SplashScreen.hideAsync()
    }, 300)
    return () => clearTimeout(timer)
  }, [])

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="dark" />
      {ready && <RootNavigator />}
      {!ready && (
        <Animated.View style={[StyleSheet.absoluteFill, styles.splash, { opacity }]}>
          <Image
            source={require('./assets/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  splash: {
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: '65%',
    height: undefined,
    aspectRatio: 1536 / 1024,
  },
})
