import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { contentSecurityPolicy, securityHeaders } from './security-headers.ts'

/**
 * Embute a CSP no HTML de produção. Hospedagens sem cabeçalhos próprios
 * (GitHub Pages) ficam com a mesma política; na Vercel ela também vem por cabeçalho.
 * `frame-ancestors` não vale em <meta>, por isso fica só no cabeçalho.
 */
function cspMeta(): Plugin {
  const policy = contentSecurityPolicy
    .split('; ')
    .filter((d) => !d.startsWith('frame-ancestors'))
    .join('; ')
  return {
    name: 'ninar-csp-meta',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' },
    ],
  }
}

// https://vite.dev/config/
export default defineConfig({
  // BASE_PATH=/repo/ para publicar num subcaminho (ex.: GitHub Pages).
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), tailwindcss(), cspMeta()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  define: {
    __APP_BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
  },
  server: { host: true },
  // Mesmos cabeçalhos da produção (vercel.json) para testar CSP localmente.
  preview: { host: true, headers: securityHeaders },
})
