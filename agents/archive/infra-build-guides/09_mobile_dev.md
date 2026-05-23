# Phase 8 — Buyer Mobile App Dev Build (Expo EAS)

> Internal-testing builds for iOS (TestFlight) and Android (Internal Track / shared APK). Not store submission — that's a prod-only step.

## Goal
- iOS: build a `.ipa` via EAS Build, upload to TestFlight, invite internal testers.
- Android: build an APK via EAS Build, share via Google Play Internal Testing or as a direct download.
- App points at `https://api-dev.reelmart.in`.

## Prerequisites
- Phase 5 (API reachable on the dev hostname)
- Apple Developer account ($99/yr) — required for TestFlight
- Google Play Console account ($25 one-time) — required for Internal Track (APK download alone needs no Play account)
- Expo account + EAS CLI installed: `npm i -g eas-cli && eas login`

## Inputs
- `EXPO_PROJECT_ID` (created on first `eas init`)
- `DEV_API_URL = https://api-dev.reelmart.in`
- `SUPABASE_DEV_URL`, `SUPABASE_DEV_ANON_KEY`

## Steps

### 8.1 — Initialize EAS in the buyer app
```bash
cd reelmart/apps/buyer-app

# One-time
eas init
# (creates ./eas.json if missing and registers project ID in app.json)
```

### 8.2 — Define build profiles
Edit `reelmart/apps/buyer-app/eas.json`:
```json
{
  "cli": { "version": ">= 13.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios":     { "simulator": false, "resourceClass": "m-medium" },
      "android": { "buildType": "apk" },
      "env": {
        "EXPO_PUBLIC_API_URL":        "https://api-dev.reelmart.in",
        "EXPO_PUBLIC_SUPABASE_URL":   "<dev project url>",
        "EXPO_PUBLIC_SUPABASE_ANON":  "<dev anon key>"
      }
    },
    "preview": {
      "distribution": "internal",
      "ios":     { "simulator": false },
      "android": { "buildType": "apk" },
      "env": { "EXPO_PUBLIC_API_URL": "https://api-dev.reelmart.in", ... }
    },
    "production": { "channel": "production" }
  },
  "submit": {
    "production": {}
  }
}
```

### 8.3 — Configure secrets (so they don't sit in eas.json)
```bash
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL  --value "<dev url>"
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON --value "<dev anon>"
# Then reference in eas.json: "env": { "EXPO_PUBLIC_SUPABASE_URL": "$EXPO_PUBLIC_SUPABASE_URL", ... }
```

### 8.4 — iOS build
```bash
eas build --platform ios --profile development
# First time: walks you through Apple credentials, certs, provisioning profiles (let EAS manage them)
```
Build time: ~15 min. EAS gives you a download URL.

Upload to TestFlight:
```bash
eas submit --platform ios --latest
# (or use the App Store Connect UI to upload the .ipa manually)
```
Add testers in App Store Connect → TestFlight → Internal Testing.

### 8.5 — Android build
```bash
eas build --platform android --profile development
# First time: lets EAS create a keystore (recommended)
```
Download the APK from the EAS dashboard. Either:
- Share the APK link directly with internal testers, or
- Upload to Google Play Console → Internal testing track.

### 8.6 — Install on test devices
- **iOS:** TestFlight app → accept invite → install.
- **Android:** Open APK link on device → enable "Install unknown apps" for the browser → install.

## Deliverables
- iOS: development build on TestFlight
- Android: APK distributed via internal channel
- App env wired to `api-dev.reelmart.in` and the dev Supabase project

## Validation
- Open the app on a physical device.
- Phone OTP login flows end-to-end via Supabase Auth (dev project).
- Browse a store (use a slug seeded in dev DB).
- Place an order; confirm it lands in dev DB and a notification fires.

## Common pitfalls
- **Environment confusion.** `EXPO_PUBLIC_*` vars are baked into the JS bundle at build time. Changing them needs a new build.
- **Cleartext HTTP not allowed.** Both iOS and Android default to HTTPS-only. `api-dev.reelmart.in` must serve a valid cert (Phase 5 outcome). Don't use ALB DNS directly — its cert won't match the host.
- **Bundle ID / package name collisions.** Pick `in.reelmart.buyer` (or similar) once and don't change — re-uploading under a new ID counts as a new app for Apple/Google.
- **Missing icons / splash.** Production builds reject missing assets. Dev builds tolerate placeholders but the Apple submit step won't.
- **Push notifications in dev.** FCM/APNs token registration works in dev; just point the buyer app at the dev `notification-service`. Don't share dev FCM project with prod.
- **EAS submit needs Apple-specific IDs (App Store Connect API key + Issuer ID).** Set them once via `eas credentials` or in `eas.json` `submit.production`.

## Rollback
- Apple: invalidate a TestFlight build via App Store Connect → revoke from testers.
- Android: remove the APK link / unlist from Internal track. Already-installed APKs keep working until uninstalled.

## Next: Phase 9
Hand off to `10_monitoring.md`.
