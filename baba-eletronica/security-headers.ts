// Fonte única dos cabeçalhos de segurança. Mantenha em sincronia com vercel.json
// (rode `node scripts/sync-headers.mjs` depois de alterar).
export const contentSecurityPolicy = [
  "default-src 'self'",
  // MediaPipe (IA de choro) carrega o loader WASM do jsDelivr.
  "script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: mediastream: data:",
  "font-src 'self'",
  // Sinalização: relés MQTT/Nostr via WebSocket seguro. Modelo de IA: Google Storage.
  "connect-src 'self' wss: https://cdn.jsdelivr.net https://storage.googleapis.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ')

export const securityHeaders: Record<string, string> = {
  'Content-Security-Policy': contentSecurityPolicy,
  'Permissions-Policy': 'camera=(self), microphone=(self), screen-wake-lock=(self), fullscreen=(self), geolocation=(), payment=(), usb=()',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
}
