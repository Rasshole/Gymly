# Gymly Android setup

React Native **0.76** Android project. Use this after installing [Android Studio](https://developer.android.com/studio).

## 1. Prerequisites

| Tool | Version |
|------|---------|
| JDK | **17–20** (not JDK 25) |
| Android SDK | API **35** |
| Node | 18+ |

Set environment variables (add to `~/.zshrc`):

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator
```

## 2. Local config (not committed)

```bash
cp android/local.properties.example android/local.properties
# Edit sdk.dir and GOOGLE_MAPS_API_KEY
```

Firebase push/auth:

1. Create an Android app in [Firebase Console](https://console.firebase.google.com) with package **`com.test1.Gymly`**
2. Download `google-services.json` → replace `android/app/google-services.json`

## 3. Run on device / emulator

```bash
npm start          # terminal 1
npm run android    # terminal 2
```

Or build debug APK:

```bash
cd android && ./gradlew assembleDebug
```

## 4. Release build (Google Play)

```bash
cp android/keystore.properties.example android/keystore.properties
# Fill in release keystore paths/passwords

cd android
./gradlew bundleRelease
# Output: android/app/build/outputs/bundle/release/app-release.aab
```

Upload the **AAB** to Google Play Console.

## 5. Play Store checklist

- [ ] Replace placeholder `google-services.json`
- [ ] Set `GOOGLE_MAPS_API_KEY` in `local.properties` (restrict key in Google Cloud Console)
- [ ] Create release keystore + `keystore.properties`
- [ ] Update `assetlinks.json` on gymlyapp.com with **release** signing certificate SHA-256
- [ ] Store listing, privacy policy, Data safety form
- [ ] Test: auth deep links, location/check-in, push notifications, maps

## Package ID

Current `applicationId`: **`com.test1.Gymly`** (matches iOS). Change only together with Firebase, App Links, and Play Console.

## Emulator: avoid 16 KB page-size images

If you see **"This app isn't 16 KB compatible"** or Pixel Launcher crashes, your AVD uses a
`ps16k` / **Page Size 16KB** system image (e.g. Android 17). React Native **0.76** prebuilt
native libs target 4 KB pages.

**For local dev:** create an AVD with **Google Play** on **API 35** (Android 15) — do **not**
enable "16 KB page size" in the system image picker. This repo includes a ready-made AVD name:
`Pixel_8_Dev`.

```bash
emulator -avd Pixel_8_Dev
npm run android
```

16 KB support is required for Play Store on API 35+ later; plan an RN **0.77+** upgrade before release.

## Troubleshooting

```bash
npx react-native doctor
cd android && ./gradlew clean
```

If Gradle fails on Java version, install JDK 17:

```bash
brew install openjdk@17
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
```
