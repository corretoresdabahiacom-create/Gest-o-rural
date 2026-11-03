// Gera os ícones PNG da PWA a partir do desenho em SVG (requer rsvg-convert).
import { writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const mark = `
  <path d="M92 150c8 78 70 108 126 96l10 34c-82 20-150-36-136-130z" fill="#f3e9d2"/>
  <path d="M420 150c-8 78-70 108-126 96l-10 34c82 20 150-36 136-130z" fill="#f3e9d2"/>
  <ellipse cx="170" cy="266" rx="34" ry="15" transform="rotate(-18 170 266)" fill="#e7d9b8"/>
  <ellipse cx="342" cy="266" rx="34" ry="15" transform="rotate(18 342 266)" fill="#e7d9b8"/>
  <path d="M192 236c0-20 128-20 128 0l-12 104c-5 44-26 74-52 74s-47-30-52-74z" fill="#f3e9d2"/>
  <circle cx="226" cy="296" r="10" fill="#14301f"/><circle cx="286" cy="296" r="10" fill="#14301f"/>
  <ellipse cx="256" cy="378" rx="40" ry="26" fill="#d39a4a"/>
  <circle cx="240" cy="378" r="6" fill="#14301f"/><circle cx="272" cy="378" r="6" fill="#14301f"/>`
const grad = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2c643d"/><stop offset="1" stop-color="#0f2a1a"/></linearGradient></defs>`
const svg = (rx, scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${grad}<rect width="512" height="512" rx="${rx}" fill="url(#g)"/><g transform="translate(256 ${256 + 18 * scale}) scale(${scale}) translate(-256 -282)">${mark}</g></svg>`

mkdirSync('public', { recursive: true })
writeFileSync('public/favicon.svg', svg(112, 1))
const tmp = { any: svg(112, 1), square: svg(0, 1), maskable: svg(0, 0.72) }
for (const [k, v] of Object.entries(tmp)) writeFileSync(`/tmp/ag-${k}.svg`, v)
const out = [
  ['any', 192, 'pwa-192.png'], ['any', 512, 'pwa-512.png'],
  ['maskable', 512, 'pwa-maskable-512.png'], ['square', 180, 'apple-touch-icon.png'],
]
for (const [k, size, name] of out) execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), `/tmp/ag-${k}.svg`, '-o', `public/${name}`])
console.log('ícones gerados')
