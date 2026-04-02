import { mkdirSync, copyFileSync, existsSync } from 'fs'
import { dirname } from 'path'

const copies = [
  ['manifest.json', 'dist/manifest.json'],
  ['popup/popup.html', 'dist/popup/popup.html'],
  ['popup/popup.js', 'dist/popup/popup.js'],
  ['icons/icon16.png', 'dist/icons/icon16.png'],
  ['icons/icon48.png', 'dist/icons/icon48.png'],
  ['icons/icon128.png', 'dist/icons/icon128.png'],
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

console.log('Build copy complete.')
