// Run with: node scripts/generate-icons.js
// Generates PWA icons from the SVG favicon using sharp (npm install sharp)
// If you don't want to install sharp, use https://realfavicongenerator.net instead

import { writeFileSync, mkdirSync } from 'fs';

// Simple approach: create PNG placeholder icons
// Replace these with actual branded icons before going to production

const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="80" fill="#1D4ED8"/>
  <text x="256" y="340" font-family="Arial" font-size="260" font-weight="bold" text-anchor="middle" fill="white">AG</text>
  <text x="256" y="430" font-family="Arial" font-size="64" text-anchor="middle" fill="#93C5FD">E-GOV</text>
</svg>`;

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon.svg', svgIcon);

console.log('✅ SVG icon created at public/icons/icon.svg');
console.log('');
console.log('Next steps:');
console.log('  1. Visit https://realfavicongenerator.net');
console.log('  2. Upload public/icons/icon.svg');
console.log('  3. Download the package');
console.log('  4. Place icon-192.png and icon-512.png in public/icons/');
