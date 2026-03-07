# Apple App Store Compliance

Ændringer implementeret for at opfylde Apple's App Store guidelines.

## Guideline 4 – Sign in with Apple

**Problem:** Appen bad om navn og email *efter* Sign in with Apple – data som allerede leveres af Apple's Authentication Services.

**Løsning:**
- Sign in with Apple udløses nu **først** via `@invertase/react-native-apple-authentication`
- Navn og email hentes fra Apple's svar – der spørges **aldrig** efter disse felter igen
- **Registrering:** Bruger vælger Apple → Apple-auth kører → kun location, brugernavn, foto og privatliv vises
- **Login:** Bruger trykker Apple → Apple-auth → direkte login

**Supabase:** Tilføj dit App Bundle ID (`com.testlocal.Gymly`) til Client IDs under [Supabase Dashboard → Auth → Apple](https://supabase.com/dashboard/project/_/auth/providers).

## Guideline 5.1.1(v) – Sletning af konto

**Problem:** Appen understøttede ikke sletning af konto i appen.

**Løsning:**
- "Slet konto" i Indstillinger udfører nu sletning direkte i appen
- Dobbelt bekræftelse for at undgå utilsigtet sletning
- Lokale data ryddes og brugeren logges ud

**Fuld Supabase-sletning:** Opret en Edge Function `delete-account` for at slette brugeren i Supabase Auth:

```bash
supabase functions new delete-account
```

Indhold i `supabase/functions/delete-account/index.ts`:

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }
  const { userId } = await req.json()
  if (!userId) {
    return new Response(JSON.stringify({ error: 'userId required' }), { status: 400 })
  }
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
  return new Response(JSON.stringify({ success: true }), { status: 200 })
})
```

Deploy: `supabase functions deploy delete-account`

## iOS Sign in with Apple capability

Entitlements-filen `ios/GymlyFresh/GymlyFresh.entitlements` er tilføjet med Sign in with Apple. Sørg for at capability er slået til i Apple Developer Console for dit App ID.
