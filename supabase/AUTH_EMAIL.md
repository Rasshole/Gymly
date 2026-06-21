# Gymly — email + password auth (no mandatory verification)

The app expects **immediate signup and login** without confirming email first.

## Supabase Dashboard (required once)

Project: `ykantlsuszpauddasqvz`

1. **Authentication → Providers → Email**
   - Email provider: **enabled**
   - **Confirm email**: **OFF** (disable mandatory verification)
   - Save

2. **Authentication → URL Configuration**
   - Site URL: `https://gymlyapp.com`
   - Redirect URLs: keep password-reset URLs; confirm URLs are optional

3. **Authentication → Email Templates** (optional)
   - You may disable or customize “Confirm signup” — users are not blocked on it

## App behaviour

- `signUp` → session returned (or auto `signInWithPassword` right after signup)
- User enters **Main** immediately after onboarding completes
- Login uses normal Supabase `signInWithPassword` + persisted session

## If login fails with “email not confirmed”

Confirm email is still **ON** in Supabase. Turn it **OFF** (step 1) and try again.
