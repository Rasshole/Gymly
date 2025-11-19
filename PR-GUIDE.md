# Pull Request (PR) Guide

## Hvad er en Pull Request (PR)?

En **Pull Request** (PR) er en måde at foreslå ændringer fra din branch til main branch. Det er som at sige:
- "Hej, jeg har lavet nogle ændringer på min branch (Patti)"
- "Kan I se dem og merge dem ind i main branch?"

## Hvorfor bruge PRs?

1. **Code Review**: Andre kan se dine ændringer før de bliver merged
2. **Diskussion**: I kan diskutere ændringerne
3. **Sikkerhed**: Undgår at ødelægge main branch
4. **Historie**: Alle ændringer bliver dokumenteret

## Sådan laver du en PR:

### 1. Lav ændringer på din branch (Patti)
```bash
git checkout Patti
# Lav dine ændringer...
git add .
git commit -m "Beskrivelse af ændringerne"
git push origin Patti
```

### 2. Opret PR på GitHub

**Metode 1: Via GitHub Website**
1. Gå til: https://github.com/Rasshole/Gymly
2. Du vil se en banner: "Patti had recent pushes" med en "Compare & pull request" knap
3. Klik på "Compare & pull request"
4. Skriv en beskrivelse af dine ændringer
5. Klik "Create pull request"

**Metode 2: Via GitHub CLI (hvis installeret)**
```bash
gh pr create --title "Min PR titel" --body "Beskrivelse"
```

**Metode 3: Via Link**
- Gå direkte til: https://github.com/Rasshole/Gymly/compare/main...Patti

### 3. Review og Merge

Når PR'en er oprettet:
- Andre kan se dine ændringer
- De kan kommentere og foreslå ændringer
- Når alle er tilfredse, kan PR'en merges til main

## Workflow Eksempel:

```
1. Du arbejder på Patti branch
2. Laver ændringer
3. Committer og pusher til Patti
4. Opretter PR fra Patti → main
5. Nogen reviewer og merger
6. Nu er dine ændringer i main!
```

## Vigtige Commands:

```bash
# Skift til din branch
git checkout Patti

# Se hvilken branch du er på
git branch

# Se alle branches
git branch -a

# Opdater din branch med ændringer fra main
git checkout Patti
git pull origin main
git merge main
# eller: git rebase main
```

## Tips:

- **Commit ofte**: Lav små commits med klare beskrivelser
- **Push regelmæssigt**: Så dine ændringer er sikret
- **Beskriv ændringerne**: I PR beskrivelsen, forklar hvad du har lavet og hvorfor
- **Review selv først**: Tjek dine ændringer før du opretter PR

