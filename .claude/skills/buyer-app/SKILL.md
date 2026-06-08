---
name: buyer-app
description: Deep context + dev guide for ReelMart's buyer mobile app (React Native / Expo) — screens, navigation, services, theme, and EAS builds. Use for any buyer-app (mobile) work. The seller-app is parked; buyer-app is the only active mobile app.
---

# buyer-app — React Native / Expo (mobile)

**Dir:** `reelmart/apps/buyer-app` · React Native + **Expo** · React Navigation · **StyleSheet** (not Tailwind) · Zustand. The `seller-app` folder is parked.

## Structure
- **screens/**: `auth/{PhoneScreen,OTPScreen,ProfileSetupScreen}`, `home/HomeScreen` (search shows products + sellers), `store/StorefrontScreen`, `cart/CartScreen`, `checkout/{CheckoutScreen,PaymentScreen}`, `orders/{OrderHistoryScreen,OrderTrackingScreen}`, `profile/{ProfileScreen,AddressesScreen,WishlistScreen}`, `returns/ReturnRequestScreen`, `reviews/WriteReviewScreen`, `shared/LocationPickerScreen`.
- **navigation/**: `RootNavigator.tsx`, `TabNavigator.tsx`, `types.ts`.
- **services/**: `cartService`, `discoveryService`, `orderService`, `profileService`, `returnService`, `reviewService`.
- **lib/**: `api.ts` (base `EXPO_PUBLIC_API_URL`, default localhost:3001 → point at `https://api-dev.reelmart.in`), `supabase.ts`, `geocode.ts`, `imageUrl.ts`, `savedAddresses.ts`.
- **constants/theme.ts**: `primary #FF6B2B`, surface `#F9F9F9`, border `#EEEEEE`, text `#1A1A1A/#666/#AAA`, success `#25D366`, error `#E23744`.

## Auth & payments
- Login = MSG91 OTP (Phone → OTP → ProfileSetup). Dev test phone **9999999999 / 123456**.
- Payments via Razorpay (PaymentScreen) — test mode; secret never in the app, only the publishable key.

## Conventions
TypeScript, StyleSheet styling, React Navigation routing, services wrap the backend API + Supabase. Match `theme.ts` tokens. Indian-market: ₹, +91, 6-digit pincodes.

## Build (EAS)
EAS APK/AAB builds. Known gotchas (see memory `project_buyer_app_build`): `logo.png` was actually a JPEG; `react-native-razorpay` needs AGP 8 config; uses Expo CNG (prebuild). App icon edge-to-edge; unified login/OTP screen.

See **web-foundation** is NOT used here (separate stack); cross-ref the backend service skills (`order-service`, `payment-service`, `delivery-service`, `catalog-service`) and memory `project_buyer_app_build`.
