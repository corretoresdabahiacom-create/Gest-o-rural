// Gera os ícones PNG da PWA a partir do desenho em SVG (requer rsvg-convert).
import { writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const mark = `
  <ellipse cx="124" cy="236" rx="66" ry="27" transform="rotate(-14 124 236)" fill="#f3e9d2"/>
  <ellipse cx="388" cy="236" rx="66" ry="27" transform="rotate(14 388 236)" fill="#f3e9d2"/>
  <ellipse cx="132" cy="237" rx="44" ry="14" transform="rotate(-14 132 237)" fill="#e9b0a0"/>
  <ellipse cx="380" cy="237" rx="44" ry="14" transform="rotate(14 380 237)" fill="#e9b0a0"/>
  <path d="M176 202c0-36 160-36 160 0l-10 112c-5 62-30 104-70 104s-65-42-70-104z" fill="#f3e9d2"/>
  <ellipse cx="256" cy="180" rx="36" ry="15" fill="#e7d9b8"/>
  <circle cx="218" cy="290" r="11" fill="#14301f"/><circle cx="294" cy="290" r="11" fill="#14301f"/>
  <ellipse cx="256" cy="376" rx="60" ry="40" fill="#e9b0a0"/>
  <ellipse cx="236" cy="376" rx="8" ry="11" fill="#14301f"/><ellipse cx="276" cy="376" rx="8" ry="11" fill="#14301f"/>`
const grad = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2c643d"/><stop offset="1" stop-color="#0f2a1a"/></linearGradient></defs>`
const svg = (rx, scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${grad}<rect width="512" height="512" rx="${rx}" fill="url(#g)"/><g transform="translate(256 ${256 + 18 * scale}) scale(${scale}) translate(-256 -282)">${mark}</g></svg>`

mkdirSync('public', { recursive: true })
writeFileSync('public/favicon.svg', svg(112, 1))
const tmp = { any: svg(112, 1), square: svg(0, 1), maskable: svg(0, 0.72) }
for (const [k, v] of Object.entries(tmp)) writeFileSync(`/tmp/claude-0/ag-${k}.svg`, v)
const out = [
  ['any', 192, 'pwa-192.png'], ['any', 512, 'pwa-512.png'],
  ['maskable', 512, 'pwa-maskable-512.png'], ['square', 180, 'apple-touch-icon.png'],
]
for (const [k, size, name] of out) execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), `/tmp/claude-0/ag-${k}.svg`, '-o', `public/${name}`])
console.log('ícones gerados')
