/**
 * Script to convert SVG files to PNG
 * Run with: node scripts/convert-svg-to-png.js
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const svgDir = path.join(__dirname, '../src/assets/images');
const muscleGroups = [
  'bryst',
  'triceps',
  'skulder',
  'ben',
  'biceps',
  'mave',
  'ryg',
  'hele-kroppen'
];

async function convertSvgToPng() {
  console.log('Converting SVG files to PNG...\n');

  for (const group of muscleGroups) {
    const svgPath = path.join(svgDir, `muscle-${group}.svg`);
    const pngPath = path.join(svgDir, `muscle-${group}.png`);

    if (!fs.existsSync(svgPath)) {
      console.log(`⚠️  SVG file not found: ${svgPath}`);
      continue;
    }

    try {
      await sharp(svgPath)
        .resize(512, 512, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .png()
        .toFile(pngPath);

      console.log(`✅ Converted: muscle-${group}.svg -> muscle-${group}.png`);
    } catch (error) {
      console.error(`❌ Error converting ${group}:`, error.message);
    }
  }

  console.log('\n✅ Conversion complete!');
}

convertSvgToPng().catch(console.error);
