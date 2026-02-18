# Sådan får du vist den opdaterede swipe-knap (kettlebell)

Appen cacher ofte den gamle JavaScript-bundle. Følg disse trin for at være sikker på, at den nye swipe-knap (kettlebell-logo) vises:

1. **Stop Metro** (Ctrl+C i terminalen hvor `npm start` kører).

2. **Slet appen fra simulator:**
   - I iPhone-simulatoren: langt tryk på Gymly-ikonet → Fjern App → Fjern.

3. **Ryd Xcode-build:**
   - I Xcode: **Product** → **Clean Build Folder** (Shift+Cmd+K).

4. **Start Metro med ren cache:**
   ```bash
   cd /Users/patrickgarcia/Desktop/Gymly/Gymly-1
   npm start -- --reset-cache
   ```
   Lad Metro køre (vent til du ser "Welcome to Metro").

5. **Byg og kør appen fra Xcode:**
   - I Xcode: **Product** → **Run** (Cmd+R).

6. Gå til **Tjek ind**-fanen. Swipe-knappen skal nu vise kettlebell-logoet i stedet for pilen.
