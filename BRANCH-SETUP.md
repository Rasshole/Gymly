# Branch Setup - Patti Branch

## Din Branch: "Patti"

Jeg har oprettet en branch kaldet **"Patti"** til dig. Dette er din egen branch hvor du kan arbejde på ændringer uden at påvirke main branch.

## Sådan bruger du din branch:

### Skift til din branch:
```bash
git checkout Patti
```

### Se hvilken branch du er på:
```bash
git branch
```

### Arbejd på din branch:
1. Skift til Patti: `git checkout Patti`
2. Lav dine ændringer
3. Commit: `git add . && git commit -m "Beskrivelse"`
4. Push: `git push origin Patti`

## Pull Request (PR) - Forklaring

### Hvad er en PR?
En **Pull Request** er en måde at foreslå at dine ændringer fra "Patti" branch bliver merged ind i "main" branch.

**Tænk på det sådan:**
- **Main branch** = Den officielle version af appen
- **Patti branch** = Din egen version hvor du laver ændringer
- **Pull Request** = "Kan mine ændringer blive merged ind i main?"

### Hvorfor bruge PRs?
1. ✅ **Code Review**: Andre kan se dine ændringer før de bliver merged
2. ✅ **Diskussion**: I kan diskutere ændringerne
3. ✅ **Sikkerhed**: Undgår at ødelægge main branch
4. ✅ **Historie**: Alle ændringer bliver dokumenteret

### Sådan laver du en PR:

**Metode 1: Brug scriptet (Nemmest)**
```bash
create-pr
```
Dette åbner automatisk PR siden på GitHub.

**Metode 2: Manuelt på GitHub**
1. Gå til: https://github.com/Rasshole/Gymly
2. Klik på "Pull requests" tab
3. Klik "New pull request"
4. Vælg: base: `main` ← compare: `Patti`
5. Udfyld beskrivelse og klik "Create pull request"

**Metode 3: Direkte link**
Gå til: https://github.com/Rasshole/Gymly/compare/main...Patti

## Workflow Eksempel:

```
1. git checkout Patti          # Skift til din branch
2. # Lav dine ændringer...
3. git add .
4. git commit -m "Tilføjede ny feature"
5. git push origin Patti       # Push til GitHub
6. create-pr                   # Opret PR (eller gør det på GitHub)
7. Vent på review og merge     # Nogen reviewer og merger til main
```

## Vigtige Commands:

```bash
# Se alle branches
git branch -a

# Skift til main branch
git checkout main

# Skift tilbage til Patti
git checkout Patti

# Opdater din branch med ændringer fra main
git checkout Patti
git pull origin main
```

## Tips:

- **Arbejd altid på Patti branch** når du laver nye features
- **Commit ofte** med klare beskrivelser
- **Push regelmæssigt** så dine ændringer er sikret
- **Opret PR** når du er klar til at merge dine ændringer

