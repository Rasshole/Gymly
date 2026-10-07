# Gymly - Setup Guide

## ✅ Hvad er allerede gjort:

1. ✅ Node.js installeret (v25.1.0)
2. ✅ npm dependencies installeret (1254 packages)
3. ✅ React Native projekt struktur opsat
4. ✅ GDPR compliance system implementeret
5. ✅ Sikkerhedslag (Keychain, SecureStorage) implementeret
6. ✅ Autentificering system klar
7. ✅ UI screens oprettet

## 🚀 Næste skridt for at køre appen:

### **iOS Setup (Mac påkrævet)**

1. **Installer CocoaPods** (hvis ikke allerede installeret):
   ```bash
   sudo gem install cocoapods
   ```
   *Indtast dit Mac administrator password når du bliver spurgt*

2. **Installer iOS dependencies:**
   ```bash
   cd ios
   pod install
   cd ..
   ```

3. **Kør appen i iOS simulator:**
   ```bash
   npm run ios
   ```

### **Android Setup**

1. **Installer Android Studio** (hvis ikke allerede installeret):
   - Download fra: https://developer.android.com/studio
   - Åbn Android Studio og installer Android SDK

2. **Setup Android SDK:**
   - Åbn Android Studio > SDK Manager
   - Installer Android 13 (API Level 33) eller nyere
   - Installer Android SDK Build-Tools

3. **Kør appen i Android emulator:**
   ```bash
   npm run android
   ```

## 🔧 Troubleshooting

### iOS Issues:

**Problem: "Command not found: pod" eller ActiveSupport Logger fejl**
```bash
# Installer CocoaPods i user space (uden sudo)
gem install cocoapods --user-install

# Tilføj til PATH (tilføj til ~/.zshrc for permanent)
export PATH="$HOME/.gem/ruby/2.6.0/bin:$PATH"
export RUBYOPT="-r/usr/lib/ruby/2.6.0/logger"

# Kør pod install
cd ios
pod install
cd ..
```

**Problem: "Unable to find a specification for..."**
```bash
cd ios
pod repo update
pod install
cd ..
```

**Problem: "Unable to locate the executable `node`"**
- Node.js er installeret i `~/.local/bin`
- Sørg for at PATH er sat: `export PATH="$HOME/.local/bin:$PATH"`
- Tilføj til `~/.zshrc` for permanent: `echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc`

**Problem: Metro bundler fejler med "Cannot read properties of undefined (reading 'handle')"**
- Dette er typisk et Node.js version problem
- Projektet kræver Node.js >=20.19.4
- Tjek version: `node --version`
- Hvis version < 20, opdater Node.js (se nedenfor)

### Android Issues:

**Problem: "SDK location not found"**
- Opret fil: `android/local.properties`
- Tilføj: `sdk.dir=/Users/DITBRUGERNAVN/Library/Android/sdk`
  (Erstat DITBRUGERNAVN med dit faktiske brugernavn)

**Problem: Gradle build fails**
```bash
cd android
./gradlew clean
cd ..
npm run android
```

## 📱 Test App Flow

Når appen kører vil du se:

1. **Privacy Consent Screen** 🔒
   - Første gang app åbnes
   - GDPR-compliant samtykke
   - Valgfri marketing/analytics samtykke

2. **Login/Register Screen** ✅
   - Sikker autentificering
   - Email og password validering
   - Glemt adgangskode flow

3. **Main App** 🏠
   - Home feed (kommer snart: check-ins)
   - Profil side
   - Indstillinger med privacy kontroller

## 🔐 GDPR Features

- ✅ Transparent consent management
- ✅ Granulær privacy indstillinger
- ✅ Data export (kommer snart)
- ✅ Konto sletning (kommer snart)
- ✅ Consent audit trail
- ✅ Secure data storage (Keychain)

## 📂 Projekt Struktur

```
Gymly/
├── src/
│   ├── screens/          # Alle UI skærme
│   ├── services/         # Business logic
│   ├── store/           # State management
│   ├── navigation/      # Navigation setup
│   └── types/           # TypeScript typer
├── ios/                 # iOS native kode
├── android/             # Android native kode
└── App.tsx             # Root component
```

## 💡 Tips

- Brug `npm start` for at starte Metro bundler
- Brug `npm run ios` eller `npm run android` i separate terminaler
- Reload app: Shake device eller tryk R i terminal
- Developer menu: Cmd+D (iOS) / Cmd+M (Android)

## 🆘 Support

Hvis du støder på problemer:
1. Check at alle dependencies er installeret korrekt
2. Prøv at rydde cache: `npm start -- --reset-cache`
3. Geninstaller dependencies: `rm -rf node_modules && npm install`  
   Uden `--legacy-peer-deps`. Sikker lagring er `react-native-keychain`. Tilføj ikke `expo-secure-store`: dens peer `expo` trækker React 19 ind og får `npm install` til at stoppe.
4. For iOS: `cd ios && pod install && cd ..`

---

**Ready to build the future of fitness social media! 💪**

