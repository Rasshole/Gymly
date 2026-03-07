# Gymly – App Store Connect Submission Guide

**Mål:** Sende Gymly til Apple App Store i dag.

---

## ✅ Forud for submission

### 1. Apple Developer Account
- [ ] Aktivt Apple Developer Program ($99/år)
- [ ] Team ID: `CDVFBW66X4` (tjek i Xcode)

### 2. App ID (allerede oprettet)

Du har allerede **com.testlocal.Gymly** registreret i din Apple Developer-konto. Projektet bruger nu dette Bundle ID – ingen nye App IDs skal oprettes.

Tjek i [Identifiers](https://developer.apple.com/account/resources/identifiers/list) at **com.testlocal.Gymly** har **Sign in with Apple** aktiveret. Tilføj evt. **Push Notifications** hvis du vil bruge push.

### 3. App Store Connect
1. Gå til [App Store Connect](https://appstoreconnect.apple.com)
2. **My Apps** → **+** → **New App**
3. Udfyld:
   - **Platform:** iOS
   - **Name:** Gymly
   - **Primary Language:** Danish
   - **Bundle ID:** Vælg `com.testlocal.Gymly` i dropdown (vises nu fordi du oprettede det i trin 2)
   - **SKU:** gymly-ios-001

---

## 📱 Tekniske krav (allerede opfyldt)

| Krav | Status |
|------|--------|
| App icons (1024x1024 + alle størrelser) | ✅ |
| Privacy manifest (PrivacyInfo.xcprivacy) | ✅ |
| Sign in with Apple entitlement | ✅ |
| Brugerbeskrivelser (camera, location, osv.) | ✅ |
| In-app Privacy Policy & Terms | ✅ |
| Konto-sletning i appen | ✅ |
| Ingen mock/fiktive data | ✅ |

---

## 🔧 Sidste ændringer før upload

### Bundle ID (nu `com.testlocal.Gymly`)
- iOS og Android bruger begge `com.testlocal.Gymly`
- **Supabase:** Tilføj `com.testlocal.Gymly` under [Auth → Apple](https://supabase.com/dashboard) (Service ID / Bundle ID)
- **Firebase:** Opdater `GoogleService-Info.plist` og Firebase Console med Bundle ID `com.testlocal.Gymly`

### Privacy Policy URL (påkrævet af Apple)
Apple kræver en **ekstern URL** til privatlivspolitik.

**Website-filer er oprettet:**
- `website/privacy.html` – Privatlivspolitik
- `website/terms.html` – Vilkår og betingelser

**Upload website til gymly.dk** (eller anden hosting) og brug:
- **Privacy Policy URL:** `https://gymly.dk/privacy.html` (eller `/privacy` hvis server rewrites)
- **Terms URL:** `https://gymly.dk/terms.html`

Indtast Privacy Policy URL i App Store Connect under **App Information**.

---

## 📤 Upload til App Store Connect

### Trin 1: Archive i Xcode
```bash
# 1. Åbn workspace
open ios/Gymly.xcworkspace

# 2. I Xcode:
#    - Vælg "Any iOS Device" som destination (ikke simulator)
#    - Product → Archive
#    - Vent på at archive er færdig
```

### Trin 2: Distribute
1. **Organizer** åbnes automatisk
2. Vælg det nyeste archive
3. Klik **Distribute App**
4. Vælg **App Store Connect** → Next
5. Vælg **Upload** → Next
6. Behold standardindstillinger → Next
7. Vælg **Automatically manage signing** → Next
8. Klik **Upload**

### Trin 3: Hvis "No accounts with App Store Connect access"
- Xcode → Settings → Accounts → Tilføj Apple ID
- Vælg dit team under **Manage Certificates**

---

## 📋 App Store Connect – metadata

Udfyld i **App Information** og **Version Information**:

### App Information
- **Privacy Policy URL:** (fx https://gymly.dk/privacy)
- **Category:** Health & Fitness (primær), Social Networking (sekundær)
- **Age Rating:** 4+ (eller 12+ hvis chat/sociale funktioner)

### Version 1.0
- **Screenshots:** Minimum 6.7" og 5.5" iPhone
  - Brug simulator: iPhone 15 Pro Max (6.7") og iPhone 8 Plus (5.5")
  - Cmd+S for at gemme screenshot
- **Description:** (dansk)
- **Keywords:** gym, fitness, træning, check-in, venner, danmark
- **Support URL:** https://gymly.dk (eller support-email)
- **Marketing URL:** (valgfri)

### App Privacy
- Udfyld **App Privacy** baseret på hvad appen indsamler
- Typisk: Email, Name, Location (når i brug), Photos, User ID

---

## ⚠️ Almindelige afvisninger og løsninger

| Afvisning | Løsning |
|-----------|---------|
| 4.2 – Minimum functionality | Beskriv tydeligt appens funktioner i beskrivelsen |
| 5.1.1 – Privacy | Sørg for at Privacy Policy URL virker |
| 2.1 – Crashes | Test på rigtig enhed før upload |
| Sign in with Apple | Tjek at capability er slået til for dit App ID |

---

## 🚀 Efter upload

1. **Processing:** Vent 10–30 min til "Ready to Submit"
2. **Submit for Review:** Vælg build og send til review
3. **Review:** Typisk 24–48 timer
4. **Status:** Du modtager email når appen er godkendt eller afvist

---

## 📞 Support

- **Apple:** [App Review](https://developer.apple.com/contact/app-store/)
- **Supabase Apple Auth:** [Docs](https://supabase.com/docs/guides/auth/social-login/auth-apple)
