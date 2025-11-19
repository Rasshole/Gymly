# Automatisk Run i Cursor

Jeg har sat op automatisk run funktionalitet, så du ikke behøver at trykke "run" hver gang.

## Sådan bruger du det:

### Hurtig metode (Anbefalet):
**Tryk `Cmd+Shift+R`** - Dette kører alt automatisk:
- Starter Metro bundler
- Bygger appen i Xcode  
- Installerer på simulator
- Starter appen
- Spiller lyd når færdigt! 🔔

### Alternativ metode:
1. Tryk `Cmd+Shift+P` (Command Palette)
2. Skriv "Tasks: Run Task"
3. Vælg "🚀 Run Everything (Metro + Build + Run)"

### Eller brug default build:
**Tryk `Cmd+Shift+B`** - Kører default build task

## Lyd notifikationer

Når build er færdig, spiller scriptet automatisk lyd:
- Glass.aiff (standard macOS lyd)
- Hero.aiff (alternativ)
- Text-to-speech fallback
- Bell sound fallback

Du hører lyd både ved succes og fejl, så du altid ved når det er færdigt!

## Hvad sker der automatisk:

1. ✅ Metro bundler starter (hvis ikke allerede kører)
2. ✅ Xcode build kører
3. ✅ App installeres på simulator
4. ✅ App starter automatisk
5. ✅ Lyd spilles når færdigt

## Terminal metode:

Du kan også bruge terminalen:
```bash
run-gymly
```

## Xcode Build Phase

Der er også en build phase i Xcode der automatisk spiller lyd når du bygger direkte i Xcode.

