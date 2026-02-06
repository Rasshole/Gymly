#!/bin/bash

# iOS App Icon Generator Script
# Beskærer billedet og genererer alle nødvendige iOS ikon størrelser

# Kilde billede - opdater denne sti til dit beskårede billede
SOURCE_IMAGE="${1:-../icon-source.png}"

# Output mappe
OUTPUT_DIR="../ios/GymlyFresh/Images.xcassets/AppIcon.appiconset"

# Tjek om sips er tilgængelig (indbygget i macOS)
if ! command -v sips &> /dev/null; then
    echo "Fejl: sips kommandoen er ikke tilgængelig. Dette script kræver macOS."
    exit 1
fi

# Tjek om kilde billedet eksisterer
if [ ! -f "$SOURCE_IMAGE" ]; then
    echo "Fejl: Kilde billede ikke fundet: $SOURCE_IMAGE"
    echo ""
    echo "Brug: ./generate-ios-icons.sh <sti-til-firkantet-ikon.png>"
    echo ""
    echo "VIGTIGT: Billedet skal være:"
    echo "  - Firkantet (f.eks. 1024x1024 pixels)"
    echo "  - Uden hvid kant - kun den lilla del med vægten"
    echo "  - PNG format"
    echo ""
    echo "Du kan beskære billedet i Preview.app:"
    echo "  1. Åbn billedet i Preview"
    echo "  2. Vælg 'Tools' > 'Rectangular Selection'"
    echo "  3. Marker kun den lilla firkant"
    echo "  4. Vælg 'Tools' > 'Crop'"
    echo "  5. Gem som ny fil"
    exit 1
fi

echo "Genererer iOS app ikoner fra: $SOURCE_IMAGE"
echo "Output mappe: $OUTPUT_DIR"
echo ""

# Opret output mappe hvis den ikke eksisterer
mkdir -p "$OUTPUT_DIR"

# Generer alle nødvendige størrelser
# Format: output_navn pixelstørrelse
declare -a SIZES=(
    "AppIcon-20x20@2x.png 40"
    "AppIcon-20x20@3x.png 60"
    "AppIcon-29x29@2x.png 58"
    "AppIcon-29x29@3x.png 87"
    "AppIcon-40x40@2x.png 80"
    "AppIcon-40x40@3x.png 120"
    "AppIcon-60x60@2x.png 120"
    "AppIcon-60x60@3x.png 180"
    "AppIcon-1024x1024@1x.png 1024"
)

for SIZE_INFO in "${SIZES[@]}"; do
    read -r FILENAME PIXELS <<< "$SIZE_INFO"
    OUTPUT_PATH="$OUTPUT_DIR/$FILENAME"
    
    echo "Genererer $FILENAME (${PIXELS}x${PIXELS} pixels)..."
    
    # Kopier og resize med sips
    cp "$SOURCE_IMAGE" "$OUTPUT_PATH"
    sips -z "$PIXELS" "$PIXELS" "$OUTPUT_PATH" > /dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        echo "  ✓ $FILENAME oprettet"
    else
        echo "  ✗ Fejl ved oprettelse af $FILENAME"
    fi
done

echo ""
echo "Færdig! Alle iOS app ikoner er genereret i:"
echo "$OUTPUT_DIR"
echo ""
echo "Næste skridt:"
echo "  1. Åbn Xcode projektet"
echo "  2. Byg appen igen for at se det nye ikon"
