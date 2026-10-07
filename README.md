# Gymly - GDPR-Compliant Fitness Social Media App

Gymly er en social medie app til fitness, hvor brugere kan tjekke ind på gym, dele deres workouts og træne sammen med venner.

## 🔐 GDPR & Sikkerhed

Denne app er bygget med GDPR-compliance og datasikkerhed som første prioritet:

### Sikkerhedsfunktioner

- **Secure Storage**: Bruger React Native Keychain til sikker opbevaring af tokens
- **Encrypted Data**: Følsomme data krypteres før lagring
- **Password Requirements**: Stærke password krav (minimum 8 tegn, store/små bogstaver, tal)
- **Session Management**: Automatisk session validering og token refresh

### GDPR Compliance

- **Consent Management**: Klar og transparent samtykke håndtering
- **Ret til Indsigt (Artikel 15)**: Brugere kan eksportere deres data
- **Ret til Sletning (Artikel 17)**: Brugere kan anmode om sletning af deres data
- **Ret til Dataportabilitet (Artikel 20)**: Data kan eksporteres i struktureret format
- **Privacy by Design**: Privacy indstillinger er indbygget fra starten
- **Consent Audit Trail**: Al samtykke historik logges

### Privacy Features

- **Granulær Privacy Settings**: Brugere kan kontrollere:
  - Profil synlighed (alle, venner, privat)
  - Lokationsdeling
  - Workout historik synlighed
  - Online status
  
- **Valgfrit Samtykke**:
  - Marketing kommunikation (kan til/fra når som helst)
  - Anonymiseret analyse (kan til/fra når som helst)
  - Lokation tracking (kan til/fra når som helst)

## 🏗️ Projektstruktur

```
Gymly/
├── App.tsx                    # Root component
├── src/
│   ├── types/                 # TypeScript type definitions
│   │   ├── user.types.ts     # User and GDPR types
│   │   └── auth.types.ts     # Authentication types
│   ├── services/              # Business logic services
│   │   ├── security/
│   │   │   └── SecureStorage.ts    # Secure data storage
│   │   ├── privacy/
│   │   │   └── PrivacyService.ts   # GDPR compliance service
│   │   └── auth/
│   │       └── AuthService.ts      # Authentication service
│   ├── store/                 # State management (Zustand)
│   │   ├── appStore.ts       # Global app state
│   │   └── privacyStore.ts   # Privacy & consent state
│   ├── navigation/            # Navigation setup
│   │   ├── RootNavigator.tsx
│   │   ├── AuthNavigator.tsx
│   │   └── MainNavigator.tsx
│   └── screens/               # App screens
│       ├── LoadingScreen.tsx
│       ├── PrivacyConsentScreen.tsx
│       ├── auth/
│       │   ├── LoginScreen.tsx
│       │   ├── RegisterScreen.tsx
│       │   └── ForgotPasswordScreen.tsx
│       └── main/
│           ├── HomeScreen.tsx
│           ├── ProfileScreen.tsx
│           └── SettingsScreen.tsx
├── package.json
├── tsconfig.json
└── babel.config.js
```

## 🚀 Installation

### Forudsætninger

- Node.js >= 18
- React Native CLI
- iOS: Xcode og CocoaPods
- Android: Android Studio og JDK

### Setup

1. **Klon projektet og installer dependencies:**
   ```bash
   npm install
   ```
   Kommandoen skal virke uden `--legacy-peer-deps`. Sikker lagring sker via `react-native-keychain`. `expo-secure-store` er ikke en dependency, fordi dens påkrævede peer `expo` får npm til at hente Expo, som kræver React 19.

2. **iOS setup:**
   ```bash
   cd ios && pod install && cd ..
   ```

3. **Kør appen:**
   ```bash
   # iOS
   npm run ios
   
   # Android
   npm run android
   ```

## 📱 Features

### ✅ Implementeret (Version 1.0)

- GDPR-compliant onboarding flow
- Bruger autentificering (login/register)
- Sikker datalagring
- Privacy consent management
- Bruger profil
- Privacy indstillinger
- Consent audit trail

### 🚧 Kommer snart

- Gym check-in funktionalitet
- Venner system
- Workout deling
- Real-time lokation deling
- Chat med træningspartnere
- Workout historik
- Trænings statistik

## 🔧 Teknologi Stack

- **Framework**: React Native 0.73
- **Language**: TypeScript
- **Navigation**: React Navigation (Stack & Bottom Tabs)
- **State Management**: Zustand
- **Secure Storage**: React Native Keychain
- **Local Storage**: AsyncStorage
- **Icons**: React Native Vector Icons

## 📄 License

Dette projekt er privat og ejet af Gymly.

## 👥 Team

Udviklet til Gymly fitness social media platform.

---

**Vigtigt:** Husk at opdatere API_URL i `src/services/auth/AuthService.ts` når backend er klar.

