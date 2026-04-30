# AGENT: Project Setup
### File: agents/agent_00_setup.md
### Run this FIRST before anything else

---

## Step 1: Create Project Structure

```bash
mkdir platform && cd platform
git init

# Create folder structure
mkdir -p apps/seller-app apps/buyer-app apps/web
mkdir -p backend/src/{payments,delivery,notifications,webhooks,lib}
mkdir -p supabase/{migrations,functions}
mkdir -p skills agents docs
```

## Step 2: Initialize Supabase

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Initialize
supabase init

# Start local Supabase
supabase start
# This starts local PostgreSQL + Auth + Storage + Studio
# Studio UI at http://localhost:54323
```

## Step 3: Initialize React Native Apps

```bash
# Seller App
cd apps
npx create-expo-app seller-app --template expo-template-blank-typescript
cd seller-app
npx expo install @supabase/supabase-js @react-native-async-storage/async-storage
npx expo install expo-image-picker expo-image-manipulator
npx expo install react-native-razorpay
npm install zustand @react-navigation/native @react-navigation/stack
npx expo install react-native-screens react-native-safe-area-context

# Buyer App (same setup)
cd ../
npx create-expo-app buyer-app --template expo-template-blank-typescript
cd buyer-app
npx expo install @supabase/supabase-js @react-native-async-storage/async-storage
npm install zustand @react-navigation/native @react-navigation/stack
npx expo install react-native-screens react-native-safe-area-context
```

## Step 4: Initialize Next.js Web App

```bash
cd ../
npx create-next-app@latest web --typescript --tailwind --app --no-src-dir
cd web
npm install @supabase/supabase-js @supabase/ssr
```

## Step 5: Initialize Node.js Backend

```bash
cd ../../backend
npm init -y
npm install express cors helmet dotenv
npm install @supabase/supabase-js
npm install razorpay axios
npm install firebase-admin
npm install -D typescript @types/express @types/node ts-node nodemon
npx tsc --init
```

## Step 6: Environment Files

Create `.env` in root:
```bash
# Supabase
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=your_local_anon_key
SUPABASE_SERVICE_KEY=your_local_service_key

# Razorpay (test keys)
RAZORPAY_KEY_ID=rzp_test_xxxx
RAZORPAY_KEY_SECRET=your_secret

# Shiprocket
SHIPROCKET_EMAIL=your@email.com
SHIPROCKET_PASSWORD=your_password

# Gupshup
GUPSHUP_API_KEY=your_key
GUPSHUP_APP_NAME=your_app
GUPSHUP_SOURCE_NUMBER=917834811114

# Firebase
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}

# Google Maps
GOOGLE_MAPS_API_KEY=your_key

# Backend URL
BACKEND_URL=http://localhost:3001
```

Create `apps/seller-app/.env`:
```bash
EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_local_anon_key
EXPO_PUBLIC_RAZORPAY_KEY=rzp_test_xxxx
EXPO_PUBLIC_API_URL=http://localhost:3001
```

## Step 7: Generate Supabase Types

```bash
# After running migrations
supabase gen types typescript --local > apps/seller-app/src/types/supabase.ts
cp apps/seller-app/src/types/supabase.ts apps/buyer-app/src/types/supabase.ts
cp apps/seller-app/src/types/supabase.ts apps/web/src/types/supabase.ts
```

## Step 8: VS Code Workspace Setup

Create `.vscode/extensions.json`:
```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-typescript-next",
    "supabase.supabase",
    "rangav.vscode-thunder-client",
    "eamodio.gitlens",
    "msjsdiag.vscode-react-native"
  ]
}
```

Create `.vscode/settings.json`:
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.tabSize": 2,
  "typescript.preferences.importModuleSpecifier": "relative",
  "tailwindCSS.includeLanguages": { "typescript": "html", "typescriptreact": "html" }
}
```

## Step 9: Install Claude Code

