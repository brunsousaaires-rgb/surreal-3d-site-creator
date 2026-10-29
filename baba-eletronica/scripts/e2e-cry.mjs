// Testa a detecção de choro e a IA com um áudio injetado como microfone falso.
//   FAKE_AUDIO=/caminho/choro.wav node scripts/e2e-cry.mjs
//   EXPECT=none FAKE_AUDIO=/caminho/silencio.wav node scripts/e2e-cry.mjs  (não deve alertar)
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'

const { chromium } = createRequire(import.meta.url)('playwright')
const BASE = process.env.BASE ?? 'http://localhost:4173'
const OUT = process.env.OUT ?? 'test-results'
const EXPECT = process.env.EXPECT ?? 'cry'
const AI = process.env.AI === '1'
mkdirSync(OUT, { recursive: true })

const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined
const browser = await chromium.launch({
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${process.env.FAKE_AUDIO}`,
    '--autoplay-policy=no-user-gesture-required',
  ],
  proxy,
})
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 }, permissions: ['camera', 'microphone'] })
const errors = []
const A = await ctx.newPage()
A.on('console', (m) => m.type() === 'error' && !m.text().includes('WebSocket') && errors.push(`[câmera] ${m.text()}`))
A.on('pageerror', (e) => errors.push(`[câmera] ${e.message}`))
await A.goto(BASE)
await A.getByRole('button', { name: 'Configurar o primeiro aparelho' }).click()
await A.getByRole('button', { name: 'Criar chave e continuar' }).click()
await A.getByRole('button', { name: 'Pronto' }).click()

if (AI) {
  // Liga a IA antes de iniciar a câmera.
  await A.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('ninar.settings.v1') || '{}')
    s.detection = { ...(s.detection || {}), ai: true }
    localStorage.setItem('ninar.settings.v1', JSON.stringify(s))
  })
  await A.reload()
}
await A.getByText('Câmera do bebê').click()
await A.getByRole('button', { name: 'Iniciar câmera' }).click()

const B = await ctx.newPage()
B.on('pageerror', (e) => errors.push(`[monitor] ${e.message}`))
await B.goto(BASE)
await B.getByText('Monitor dos pais').click()
await B.getByRole('button', { name: 'Conectar à câmera' }).click()
await B.getByText('Ao vivo').waitFor({ timeout: 30000 })
const t0 = Date.now()
console.log('• Monitor ao vivo; aguardando detecção…')

if (AI) {
  await A.mouse.click(195, 400)
  await A.getByRole('button', { name: 'Sensores' }).click()
  await A.getByText('Ativa no aparelho da câmera').waitFor({ timeout: 90000 })
  console.log(`• IA carregada em ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  await A.waitForTimeout(6000)
  const label = await A.getByText(/Último som reconhecido/).textContent().catch(() => '(nenhum)')
  console.log(`• ${label}`)
  await A.screenshot({ path: `${OUT}/ia-sensores.png` })
  await A.keyboard.press('Escape')
}

let detected = false
try {
  await B.getByText('Bebê chorando').waitFor({ timeout: EXPECT === 'cry' ? 45000 : 25000 })
  detected = true
  console.log(`• Alerta de choro no monitor após ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  await B.screenshot({ path: `${OUT}/alerta-choro.png` })
} catch {
  console.log('• Nenhum alerta de choro')
}
const events = await B.evaluate(() => JSON.parse(localStorage.getItem('ninar.events.v1') || '[]').map((e) => `${e.kind}${e.detail ? `(${e.detail})` : ''}`))
console.log(`• Eventos: ${events.join(', ') || '(nenhum)'}`)
console.log(errors.length ? `Erros:\n${errors.join('\n')}` : 'Sem erros.')
await browser.close()
const ok = EXPECT === 'cry' ? detected : !detected
console.log(ok ? 'RESULTADO: OK ✔' : 'RESULTADO: FALHOU ✘')
process.exit(ok ? 0 : 1)
