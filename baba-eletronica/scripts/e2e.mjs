// Teste ponta a ponta com dois "aparelhos" no Chromium (câmera/microfone falsos).
//   node scripts/e2e.mjs            → mesma sessão do navegador (relé local entre abas)
//   MODE=relay node scripts/e2e.mjs → navegadores isolados, sinalização pelos relés públicos
// Requer `npm run build && npx vite preview --port 4173` rodando.
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'

const { chromium } = createRequire(import.meta.url)('playwright')
const BASE = process.env.BASE ?? 'http://localhost:4173'
const MODE = process.env.MODE ?? 'local'
const OUT = process.env.OUT ?? 'test-results'
const AUDIO = process.env.FAKE_AUDIO
mkdirSync(OUT, { recursive: true })

const args = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required']
if (AUDIO) args.push(`--use-file-for-fake-audio-capture=${AUDIO}`)
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined
const browser = await chromium.launch({ args, proxy })
const ctxOpts = { ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ['camera', 'microphone'] }
const ctxA = await browser.newContext(ctxOpts)
const ctxB = MODE === 'relay' ? await browser.newContext(ctxOpts) : ctxA
// RELAYS=mqtt|nostr limita a sinalização a um tipo de relé (testa cada caminho isolado).
if (process.env.RELAYS) {
  const only = process.env.RELAYS
  for (const ctx of new Set([ctxA, ctxB])) {
    await ctx.addInitScript((only) => {
      const s = JSON.parse(localStorage.getItem('ninar.settings.v1') || '{}')
      localStorage.setItem('ninar.settings.v1', JSON.stringify({ ...s, useMqtt: only === 'mqtt', useNostr: only === 'nostr' }))
    }, only)
  }
}

const errors = []
function watch(page, name) {
  page.on('pageerror', (e) => errors.push(`[${name}] pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[${name}] console: ${m.text()}`)
    if (process.env.VERBOSE) console.log(`[${name}] ${m.type()}: ${m.text()}`)
  })
}
/** Mostra os controles do monitor (um toque no vídeo alterna a visibilidade). */
async function showChrome(page) {
  const hidden = await page.evaluate(() => !!document.querySelector('.pointer-events-none.opacity-0'))
  if (hidden) {
    await page.mouse.click(195, 330)
    await page.waitForTimeout(500)
  }
}
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` })
const step = (msg) => console.log(`• ${msg}`)

const A = await ctxA.newPage()
watch(A, 'câmera')
await A.goto(BASE)
await shot(A, '01-boas-vindas')
step('Câmera: criando família')
await A.getByRole('button', { name: 'Configurar o primeiro aparelho' }).click()
await A.locator('input').first().fill('Quarto do bebê')
await shot(A, '02-configurar')
await A.getByRole('button', { name: 'Criar chave e continuar' }).click()
await A.getByText('Parear aparelho').waitFor()
await A.waitForTimeout(400)
await shot(A, '03-parear-qr')
const secret = await A.evaluate(() => JSON.parse(localStorage.getItem('ninar.vault.v1')).secret)
const link = `${BASE}/#p=${secret}`

const B = await ctxB.newPage()
watch(B, 'monitor')
if (MODE === 'relay') {
  step('Monitor: pareando pelo link')
  await B.goto(link)
  await B.locator('input').first().fill('iPhone da mamãe')
  await shot(B, '04-pareamento-recebido')
  await B.getByRole('button', { name: 'Concluir pareamento' }).click()
} else {
  await B.goto(BASE)
}
await B.getByText('Como este aparelho será usado?').waitFor()

step('Câmera: iniciando')
await A.getByRole('button', { name: 'Pronto' }).click()
await A.getByText('Como este aparelho será usado?').waitFor()
await shot(A, '05-inicio')
await A.getByText('Câmera do bebê').click()
await shot(A, '06-preparar-camera')
await A.getByRole('button', { name: 'Iniciar câmera' }).click()
await A.getByText('Aguardando monitor…').first().waitFor({ timeout: 15000 })

