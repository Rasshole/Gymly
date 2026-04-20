Email-bekræftelse (Gymly)

Produktion (gymlyapp.com): filerne ligger i website/ — deploy hele website/ mappen.
Kanonisk URL: https://gymlyapp.com/confirm  (website/confirm/index.html)

Kopi i repo til andre formål: web/confirm/index.html (hold gerne indhold synkroniseret).

Legacy: https://gymlyapp.com/auth/confirm omdirigerer til /confirm (samme query/hash).

Deploy /confirm/ som ovenfor. /auth/confirm/ behøver kun index.html (redirect).

Produktion (/confirm må ikke ramme SPA-forsiden):
  • Netlify: web/_redirects (eller web/netlify.toml) — publish-root skal indeholde confirm/index.html
  • Vercel: web/vercel.json — merge rewrites ind i projekt-root hvis sitet ikke deployes fra web/
  • nginx: web/nginx.gymlyapp.conf
  • Azure Static Web Apps: web/staticwebapp.config.json (navigationFallback exclude)

Supabase → Authentication → URL Configuration:
  • Site URL: https://gymlyapp.com
  • Redirect URLs: https://gymlyapp.com/confirm
    og evt. https://gymlyapp.com/auth/confirm (bagudkompatibel)

Lokal udvikling (valgfrit):
  • http://localhost:XXXX/auth/confirm — tilføj den præcise URL under Redirect URLs i Supabase.

App (React Native):
  • SUPABASE_EMAIL_REDIRECT i src/config/supabaseConfig.ts skal matche den kanoniske URL.

Efter ændring af redirects: bed brugeren om nyt bekræftelseslink (Send igen).

Deep link:
  • I web/confirm/index.html: sæt APP_DEEP_LINK til fx gymly:// når URL scheme findes i appen.
