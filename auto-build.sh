#!/bin/bash
# Auto Build Script - Kører automatisk build og spiller lyd når færdigt
# Dette script kører automatisk efter ændringer

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$PROJECT_DIR/ios"
METRO_PORT=8081

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Function to play sound
play_sound() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        afplay /System/Library/Sounds/Glass.aiff 2>/dev/null || \
        afplay /System/Library/Sounds/Hero.aiff 2>/dev/null || \
        say "Build complete" 2>/dev/null || \
        echo -e "\a"
    fi
}

# Check if Metro is running
check_metro() {
    lsof -ti:$METRO_PORT > /dev/null 2>&1
}

# Start Metro if not running
if ! check_metro; then
    echo -e "${BLUE}📦 Starting Metro...${NC}"
    cd "$PROJECT_DIR"
    npx react-native start --port $METRO_PORT > /tmp/metro-gymly.log 2>&1 &
    sleep 5
fi

# Build in Xcode
echo -e "${BLUE}🔨 Building...${NC}"
cd "$IOS_DIR"

# Find simulator
SIMULATOR_UDID=$(xcrun simctl list devices | grep -i "iPhone 17 Pro" | grep -i "Booted" | grep -oE '[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}' | head -1)

if [ -z "$SIMULATOR_UDID" ]; then
    xcrun simctl boot "iPhone 17 Pro" 2>/dev/null || true
    SIMULATOR_UDID=$(xcrun simctl list devices | grep -i "iPhone 17 Pro" | grep -i "Booted" | grep -oE '[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}' | head -1)
fi

# Build
xcodebuild \
    -workspace Gymly.xcworkspace \
    -scheme GymlyFresh \
    -destination "platform=iOS Simulator,id=$SIMULATOR_UDID" \
    build \
    2>&1 | tee /tmp/xcode-build.log > /dev/null

# Check result
if grep -q "BUILD SUCCEEDED" /tmp/xcode-build.log; then
    echo -e "${GREEN}✅ Build successful!${NC}"
    
    # Install and launch
    APP_PATH=$(find "$IOS_DIR/build" -name "GymlyFresh.app" -type d | head -1)
    if [ -n "$APP_PATH" ]; then
        xcrun simctl install booted "$APP_PATH" 2>/dev/null || true
        xcrun simctl launch booted org.reactjs.native.example.GymlyFresh 2>/dev/null || true
    fi
    
    play_sound
    exit 0
else
    echo -e "${RED}❌ Build failed${NC}"
    play_sound
    exit 1
fi