```bash
# Install globally
npm install -g @anthropic-ai/claude-code

# In your project root
cd platform
claude

# Copy CLAUDE.md to .claude/
mkdir .claude
cp agents/CLAUDE.md .claude/CLAUDE.md
```

## Step 10: Run Everything Locally

```bash
# Terminal 1 — Supabase
supabase start

# Terminal 2 — Backend
cd backend && npm run dev

# Terminal 3 — Seller App
cd apps/seller-app && npx expo start

# Terminal 4 — Web
cd apps/web && npm run dev
# Admin dashboard at http://localhost:3000
```

## Verification Checklist

- [ ] `supabase start` shows all services running
- [ ] Supabase Studio opens at http://localhost:54323
- [ ] Backend starts without errors on port 3001
- [ ] Expo app opens in simulator or Expo Go
- [ ] Next.js runs at http://localhost:3000
- [ ] `.env` files are in place and NOT committed to git
- [ ] `.gitignore` includes `.env` files

---

# AGENT: Storefront (Buyer Web)
### File: agents/agent_storefront.md

---

## What This Feature Does

The public-facing storefront that buyers see when they click a seller's link.
Works in browser — no app install needed for buying.
URL: `platform.com/s/store-slug`

## Step 1: Next.js Route

Create `apps/web/app/s/[slug]/page.tsx`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import StorefrontClient from './StorefrontClient'

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const supabase = createClient()
  const { data: store } = await supabase
    .from('stores')
    .select('store_name, description, logo_url')
    .eq('store_slug', params.slug)
    .single()

  if (!store) return { title: 'Store not found' }

  return {
    title: store.store_name,
    description: store.description ?? `Shop from ${store.store_name}`,
    openGraph: {
      title: store.store_name,
      description: store.description,
      images: store.logo_url ? [store.logo_url] : [],
    },
  }
}

export default async function StorefrontPage({ params }: { params: { slug: string } }) {
  const supabase = createClient()

  const { data: store } = await supabase
    .from('stores')
    .select('*, products(*)')
    .eq('store_slug', params.slug)
    .eq('is_active', true)
    .single()

  if (!store) notFound()

  return <StorefrontClient store={store} />
}
```

## Step 2: Storefront Client Component

Create `apps/web/app/s/[slug]/StorefrontClient.tsx`:

Key sections to build:
- **Header** — store logo, name, rating, follow button, WhatsApp button
- **Categories** — filter products by category tabs
- **Product Grid** — responsive grid, 2 col mobile / 3-4 col desktop
- **Product Modal** — tap to open, select variant, add to cart
- **Cart Sidebar** — slide in from right, order summary
- **Checkout Flow** — address form, payment, confirmation

## Step 3: App Install Banner

Show this banner to buyers who are not on the app:

```typescript
// Show after buyer views 3 products or adds to cart
function AppInstallBanner({ storeSlug }: { storeSlug: string }) {
  return (
    <div className="fixed bottom-0 w-full bg-blue-600 text-white p-4 flex items-center justify-between">
      <div>
        <p className="font-bold">Get the App — Free delivery on first order!</p>
        <p className="text-sm">+ Discover 500+ local sellers near you</p>
      </div>
      <a
        href={`https://platform.com/download?ref=${storeSlug}`}
        className="bg-white text-blue-600 px-4 py-2 rounded-full font-bold"
      >
        Install
      </a>
    </div>
  )
}
```

## Step 4: SEO + Social Sharing

```typescript
// Each store page is SEO optimized
// Google can index all seller products
// WhatsApp sharing shows rich preview with store image

// Add structured data for Google Shopping
const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'Store',
  name: store.store_name,
  description: store.description,
  image: store.logo_url,
  address: { '@type': 'PostalAddress', addressLocality: store.city },
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: store.rating_avg,
    reviewCount: store.total_reviews,
  },
}
```

## Done When

- Storefront loads in under 2 seconds
- Products display correctly on mobile browser
- Add to cart works without login
- Checkout works with phone OTP
- App install banner shows correctly
- WhatsApp share button works
- Page has correct SEO meta tags
