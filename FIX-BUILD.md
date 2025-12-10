# 🔧 Fix "Build Failed" i Xcode

## ✅ VIGTIGT: Brug altid .xcworkspace, ikke .xcodeproj!

React Native projekter med CocoaPods **SKAL** åbnes via `.xcworkspace` filen, ikke `.xcodeproj`.

## 📋 Trin-for-trin løsning:

### 1. Luk Xcode hvis det er åbent

### 2. Åbn den korrekte fil

**✅ KORREKT:**
```bash
cd /Volumes/Kozy/BUSINESS/GYMLY/GITHUB_REPO/Gymly
open ios/Gymly.xcworkspace
```

**❌ FORKERT - Dette vil give build fejl:**
```bash
open ios/Gymly.xcodeproj  # IKKE denne!
```

Eller dobbeltklik på `Gymly.xcworkspace` i Finder.

### 3. Rens build cache i Xcode

Når Xcode er åbent:
- Tryk **Shift + Cmd + K** (eller Product > Clean Build Folder)

### 4. Start Metro bundler (i en separat terminal)

```bash
cd /Volumes/Kozy/BUSINESS/GYMLY/GITHUB_REPO/Gymly
npm start
```

**Lad Metro køre** - den skal være aktiv mens appen kører.

### 5. Build i Xcode

- Tryk **Cmd + B** (Build)
- Eller **Cmd + R** (Run) for at build og køre

## 🔍 Hvis det stadig fejler:

### Option A: Brug fix-scriptet

```bash
cd /Volumes/Kozy/BUSINESS/GYMLY/GITHUB_REPO/Gymly
./fix-ios-build.sh
```

Dette script:
- Renser build mappe
- Reinstallerer CocoaPods
- Forbereder projektet til build

### Option B: Manuel reinstall

```bash
cd /Volumes/Kozy/BUSINESS/GYMLY/GITHUB_REPO/Gymly/ios

# Rens alt
rm -rf build
rm -rf Pods
rm -f Podfile.lock

# Reinstaller
pod install

# Åbn workspace
open Gymly.xcworkspace
```

## 🚨 Almindelige fejl og løsninger:

### Fejl: "No such module 'React'"
- **Løsning:** Åbn `.xcworkspace` i stedet for `.xcodeproj`

### Fejl: "Command PhaseScriptExecution failed"
- **Løsning:** 
  ```bash
  cd ios
  pod install
  ```

### Fejl: "The sandbox is not in sync with the Podfile.lock"
- **Løsning:**
  ```bash
  cd ios
  pod install
  ```

### Fejl: "Cannot find module 'metro'"
- **Løsning:** Start Metro bundler først:
  ```bash
  npm start
  ```

## ✅ Efter build er lykkedes:

1. Metro bundler skal køre i en terminal
2. Appen skulle nu kunne køre i simulator/enhed
3. Hvis du ser "No script URL provided" fejl, start Metro bundler

## 📝 Checklist:

- [ ] Åbnet `Gymly.xcworkspace` (IKKE .xcodeproj)
- [ ] Renset build folder (Shift+Cmd+K)
- [ ] Metro bundler kører i terminal
- [ ] Build succesfuld (Cmd+B)

