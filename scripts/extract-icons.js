const sharp = require('sharp');
const path = require('path');

const inputPath = process.argv[2];
const outputDir = path.join(__dirname, '../src/assets/images');
const names = ['tab-home', 'tab-online', 'tab-checkin', 'tab-messages', 'tab-profile'];

async function extract() {
  const metadata = await sharp(inputPath).metadata();
  const w = metadata.width;
  const h = metadata.height;
  const iconW = Math.floor(w / 5);

  for (let i = 0; i < 5; i++) {
    const left = i * iconW;
    await sharp(inputPath)
      .extract({ left, top: 0, width: iconW, height: h })
      .png()
      .toFile(path.join(outputDir, `${names[i]}.png`));
    console.log(`Saved ${names[i]}.png`);
  }
}

extract().catch(console.error);
