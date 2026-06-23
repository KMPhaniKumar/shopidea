# Maestro device-e2e flows — ReelMart buyer-app

These YAML flows drive the **real app on a device/emulator** through the core
buyer journeys. They are written against the live screen text + the canonical
dev test credentials (`tests/fixtures/users.ts` → `DEV_ACCOUNTS`).

| Flow | Journey | Tags |
|---|---|---|
| `01_launch_onboarding.yaml` | Cold launch → lands on login gate | smoke, onboarding |
| `02_login_otp.yaml` | Phone `9999999999` → OTP `123456` → Home | smoke, auth |
| `03_browse_add_to_cart.yaml` | Search "Blue Whale" → product → add to cart | cart |
| `04_checkout_cod.yaml` | Cart → Checkout → Cash on Delivery → order placed | checkout |
| `05_view_orders.yaml` | Orders tab → open order → tracking timeline | smoke, orders |

`config.yaml` sets the shared `appId` (`in.reelmart.buyer`) and the default run
order. Flows 3–5 call `02_login_otp.yaml` via `runFlow:` so each is runnable on
its own from a fresh emulator.

## ⚠️ These do NOT run in this CI/sandbox

Maestro is **not headless** — it requires a booted Android emulator or iOS
simulator **and an installed dev build** of the app (Expo dev client or a debug
APK/IPA). There is no emulator in the agent/test sandbox, so these flows are
delivered as **artifacts to run on a machine with a device**, not executed here.
Only the Jest suite (`npx jest`) runs in this environment.

`02_login_otp.yaml` sends a real OTP request to the dev `admin-service` bridge,
but **only** for the MSG91 *test* number `9999999999`, which resolves to the
fixed code `123456` with **no SMS delivered** to a handset. Never change that
number. `04_checkout_cod.yaml` writes a **real COD order row** in the dev DB —
cancel it from the app (or delete the row) after the run to keep dev data clean.

## Prerequisites (one-time, on a machine with a device)

```bash
# 1. Install Maestro
curl -fsSL "https://get.maestro.mobile.dev" | bash
maestro --version            # sanity check

# 2a. Android: a booted emulator (or a USB device with USB debugging)
emulator -list-avds
emulator -avd <Pixel_API_34> &
adb devices                  # confirm "device" state

# 2b. iOS (macOS only): a booted simulator
xcrun simctl boot "iPhone 15"
open -a Simulator
```

## Build + install a DEV build

The flows expect a **dev/debug** build (they assert the in-app DEV banner). Use
EAS or a local prebuild:

```bash
cd reelmart/apps/buyer-app

# Option A — EAS dev build (recommended; matches the prod toolchain)
eas build --profile development --platform android   # → install the .apk
eas build --profile development --platform ios       # → install on simulator

# Option B — local run (Expo CNG prebuild + native run)
npx expo run:android    # builds + installs a debug APK on the booted emulator
npx expo run:ios        # builds + installs on the booted simulator
```

Either way, end with the app installed under id `in.reelmart.buyer`, pointing at
the dev API (`EXPO_PUBLIC_API_URL=https://api-dev.reelmart.in`). Remember the
dev API is intentionally **down 22:00–08:00 IST** (nightly scale-to-zero) — run
the login/checkout flows during the day or a 503 will fail them.

## Run the flows

```bash
cd reelmart/apps/buyer-app

# Whole suite, in config.yaml order
maestro test .maestro

# A single flow
maestro test .maestro/02_login_otp.yaml

# Smoke subset only
maestro test --include-tags=smoke .maestro

# Interactive element inspector (debug selectors)
maestro studio
```

Screenshots (`takeScreenshot:`) land in the working dir; `maestro test` also
writes a JUnit report you can wire into CI.

## CI note

To run these in GitHub Actions you need an emulator runner:
- Android: `reactivecircus/android-emulator-runner` + `mobile-dev-inc/action-maestro-cloud`
  (or the self-hosted Maestro action) on an `ubuntu-latest` runner with KVM.
- iOS: a `macos-latest` runner (simulator). Slower + costs macOS minutes.

Because of the emulator + dev-build cost, these are best run on-demand / nightly,
not on every PR. The fast per-PR signal stays the Jest suite (`npx jest`).
