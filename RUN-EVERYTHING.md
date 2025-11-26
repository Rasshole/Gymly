# Run Everything - Automatisk Build & Run

Dette script kører hele processen automatisk: starter Metro bundler, bygger appen i Xcode, og spiller lyd når det er færdigt.

## Brug

### Fra terminalen:
```bash
run-gymly
```

Eller direkte:
```bash
cd /Users/patrickgarcia/Desktop/Gymly/Gymly-1
./run-everything.sh
```

## Hvad scriptet gør:

1. **Starter Metro bundler** (hvis den ikke allerede kører)
   - Tjekker om Metro kører på port 8081
   - Starter Metro i baggrunden hvis den ikke kører
   - Vent til Metro er klar

2. **Bygger appen i Xcode**
   - Kører `xcodebuild` med clean build
   - Bygger for iOS Simulator
   - Installerer appen på simulator
   - Starter appen automatisk

3. **Spiller lyd når færdigt**
   - Afspiller systemlyd når build er færdig
   - Fungerer både ved succes og fejl

## Lyd notifikationer

Scriptet prøver at afspille lyd i denne rækkefølge:
1. `/System/Library/Sounds/Glass.aiff` (standard macOS lyd)
2. `/System/Library/Sounds/Hero.aiff` (alternativ lyd)
3. `say "Build complete"` (text-to-speech)
4. Bell sound (`\a`)

## Metro Bundler

Metro bundler kører i baggrunden efter scriptet er færdigt. For at stoppe den:

```bash
lsof -ti:8081 | xargs kill
```

## Fejlfinding

Hvis build fejler:
- Tjek `/tmp/xcode-build.log` for detaljer
- Sørg for at simulator er åben
- Tjek at CocoaPods er installeret: `cd ios && pod install`



