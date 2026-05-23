import React, { useEffect, useRef, useState } from 'react'
import { View, StyleSheet, Animated, Platform } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import RootNavigator from './src/navigation/RootNavigator'

const isAndroid = Platform.OS === 'android'

// Both platforms present the full wordmark in-app so loading looks the same.
// iOS hands off seamlessly from its full-screen native splash (splash.png shows
// the same wordmark), so the logo appears instantly and just fades out. Android's
// system splash is a circular symbol, so we gently fade + scale the wordmark in —
// that makes the handoff feel like a deliberate logo reveal rather than a hard cut.
const SPLASH_IMAGE = require('./assets/logo.png')

SplashScreen.preventAutoHideAsync()

export default function App() {
  const [ready, setReady] = useState(false)
  const overlayOpacity = useRef(new Animated.Value(1)).current
  // On Android the wordmark animates in; on iOS it's already there (matches native splash).
  const logoOpacity = useRef(new Animated.Value(isAndroid ? 0 : 1)).current
  const logoScale = useRef(new Animated.Value(isAndroid ? 0.92 : 1)).current

  useEffect(() => {
    // Let the JS bundle settle, then present our splash and fade it out.
    const timer = setTimeout(() => {
      if (isAndroid) {
        // Soft logo reveal to smooth the circular-symbol → wordmark transition.
        Animated.parallel([
          Animated.timing(logoOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.spring(logoScale, { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }),
        ]).start()
      }

      // Reveal our in-app splash (hide native), then fade the whole overlay out
      // once the wordmark has had a beat to present.
      SplashScreen.hideAsync()
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 400,
        delay: isAndroid ? 1000 : 800,
        useNativeDriver: true,
      }).start(() => setReady(true))
    }, 300)
    return () => clearTimeout(timer)
  }, [])

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="dark" />
      {ready && <RootNavigator />}
      {!ready && (
        <Animated.View style={[StyleSheet.absoluteFill, styles.splash, { opacity: overlayOpacity }]}>
          <Animated.Image
            source={SPLASH_IMAGE}
            style={[styles.logo, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}
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
