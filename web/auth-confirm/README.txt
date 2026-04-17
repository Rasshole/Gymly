Bekræftelsesside efter email (hostes på https://gymlyapp.com/auth/confirm)

1) Upload index.html til jeres webhotel/CDN så den URL virker.

2) Supabase → Authentication → URL Configuration:
   - Site URL: https://gymlyapp.com  (IKKE http://localhost:3000 — ellers åbner mail-linket localhost)
   - Redirect URLs: https://gymlyapp.com/auth/confirm

3) Appen bruger SUPABASE_EMAIL_REDIRECT i src/config/supabaseConfig.ts — skal matche punkt 1–2.

4) Efter ændring i Supabase: bed om et NYT bekræftelseslink (Send igen), gamle links kan stadig pege på localhost.
