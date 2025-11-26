# Hvad betyder det at "oprette en PR"?

## Enkel forklaring:

**PR = Pull Request** (på dansk: "Anmodning om at trække ændringer ind")

## Hvad betyder det praktisk?

Når du "opretter en PR", betyder det at du:

1. **Har lavet ændringer** på din egen branch (Patti)
2. **Vil have dem merged** ind i main branch (den officielle version)
3. **Anmoder om det** gennem GitHub

## Tænk på det sådan:

```
📦 Main branch (officiel version)
   ↓
👤 Du laver ændringer på Patti branch
   ↓
📝 Du opretter en PR (siger: "Kan mine ændringer komme ind i main?")
   ↓
👀 Nogen reviewer dine ændringer
   ↓
✅ Hvis godkendt: Ændringerne bliver merged til main
```

## Hvad sker der når du opretter en PR?

1. **GitHub viser dine ændringer**
   - Alle kan se hvad du har ændret
   - De kan se hvilke filer der er ændret
   - De kan se den faktiske kode

2. **Folk kan review**
   - De kan kommentere på din kode
   - Foreslå forbedringer
   - Stille spørgsmål

3. **Diskussion**
   - I kan diskutere ændringerne
   - Løse problemer sammen
   - Blive enige om løsninger

4. **Merge (hvis godkendt)**
   - Når alle er tilfredse, merges PR'en
   - Dine ændringer kommer nu ind i main branch
   - Alle får dine ændringer

## Eksempel:

**Scenario:**
- Du har tilføjet en ny feature på Patti branch
- Nu vil du have den i main branch

**Proces:**
1. Du opretter en PR fra Patti → main
2. GitHub viser: "Patti vil merge 5 filer til main"
3. Nogen reviewer og siger: "Ser godt ud! 👍"
4. PR'en bliver merged
5. Nu er din feature i main! 🎉

## Hvorfor bruge PRs?

✅ **Sikkerhed**: Undgår at ødelægge main branch
✅ **Kvalitet**: Kode bliver reviewet før merge
✅ **Samarbejde**: Alle kan se og diskutere ændringer
✅ **Historie**: Alle ændringer bliver dokumenteret
✅ **Rollback**: Hvis noget går galt, kan man nemt gå tilbage

## Sådan opretter du en PR:

### Metode 1: Brug scriptet (nemmest)
```bash
create-pr
```
Dette åbner automatisk PR-siden på GitHub.

### Metode 2: På GitHub
1. Gå til: https://github.com/Rasshole/Gymly
2. Du vil se en banner: "Patti had recent pushes"
3. Klik "Compare & pull request"
4. Udfyld beskrivelse
5. Klik "Create pull request"

### Metode 3: Direkte link
Gå til: https://github.com/Rasshole/Gymly/compare/main...Patti

## Hvad sker der efter du opretter PR?

1. **PR'en bliver oprettet** - Alle kan se den
2. **Review proces** - Nogen kigger på dine ændringer
3. **Diskussion** (hvis nødvendigt) - I diskuterer ændringerne
4. **Merge** - Når godkendt, merges PR'en til main
5. **Færdig!** - Dine ændringer er nu i main branch

## Eksempel på en PR beskrivelse:

```
Titel: Tilføj åbningstider til gym centres

Beskrivelse:
- Tilføjet åbningstider funktionalitet
- Viser om centre er åbne eller lukkede
- Sorterer centre efter åbent status

Testet:
- ✅ Testet på iOS simulator
- ✅ Alle centre viser korrekt status
```

## Tips:

- **Beskriv hvad du har lavet** - Gør det nemt for andre at forstå
- **Commit ofte** - Små commits er nemmere at review
- **Test først** - Sørg for at din kode virker før PR
- **Vær åben for feedback** - PRs er til at forbedre koden sammen



