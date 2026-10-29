// Gera vercel.json a partir de security-headers.ts (fonte única dos cabeçalhos).
import { writeFileSync } from 'node:fs'
import { securityHeaders } from '../security-headers.ts'

const toList = (obj) => Object.entries(obj).map(([key, value]) => ({ key, value }))
const config = {
  $schema: 'https://openapi.vercel.sh/vercel.json',
  framework: 'vite',
  buildCommand: 'npm run build',
  outputDirectory: 'dist',
  cleanUrls: true,
  headers: [
    { source: '/(.*)', headers: toList(securityHeaders) },
    { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }, { key: 'Service-Worker-Allowed', value: '/' }] },
    { source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    { source: '/manifest.webmanifest', headers: [{ key: 'Content-Type', value: 'application/manifest+json' }] },
  ],
}
writeFileSync(new URL('../vercel.json', import.meta.url), JSON.stringify(config, null, 2) + '\n')
console.log('vercel.json atualizado')
