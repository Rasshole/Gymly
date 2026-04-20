# Gymly Hjemmeside

Landing page til Gymly-appen. Matcher appens branding (lilla farver, kettlebell-logo) og er på dansk.

## Sådan kører du den

**Simpel måde:** Åbn `index.html` direkte i browseren.

**Med lokal server (anbefales):**
```bash
# Python 3
python3 -m http.server 8080

# Eller med npx
npx serve .
```

Derefter gå til http://localhost:8080

## Indhold

- **Hero:** Overskrift og CTA
- **Funktioner:** Tjek ind, Venner, Træningsplan, Beskeder
- **Download:** CTA til App Store og Google Play
- **Footer:** Links til privatlivspolitik og vilkår

## Design

- Farver fra appen: `#8B5CF6` (primary), `#10B981` (secondary)
- Font: DM Sans
- Responsivt layout

## Email-bekræftelse (https://gymlyapp.com/confirm)

- Side: **`confirm/index.html`** (egen layout, ingen marketing-navbar).
- Legacy redirect: **`auth-confirm/index.html`** → `/confirm` (bevarer query/hash).
- Hosting: ved SPA-fallback skal **`_redirects`** (Netlify), **`vercel.json`** (Vercel) eller **`.htaccess`** (Apache) deployes sammen med siden — se filerne i roden af `website/`.
- Efter deploy: verificér at [https://gymlyapp.com/confirm](https://gymlyapp.com/confirm) viser bekræftelsessiden, ikke forsiden.
