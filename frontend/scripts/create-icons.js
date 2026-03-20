/**
 * Generates icon-192.png and icon-512.png for the PWA manifest.
 * Run once before building: node scripts/create-icons.js
 * Requires: npm install sharp
 */
import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const svg = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="80" fill="#1D4ED8"/>
  <text x="256" y="320" font-family="Arial,sans-serif" font-size="240"
        font-weight="bold" text-anchor="middle" fill="white">AG</text>
  <text x="256" y="420" font-family="Arial,sans-serif" font-size="60"
        text-anchor="middle" fill="#93C5FD">E-GOV</text>
</svg>`);

await sharp(svg).resize(192, 192).png().toFile(join(outDir, 'icon-192.png'));
console.log('✅ icon-192.png created');

await sharp(svg).resize(512, 512).png().toFile(join(outDir, 'icon-512.png'));
console.log('✅ icon-512.png created');

console.log('\nDone! Now run: npm run build');
