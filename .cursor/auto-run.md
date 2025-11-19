# Auto-Run i Cursor

## Sådan kører du alt automatisk:

### Option 1: Brug Task Runner (Anbefalet)
1. Tryk `Cmd+Shift+P` (eller `Ctrl+Shift+P`)
2. Skriv "Tasks: Run Task"
3. Vælg "🚀 Run Everything (Metro + Build + Run)"
4. Eller tryk `Cmd+Shift+B` for at køre default build task

### Option 2: Brug Terminal
```bash
run-gymly
```

### Option 3: Automatisk når du gemmer
Du kan også sætte op automatisk build når filer gemmes (se settings.json)

## Lyd notifikationer

Når build er færdig, spiller scriptet automatisk lyd:
- Glass.aiff (standard macOS lyd)
- Hero.aiff (alternativ)
- Text-to-speech fallback
- Bell sound fallback

## Xcode Build Phase

Der er også en build phase i Xcode der automatisk spiller lyd når du bygger i Xcode.

