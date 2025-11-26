#!/bin/bash
# Script til at oprette en Pull Request fra Patti branch til main

echo "🔀 Opretter Pull Request fra Patti → main"
echo ""

# Tjek om vi er på Patti branch
CURRENT_BRANCH=$(git branch --show-current)

if [ "$CURRENT_BRANCH" != "Patti" ]; then
    echo "⚠️  Du er ikke på Patti branch. Skifter til Patti..."
    git checkout Patti
fi

# Push ændringer hvis der er nogle
if [ -n "$(git status --porcelain)" ]; then
    echo "📝 Der er uncommitted ændringer. Vil du committe dem? (y/n)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        git add .
        echo "Skriv commit besked:"
        read -r commit_msg
        git commit -m "$commit_msg"
    fi
fi

# Push til GitHub
echo "⬆️  Pusher til GitHub..."
git push origin Patti

# Prøv at åbne PR link i browser
echo ""
echo "✅ Pushed til GitHub!"
echo ""
echo "🌐 Åbner PR side i browser..."
open "https://github.com/Rasshole/Gymly/compare/main...Patti?expand=1" 2>/dev/null || \
echo "Gå til: https://github.com/Rasshole/Gymly/compare/main...Patti"

echo ""
echo "📝 Udfyld PR formularen på GitHub og klik 'Create pull request'"



