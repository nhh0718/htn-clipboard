import { mkdirSync, copyFileSync, existsSync, writeFileSync } from 'fs'
import { dirname } from 'path'

const copies = [
  ['manifest.json', 'dist/manifest.json'],
  ['popup/popup.html', 'dist/popup/popup.html'],
  ['popup/popup.css', 'dist/popup/popup.css'],
]

for (const [src, dst] of copies) {
  mkdirSync(dirname(dst), { recursive: true })
  if (existsSync(src)) {
    copyFileSync(src, dst)
    console.log(`Copied: ${src} → ${dst}`)
  } else {
    console.warn(`Warning: source not found: ${src}`)
  }
}

// Create placeholder icons — minimal 1x1 transparent PNG
mkdirSync('dist/icons', { recursive: true })
const PNG1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)
for (const size of [16, 48, 128]) {
  const dest = `dist/icons/icon${size}.png`
  writeFileSync(dest, PNG1x1)
  console.log(`Created placeholder icon: ${dest}`)
}

console.log('Build copy complete.')