step('Monitor: conectando')
await B.getByText('Câmera do bebê', { exact: false }).first().waitFor({ timeout: 30000 }).catch(() => {})
await shot(B, '07-inicio-monitor')
await B.getByText('Monitor dos pais').click()
await B.getByRole('button', { name: 'Conectar à câmera' }).click()
const t0 = Date.now()
await B.getByText('Ao vivo').waitFor({ timeout: 60000 })
step(`Ao vivo em ${((Date.now() - t0) / 1000).toFixed(1)}s`)
await B.waitForFunction(() => {
  const v = document.querySelector('video')
  return v && v.videoWidth > 0 && v.currentTime > 0.5
}, null, { timeout: 20000 })
const dims = await B.evaluate(() => {
  const v = document.querySelector('video')
  return `${v.videoWidth}x${v.videoHeight}`
})
step(`Vídeo recebido: ${dims}`)
await A.getByText('1 monitor assistindo').waitFor({ timeout: 15000 })
await B.waitForTimeout(2500)
await shot(B, '08-monitor-ao-vivo')
await shot(A, '09-camera-transmitindo')

step('Monitor → câmera: tocar chuva')
await showChrome(B)
await B.getByRole('button', { name: 'Sons' }).click()
await B.getByRole('button', { name: /^Chuva/ }).click()
await A.getByRole('button', { name: /Chuva/ }).first().waitFor({ timeout: 10000 })
await B.waitForTimeout(1200)
await shot(B, '10-sons')
await B.keyboard.press('Escape')

step('Visão noturna')
await showChrome(B)
await B.getByRole('button', { name: 'Noturna' }).click()
await B.getByRole('radio', { name: 'Sempre' }).click()
await B.keyboard.press('Escape')
await B.waitForTimeout(1500)
const lit = await B.evaluate(() => {
  const c = document.querySelector('canvas')
  if (!c || !c.width || c.classList.contains('hidden')) return 'sem-canvas'
  const t = document.createElement('canvas')
  t.width = 32
  t.height = 32
  const ctx = t.getContext('2d')
  ctx.drawImage(c, 0, 0, 32, 32)
  const d = ctx.getImageData(0, 0, 32, 32).data
  let g = 0
  for (let i = 0; i < d.length; i += 4) g += d[i + 1]
  return (g / (d.length / 4)).toFixed(1)
})
step(`Canvas da visão noturna (média verde): ${lit}`)
await shot(B, '11-visao-noturna')

step('Falar com o bebê')
await showChrome(B)
const mic = B.getByRole('button', { name: 'Segure para falar' })
const box = await mic.boundingBox()
await B.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await B.mouse.down()
await A.getByText(/falando/).waitFor({ timeout: 10000 })
await shot(A, '12-camera-pai-falando')
await B.mouse.up()

step('Códigos de segurança')
await showChrome(B)
await B.getByRole('button', { name: 'E2E' }).click()
await B.getByText('Código de segurança').waitFor()
await B.waitForTimeout(300)
await shot(B, '13-codigo-seguranca')
const codeB = await B.locator('.font-mono').first().textContent()
await B.keyboard.press('Escape')
await A.mouse.click(195, 400)
await A.getByRole('button', { name: /E2E/ }).click()
const codeA = await A.locator('.font-mono').first().textContent()
step(`Código câmera=${codeA} monitor=${codeB} → ${codeA === codeB ? 'IGUAIS ✔' : 'DIFERENTES ✘'}`)
await A.keyboard.press('Escape')

step('Trocar câmera (flip) e qualidade')
await showChrome(B)
await B.getByRole('button', { name: 'Mais' }).click()
await shot(B, '14-mais-controles')
await B.getByRole('radio', { name: '360p' }).click()
await B.waitForTimeout(800)
await B.keyboard.press('Escape')

step('Reconexão: câmera recarrega a página')
await A.reload()
await A.getByText('Câmera do bebê').click()
await A.getByRole('button', { name: 'Iniciar câmera' }).click()
const t1 = Date.now()
await B.getByText('Ao vivo').waitFor({ timeout: 60000 })
await A.getByText('1 monitor assistindo').waitFor({ timeout: 60000 })
step(`Reconectou em ${((Date.now() - t1) / 1000).toFixed(1)}s`)

const events = await B.evaluate(() => JSON.parse(localStorage.getItem('ninar.events.v1') || '[]').map((e) => e.kind))
step(`Eventos registrados no monitor: ${events.join(', ') || '(nenhum)'}`)

await B.goto(BASE)
await B.getByText('Histórico').click()
await B.waitForTimeout(400)
await shot(B, '15-historico')
await B.goto(BASE)
await B.getByRole('button', { name: 'Configurações' }).click()
await B.waitForTimeout(400)
await shot(B, '16-configuracoes')

console.log(errors.length ? `\nErros:\n${errors.join('\n')}` : '\nSem erros no console.')
await browser.close()
process.exit(codeA === codeB ? 0 : 1)
