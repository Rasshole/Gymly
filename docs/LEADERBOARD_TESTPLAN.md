# Rangliste – Testplan

## 1. Navigation og adgang

- [ ] Tryk på trofæ-ikon i header → Rangliste-skærm åbnes
- [ ] Gå til Profil → Stats → tryk på "Rangliste"-kortet → Rangliste åbnes
- [ ] Gå til Venner → tryk på "Se ranglisten" → Rangliste åbnes
- [ ] Gå til et center (Centre-tab) → Center detaljer → tryk på "Rangliste" → Gym-rangliste åbnes

## 2. Tabs: Global / Venner / Centre

- [ ] Vælg **Global** → viser global rangliste
- [ ] Vælg **Venner** → viser kun venner
- [ ] Vælg **Centre** → viser liste over centre med ugens mester

## 3. Periode-filter (Global og Venner)

- [ ] Vælg **Denne uge** → rangliste opdateres
- [ ] Vælg **Denne måned** → rangliste opdateres
- [ ] Vælg **Altid** → rangliste opdateres

## 4. Kategorier (Global)

- [ ] Vælg **Check-ins** → viser flest check-ins
- [ ] Vælg **PR'er** → viser flest PR'er
- [ ] Vælg **Træningstid** → viser mest træningstid (min)
- [ ] Vælg **Træning med venner** → viser sociale træninger
- [ ] Vælg **Stribe** → viser længste stribe
- [ ] Vælg **Disciplin** → viser muskelgrupper
- [ ] Vælg **Bænkpres** / **Squat** / **Dødløft** → viser styrke-PR (kg)
- [ ] Vælg **Global aktivitet** → viser aktivitetsscore

## 5. UI-elementer

- [ ] Placering 1–3 har guld/sølv/bronze badge
- [ ] Nr. 1 har trofæ-ikon
- [ ] Egne række er fremhævet (lilla ramme)
- [ ] Venner har "Ven"-badge
- [ ] Ugens mester har "🏆 Ugens mester"-badge (på gym-rangliste)
- [ ] Loading: skeleton vises kort ved skift af kategori/periode
- [ ] Tryk på bruger → åbner profil (undtagen egen)

## 6. Centre-tab

- [ ] Liste med centre vises
- [ ] Hvert center viser "🏆 Ugens mester: [Navn]" når relevant
- [ ] Tryk på center → åbner GymLeaderboardScreen
- [ ] Gym-rangliste viser "Ugens mester"-banner øverst

## 7. Weekly Champion

- [ ] På centerdetaljer: "Ugens mester"-banner vises
- [ ] På profil: "Ugens mester – [Center]" vises hvis bruger er champion
- [ ] På gym-rangliste: champion har badge ved sin række

## 8. Cache og performance

- [ ] Skift mellem Global/Venner → ingen lang ventetid (cache)
- [ ] Skift kategori → kort loading (skeleton)
- [ ] Skift tilbage til tidligere kategori → data vises hurtigt (cache)

## 9. Stats-opdatering (ved Firestore)

Når Firestore er aktiveret:

- [ ] Efter check-in → leaderboard opdateres (evt. med forsinkelse)
- [ ] Efter PR → PR-rangliste opdateres
- [ ] Efter afsluttet træning → træningstid/social opdateres
