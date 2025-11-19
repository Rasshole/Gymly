#!/bin/bash
# Script to easily push changes to GitHub

echo "🚀 Pushing to GitHub..."

# Add all changes
git add .

# Check if there are changes to commit
if git diff --staged --quiet; then
    echo "✅ No changes to commit"
else
    # Commit with a message
    if [ -z "$1" ]; then
        COMMIT_MSG="Update: $(date '+%Y-%m-%d %H:%M:%S')"
    else
        COMMIT_MSG="$1"
    fi
    
    echo "📝 Committing changes: $COMMIT_MSG"
    git commit -m "$COMMIT_MSG"
fi

# Push to GitHub
echo "⬆️  Pushing to origin/main..."
if git push origin main; then
    echo "✅ Successfully pushed to GitHub!"
else
    echo "❌ Push failed. Make sure you've added your SSH key to GitHub."
    echo "   Go to: https://github.com/settings/keys"
    exit 1
fi

