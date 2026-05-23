# feat_01_maps_location_picker — Google Maps Location Picker

**Feature:** Flipkart-style Google Maps location picker for seller onboarding and buyer address entry  
**Apps affected:** Seller App (onboarding), Buyer App (addresses + checkout)  
**New packages:** `react-native-maps`, `react-native-google-places-autocomplete` (both apps); `expo-location` (seller app only — buyer app already has it)

---

## UX Design (both apps — identical picker screen)

```
┌─────────────────────────────────────────┐
│ ← Back   🔍 Search area, landmark...   │  ← Google Places Autocomplete
├─────────────────────────────────────────┤
│                                         │
│         Full-screen MapView             │
│         (user can pan/drag)             │
│                                         │
│                  📍                     │  ← Fixed center pin (SVG)
│           (map moves under it)          │
│                                         │
│                          [📌 GPS]       │  ← Current location button
└─────────────────────────────────────────┤
│ Delivering to:                          │  ← Bottom card
│ 15 MG Road, Bandra West                │
│ Mumbai, Maharashtra – 400050           │
│                                         │
│  [ Confirm this location → ]            │
└─────────────────────────────────────────┘
```

**Interaction flow:**
1. Screen opens centred on India (20.5937°N, 78.9629°E, zoom 5) or last known location
2. User can pan/drag the map — pin stays centred
3. When map stops moving (`onRegionChangeComplete`): call Google Geocoding API → fill bottom card
4. User can tap GPS button → `expo-location.getCurrentPositionAsync()` → fly map there
5. User can type in search bar → Google Places Autocomplete → select suggestion → fly map there
6. Tap "Confirm this location" → return resolved address to caller via navigation params

---

## Data returned to caller

```typescript
interface PickedLocation {
  line1: string        // e.g. "15 MG Road"
  area: string         // e.g. "Bandra West"
  city: string         // e.g. "Mumbai"
  state: string        // e.g. "Maharashtra"
  pincode: string      // e.g. "400050"
  latitude: number
  longitude: number
}
```

Seller app only needs `{ city, area, latitude, longitude }` (rest ignored).

---

## Navigation callback pattern

Picker is opened with a `callbackScreen` param. On confirm it calls:
```typescript
navigation.navigate({ name: callbackScreen, params: { pickedLocation: result }, merge: true })
```
Caller reads `route.params?.pickedLocation` via `useEffect` and clears it with `navigation.setParams({ pickedLocation: undefined })`.

---

## Packages to install

### Seller App (`reelmart/apps/seller-app/`)
```bash
yarn add react-native-maps react-native-google-places-autocomplete expo-location
```

### Buyer App (`reelmart/apps/buyer-app/`)
```bash
yarn add react-native-maps react-native-google-places-autocomplete
# expo-location already present at ~19.0.8
```

---

## app.json changes (both apps)

Add to `expo.plugins`:
```json
["react-native-maps", { "googleMapsApiKey": "YOUR_GOOGLE_MAPS_API_KEY" }],
["expo-location", { "locationWhenInUsePermission": "Allow ReelMart to use your location." }]
```

Add to `expo.android`:
```json
"config": { "googleMaps": { "apiKey": "YOUR_GOOGLE_MAPS_API_KEY" } }
```

Add to `expo.ios`:
```json
"config": { "googleMapsApiKey": "YOUR_GOOGLE_MAPS_API_KEY" }
```

> Replace `YOUR_GOOGLE_MAPS_API_KEY` with the actual key. In production use `$GOOGLE_MAPS_API_KEY` via EAS Secrets.

---

## Files to create/modify

### New files
| File | Purpose |
|------|---------|
| `seller-app/src/screens/onboarding/LocationPickerScreen.tsx` | Picker screen for seller onboarding |
| `buyer-app/src/screens/shared/LocationPickerScreen.tsx` | Picker screen for buyer (addresses + checkout) |

### Modified files
| File | Change |
|------|--------|
| `seller-app/app.json` | Add Google Maps plugins |
| `buyer-app/app.json` | Add Google Maps plugins |
| `seller-app/src/navigation/types.ts` | Add `LocationPicker` to `OnboardingStackParamList` |
| `seller-app/src/navigation/RootNavigator.tsx` | Register `LocationPicker` screen |
| `seller-app/src/screens/onboarding/LocationScreen.tsx` | Add "Pick on map" button; receive `pickedLocation` from params |
| `buyer-app/src/navigation/RootNavigator.tsx` | Register `LocationPicker` screen |
| `buyer-app/src/screens/profile/AddressesScreen.tsx` | Replace manual form with map picker; keep manual fallback |
| `buyer-app/src/screens/checkout/CheckoutScreen.tsx` | Add "Pick on map" button above address fields |

---

## Reverse Geocoding

Use Google Geocoding REST API (no extra package needed):
```
GET https://maps.googleapis.com/maps/api/geocode/json?latlng={lat},{lng}&key={API_KEY}
```

Parse `address_components` to extract:
- `street_number` + `route` → `line1`
- `sublocality_level_1` or `sublocality` → `area`
- `locality` → `city`
- `administrative_area_level_1` → `state`
- `postal_code` → `pincode`

---

## Environment variable

Both apps read `process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY` for the API key in JS.  
`app.json` hardcodes the key for the native build (required for MapView to render tiles).

---

## Error states

- GPS denied: show toast "Location permission denied — please search manually"
- Reverse geocode fails: show "Couldn't resolve address — drag the map to adjust"
- No internet: show "Check your connection"
