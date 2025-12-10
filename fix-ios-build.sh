#!/bin/bash

echo "🔧 Fixing iOS build issues..."

cd "$(dirname "$0")"

# Set up environment
export PATH="$HOME/.local/bin:$HOME/.gem/ruby/2.6.0/bin:$PATH"
export RUBYOPT="-r/usr/lib/ruby/2.6.0/logger"

# Clean build folder
echo "📦 Cleaning build folder..."
rm -rf ios/build
rm -rf ios/Pods
rm -f ios/Podfile.lock

# Reinstall pods
echo "📥 Installing CocoaPods dependencies..."
cd ios
pod deintegrate 2>/dev/null || true
pod install --repo-update

echo "✅ Done! Now:"
echo "1. Close Xcode if it's open"
echo "2. Open Gymly.xcworkspace (NOT Gymly.xcodeproj):"
echo "   open ios/Gymly.xcworkspace"
echo "3. Clean build folder in Xcode: Product > Clean Build Folder (Shift+Cmd+K)"
echo "4. Build again: Product > Build (Cmd+B)"

