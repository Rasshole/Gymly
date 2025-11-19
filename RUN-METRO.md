# Sådan starter du Metro Bundler

## Problem
Metro bundler starter ikke automatisk. Du skal starte den manuelt i en terminal.

## Løsning

1. **Åbn en ny terminal**

2. **Kør disse kommandoer:**
```bash
cd /Users/patrickgarcia/Desktop/Gymly/Gymly-1
export PATH="$HOME/.local/bin:$HOME/.gem/ruby/2.6.0/bin:$PATH"
export RUBYOPT="-r/usr/lib/ruby/2.6.0/logger"
npm start
```

3. **Lad terminalen køre** - Metro bundler skal køre mens appen kører

4. **I Xcode:**
   - Byg og kør appen (⌘R)
   - Når build er færdig, hører du en lyd
   - Appen vil automatisk forbinde til Metro bundler

## Hvis Metro bundler fejler

Hvis du ser fejlen "Cannot read properties of undefined (reading 'handle')":

1. Tjek Node.js version:
```bash
node --version
```
Skal være >= 20.19.4

2. Hvis version er forkert, opdater Node.js:
```bash
# Download og installer Node.js 20.19.4 fra:
# https://nodejs.org/dist/v20.19.4/node-v20.19.4-darwin-arm64.tar.gz
```

3. Eller brug nvm (hvis installeret):
```bash
nvm install 20
nvm use 20
```

## Alternativ: Brug start-metro.sh script

Jeg har oprettet et script til dig:

```bash
cd /Users/patrickgarcia/Desktop/Gymly/Gymly-1
./start-metro.sh
```

