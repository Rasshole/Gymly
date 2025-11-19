#!/bin/bash
# Run Everything Script
# Starts Metro bundler, builds and runs the app, then plays sound when done

# Don't exit on error - we want to play sound even if build fails
set +e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$PROJECT_DIR/ios"
METRO_PORT=8081

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting Gymly - Run Everything${NC}"
echo ""

# Function to play sound notification
play_sound() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS - play system sound (try multiple options)
        afplay /System/Library/Sounds/Glass.aiff 2>/dev/null || \
        afplay /System/Library/Sounds/Hero.aiff 2>/dev/null || \
        say "Build complete" 2>/dev/null || \
        echo -e "\a" # Bell sound
        echo -e "${GREEN}🔔 Sound notification played!${NC}"
    fi
}

# Function to check if Metro is running
check_metro() {
    lsof -ti:$METRO_PORT > /dev/null 2>&1
}

# Function to start Metro bundler
start_metro() {
    if check_metro; then
        echo -e "${YELLOW}⚠️  Metro bundler is already running on port $METRO_PORT${NC}"
    else
        echo -e "${BLUE}📦 Starting Metro bundler...${NC}"
        cd "$PROJECT_DIR"
        
        # Start Metro in background
        npx react-native start --port $METRO_PORT > /tmp/metro-gymly.log 2>&1 &
        METRO_PID=$!
        echo "Metro PID: $METRO_PID"
        
        # Wait for Metro to be ready
        echo "Waiting for Metro to start..."
        for i in {1..30}; do
            if curl -s http://localhost:$METRO_PORT/status > /dev/null 2>&1; then
                echo -e "${GREEN}✅ Metro bundler is ready!${NC}"
                break
            fi
            sleep 1
        done
    fi
}

# Function to build and run in Xcode
build_and_run() {
    echo ""
    echo -e "${BLUE}🔨 Building and running in Xcode...${NC}"
    
    cd "$IOS_DIR"
    
    # Find available simulator
    SIMULATOR_UDID=$(xcrun simctl list devices available | grep -i "iPhone" | head -1 | grep -oE '[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}' | head -1)
    
    if [ -z "$SIMULATOR_UDID" ]; then
        # Try to boot default simulator
        echo -e "${YELLOW}⚠️  No simulator found, trying to boot default...${NC}"
        xcrun simctl boot "iPhone 17 Pro" 2>/dev/null || true
        SIMULATOR_UDID=$(xcrun simctl list devices | grep -i "iPhone 17 Pro" | grep -i "Booted" | grep -oE '[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}' | head -1)
    fi
    
    # Use xcodebuild to build
    echo -e "${BLUE}Building...${NC}"
    xcodebuild \
        -workspace Gymly.xcworkspace \
        -scheme GymlyFresh \
        -destination "platform=iOS Simulator,id=$SIMULATOR_UDID" \
        clean build \
        2>&1 | tee /tmp/xcode-build.log
    
    # Show build summary
    echo ""
    grep -E "(BUILD SUCCEEDED|BUILD FAILED)" /tmp/xcode-build.log | tail -1 || true
    
    # Check if build was successful
    BUILD_RESULT=$(tail -1 /tmp/xcode-build.log | grep -o "BUILD SUCCEEDED\|BUILD FAILED" || echo "")
    
    if [[ "$BUILD_RESULT" == *"BUILD SUCCEEDED"* ]]; then
        echo ""
        echo -e "${GREEN}✅ Build successful!${NC}"
        
        # Find the built app
        APP_PATH=$(find "$IOS_DIR/build" -name "GymlyFresh.app" -type d | head -1)
        
        if [ -n "$APP_PATH" ]; then
            # Install and run on simulator
            echo -e "${BLUE}📱 Installing on simulator...${NC}"
            xcrun simctl install booted "$APP_PATH" 2>/dev/null || true
            
            echo -e "${BLUE}▶️  Launching app...${NC}"
            xcrun simctl launch booted org.reactjs.native.example.GymlyFresh 2>/dev/null || true
        fi
        
        echo ""
        echo -e "${GREEN}🎉 Everything is running!${NC}"
        play_sound
        return 0
    else
        echo ""
        echo -e "${RED}❌ Build failed!${NC}"
        echo -e "${YELLOW}Check /tmp/xcode-build.log for details${NC}"
        play_sound
        return 1
    fi
}

# Cleanup function
cleanup() {
    echo ""
    echo -e "${YELLOW}Cleaning up...${NC}"
    # Don't kill Metro - let it run
    exit 0
}

trap cleanup EXIT INT TERM

# Main execution
start_metro
sleep 2
build_and_run

echo ""
echo -e "${GREEN}✨ Done! Metro is still running in the background.${NC}"
echo -e "${BLUE}To stop Metro, run: lsof -ti:$METRO_PORT | xargs kill${NC}"
echo ""
echo -e "${GREEN}🎊 All done! App should be running in simulator.${NC}"

