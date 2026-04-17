/**
 * Fjerner ydre hvid baggrund fra gymly-kettlebell.png (flood fill fra kanter).
 */
const sharp = require('sharp');
const path = require('path');

const root = path.join(__dirname, '..');
const input = path.join(root, 'src/assets/images/gymly-kettlebell.png');
const output = path.join(root, 'src/assets/images/gymly-kettlebell-transparent.png');

const NEAR_WHITE = (r, g, b) => r > 220 && g > 220 && b > 220;

async function main() {
  const {data, info} = await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const w = info.width;
  const h = info.height;
  const buf = new Uint8Array(data);
  const visited = new Uint8Array(w * h);
  const queue = [];

  const idx = (x, y) => (y * w + x) * 4;
  const pi = (x, y) => y * w + x;

  const tryPush = (x, y) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const p = pi(x, y);
    if (visited[p]) return;
    const i = idx(x, y);
    const r = buf[i];
    const g = buf[i + 1];
    const b = buf[i + 2];
    if (!NEAR_WHITE(r, g, b)) return;
    visited[p] = 1;
    queue.push([x, y]);
  };

  for (let x = 0; x < w; x++) {
    tryPush(x, 0);
    tryPush(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    tryPush(0, y);
    tryPush(w - 1, y);
  }

  while (queue.length) {
    const [x, y] = queue.pop();
    const i = idx(x, y);
    buf[i + 3] = 0;
    tryPush(x + 1, y);
    tryPush(x - 1, y);
    tryPush(x, y + 1);
    tryPush(x, y - 1);
  }

  await sharp(Buffer.from(buf), {
    raw: {width: w, height: h, channels: 4},
  })
    .png()
    .toFile(output);

  console.log('Skrev', output);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
