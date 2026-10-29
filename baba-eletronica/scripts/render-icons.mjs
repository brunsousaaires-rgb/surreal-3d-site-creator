// Gera os PNGs do app a partir de public/icons/icon.svg (requer Playwright).
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')

const svg = readFileSync(new URL('../public/icons/icon.svg', import.meta.url), 'utf8')
const out = (name) => new URL(`../public/icons/${name}`, import.meta.url).pathname

const browser = await chromium.launch()
const page = await browser.newPage()
async function render(name, size, { pad = 0, square = false } = {}) {
  await page.setViewportSize({ width: size, height: size })
  const inner = square ? svg.replace('rx="112"', 'rx="0"') : svg
  await page.setContent(`<html><body style="margin:0;background:${square ? '#070b18' : 'transparent'}">
    <div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:${pad ? '#070b18' : 'transparent'}">
      <div style="width:${size - pad * 2}px;height:${size - pad * 2}px">${inner.replace('<svg ', '<svg width="100%" height="100%" ')}</div>
    </div></body></html>`)
  await page.screenshot({ path: out(name), omitBackground: !square && !pad })
}
await render('icon-192.png', 192)
await render('icon-512.png', 512)
await render('icon-maskable-512.png', 512, { pad: 0, square: true })
await render('apple-touch-icon.png', 180, { square: true })
await browser.close()
console.log('ícones gerados')
