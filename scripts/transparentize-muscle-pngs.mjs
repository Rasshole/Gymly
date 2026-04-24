/**
 * Gør hvid / næsten-hvid baggrund gennemsigtig på valgte muskelgruppe-PNG'er
 * (fx pilates, reformer), så valgte knapper ikke får hvid boks.
 * Kør: node scripts/transparentize-muscle-pngs.mjs
 */
import path from 'path';
import {fileURLToPath} from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dir = path.join(root, 'src/assets/muscleGroups');
const files = ['pilates.png', 'reformer.png'];

/**
 * Fjerner ensfarvet lys baggrund; bevarer mørk linje + antialias.
 * min(r,g,b) høj = baggrund; lav = linje.
 */
function stripLightBackground(data) {
  for (let o = 0; o < data.length; o += 4) {
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const minC = Math.min(r, g, b);
    if (minC > 250) {
      data[o + 3] = 0;
    } else if (minC > 218) {
      const t = (minC - 218) / 32;
      data[o + 3] = Math.round(255 * (1 - t));
    } else {
      data[o + 3] = 255;
    }
  }
}

async function run() {
  for (const name of files) {
    const p = path.join(dir, name);
    const {data, info} = await sharp(p).ensureAlpha().raw().toBuffer({resolveWithObject: true});
    const {width, height} = info;
    stripLightBackground(data);
    await sharp(data, {
      raw: {width, height, channels: 4},
    })
      .png({compressionLevel: 9, effort: 10})
      .toFile(p);
    console.log('Updated', p);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
