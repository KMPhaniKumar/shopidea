# SKILL: Authentication
### File: skills/auth/SKILL.md

---

## What This Feature Does

Handles phone number based OTP authentication for both sellers and buyers.
No passwords ever. User enters phone → gets OTP → verified → logged in.
Supabase Auth handles everything under the hood.

## User Stories

- As a seller, I can sign up with just my phone number
- As a buyer, I can sign up with just my phone number
- As any user, I receive an OTP SMS and verify it
- As a logged in user, my session persists across app restarts
- As a user, I can log out from any device

## Inputs and Outputs

| Input | Output |
|---|---|
| Phone number (+91XXXXXXXXXX) | OTP sent to phone |
| OTP code (6 digits) | JWT session token |
| Role selection (seller/buyer) | User profile created in DB |

## Business Rules

- Phone number must be valid Indian format
- OTP expires in 60 seconds
- Max 3 OTP attempts before lockout
- New user → create profile → ask role (seller or buyer)
- Existing user → skip role selection → go to home
- One phone number can be both seller and buyer

## Files This Feature Touches

```
supabase/migrations/001_users.sql
apps/seller-app/src/screens/auth/
apps/buyer-app/src/screens/auth/
apps/seller-app/src/hooks/useAuth.ts
apps/buyer-app/src/hooks/useAuth.ts
apps/seller-app/src/store/authStore.ts
```

---

# AGENT: Authentication Builder
### File: agents/agent_auth.md

---

## Your Job

Build the complete authentication system for both seller and buyer apps
using Supabase Auth with phone OTP.

## Step 1: Database Migration

Create this file: `supabase/migrations/001_users.sql`

```sql
-- Users table (extends Supabase auth.users)
CREATE TABLE public.users (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  name TEXT,
  city TEXT,
  role TEXT DEFAULT 'buyer' CHECK (role IN ('seller', 'buyer', 'both')),
  referral_store_id UUID,
  loyalty_coins INT DEFAULT 0,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Users can read own profile
CREATE POLICY "Users read own profile"
ON public.users FOR SELECT
USING (auth.uid() = id);

-- Users can update own profile
CREATE POLICY "Users update own profile"
ON public.users FOR UPDATE
USING (auth.uid() = id);

-- Trigger to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, phone)
  VALUES (NEW.id, NEW.phone);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

Run: `supabase db push`

## Step 2: Generate TypeScript Types

```bash
supabase gen types typescript --local > apps/seller-app/src/types/supabase.ts
cp apps/seller-app/src/types/supabase.ts apps/buyer-app/src/types/supabase.ts
```

## Step 3: Supabase Client Setup

Create `apps/seller-app/src/lib/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Database } from '../types/supabase'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
```

## Step 4: Auth Store (Zustand)

Create `apps/seller-app/src/store/authStore.ts`:

```typescript
import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { Session, User } from '@supabase/supabase-js'

interface AuthState {
  session: Session | null
  user: User | null
  profile: any | null
  loading: boolean
  sendOTP: (phone: string) => Promise<{ error: string | null }>
  verifyOTP: (phone: string, token: string) => Promise<{ error: string | null }>
  updateProfile: (data: Partial<{ name: string; city: string; role: string }>) => Promise<void>
  signOut: () => Promise<void>
  initialize: () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  loading: true,

  initialize: () => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      set({ session, user: session?.user ?? null, loading: false })
      if (session?.user) get().fetchProfile(session.user.id)
    })
    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, user: session?.user ?? null })
      if (session?.user) get().fetchProfile(session.user.id)
    })
  },

  fetchProfile: async (userId: string) => {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()
    set({ profile: data })
  },

  sendOTP: async (phone: string) => {
    const formatted = phone.startsWith('+91') ? phone : `+91${phone}`
    const { error } = await supabase.auth.signInWithOtp({ phone: formatted })
    return { error: error?.message ?? null }
  },

  verifyOTP: async (phone: string, token: string) => {
    const formatted = phone.startsWith('+91') ? phone : `+91${phone}`
    const { error } = await supabase.auth.verifyOtp({
      phone: formatted,
      token,
      type: 'sms',
    })
    return { error: error?.message ?? null }
  },

  updateProfile: async (data) => {
    const { user } = get()
    if (!user) return
    await supabase.from('users').update(data).eq('id', user.id)
    set(state => ({ profile: { ...state.profile, ...data } }))
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ session: null, user: null, profile: null })
  },
}))
```

## Step 5: Auth Screens

Create these screens in `apps/seller-app/src/screens/auth/`:

**PhoneScreen.tsx** — Enter phone number
**OTPScreen.tsx** — Enter OTP code
**ProfileSetupScreen.tsx** — Enter name, city, confirm role

Each screen must:
- Validate input before proceeding
- Show loading state while waiting
- Show clear error messages
- Handle keyboard avoiding properly
- Support Hindi text input

## Step 6: Navigation Guard

Create `apps/seller-app/src/navigation/RootNavigator.tsx`:

```typescript
// If no session → show Auth stack (Phone → OTP → ProfileSetup)
// If session + no profile.name → show ProfileSetup
// If session + profile complete → show Main app stack
```

## Step 7: Test Checklist

- [ ] Enter valid Indian phone number → OTP sent
- [ ] Enter wrong OTP → clear error shown
- [ ] Enter correct OTP → navigate to profile setup
- [ ] Complete profile → navigate to home
- [ ] Kill app and reopen → still logged in
- [ ] Logout → back to phone screen
- [ ] Existing user login → skip profile setup

## Done When

Both seller app and buyer app have working phone OTP login
with persistent sessions and profile creation.
