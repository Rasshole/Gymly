Gymly e-mail-skabeloner til Supabase

1) Åbn: Supabase Dashboard → Authentication → Email Templates
2) Vælg skabelonen "Confirm signup"
3) Subject / Emne: Bekræft din email til Gymly
4) Kopiér indholdet af confirm-signup.html ind i Body-feltet og gem.

Afsender (Fra: Gymly i stedet for Supabase):
- Med Supabases standard-mail forbliver afsender typisk noreply@mail.app.supabase.io
- For eget domæne (fx noreply@gymlyapp.com): Project Settings → Auth → SMTP / Custom SMTP
  (SendGrid, Resend, Postmark osv.) + DNS (SPF/DKIM) for gymlyapp.com

Supabase docs: https://supabase.com/docs/guides/auth/auth-email-templates
