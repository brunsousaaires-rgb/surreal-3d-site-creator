# Ninar · Babá eletrônica privada

App web (PWA) de babá eletrônica para uso pessoal: dois celulares — um fica no quarto como **câmera**, o outro com você como **monitor**. Funciona em **iPhone e Android, em qualquer combinação e em qualquer papel**, direto pelo navegador (Safari/Chrome) ou instalado na tela inicial.

## Funcionalidades

| | |
|---|---|
| **Vídeo e áudio ao vivo** | WebRTC P2P, H.264 por hardware quando disponível, qualidade 360p / 720p / 1080p |
| **Criptografia de ponta a ponta** | DTLS-SRTP na mídia + AES-256-GCM na sinalização, chave de 256 bits que só existe nos seus aparelhos |
| **Detecção de choro** | Análise acústica em tempo real (ruído de fundo adaptativo, subtração espectral, frequência fundamental por autocorrelação) + IA opcional (YAMNet/AudioSet) rodando no próprio aparelho |
| **Sensor de movimento e de barulho** | Diferença de quadros com compensação de iluminação; alerta de som alto |
| **Visão noturna** | WebGL: ganho automático, curva gama, redução de ruído temporal adaptativa ao movimento, nitidez — estilos infravermelho, P&B e cor. A câmera também reduz o FPS para aumentar a exposição |
| **Câmera frontal ou traseira** | Troca a qualquer momento, na câmera ou remotamente pelo monitor; lanterna (Android) |
| **Sons para ninar** | Chuva, ondas do mar, útero (batimentos), “shhh”, ruído branco/rosa/marrom, ventilador, Brahms, Brilha brilha estrelinha e caixinha de música generativa — todos sintetizados (funcionam offline), com timer e desligamento gradual |
| **Falar com o bebê** | Push-to-talk do monitor para a câmera, abaixando o som de ninar durante a fala |
| **Acalmar automaticamente** | Ao detectar choro, toca o som escolhido por N minutos |
| **Alertas** | Alarme sonoro (toca até no modo silencioso do iOS 17+), vibração e notificação (Android), alarme de conexão perdida e de bateria baixa da câmera |
| **Vários monitores** | Até 4 monitores na mesma câmera (pai e mãe ao mesmo tempo) |
| **Extras** | Foto e gravação de clipes, zoom com pinça, tela escura, histórico com resumo da noite, código de segurança estilo Signal, bloqueio por PIN |

## Segurança

- **Chave da família:** 256 bits gerados no aparelho (`crypto.getRandomValues`). Só sai dele por QR code/link de pareamento — no link a chave vai no fragmento `#`, que navegadores nunca enviam ao servidor.
- **Sinalização:** da chave derivamos via HKDF-SHA256 um identificador de sala (público, irreversível) e a chave AES-256-GCM. Toda mensagem (ofertas SDP, candidatos ICE, presença) é cifrada e autenticada, com proteção contra replay. Os relés públicos (4 brokers MQTT + 3 relés Nostr, em paralelo para redundância) só veem bytes aleatórios.
- **Mídia:** WebRTC com DTLS-SRTP direto entre os aparelhos. Como o SDP — que carrega a impressão digital do certificado DTLS — só trafega autenticado pela chave da família, nenhum relé consegue se colocar no meio. O **código de segurança** (emojis + dígitos derivados das duas impressões DTLS) permite conferir isso visualmente.
- **Em repouso:** com PIN ativado, a chave fica cifrada com AES-256-GCM sob PBKDF2-SHA256 (600 mil iterações), com espera progressiva após tentativas erradas.
- **Servidor:** o site é estático. Nenhum vídeo, áudio ou evento passa por servidor ou é armazenado fora dos aparelhos. CSP restritiva, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, HSTS.

## Arquitetura

```
 Câmera (celular A)                                   Monitor (celular B)
 ┌─────────────────────────┐   mídia P2P DTLS-SRTP    ┌─────────────────────────┐
 │ getUserMedia            │ ═══════════════════════► │ <video> + WebGL noturno │
 │ CryDetector (+ YAMNet)  │   canal de dados (cmd,   │ AlertCenter / alarmes   │
 │ FrameAnalyzer           │ ◄═════ status, eventos) ═│ push-to-talk            │
 │ SoundPlayer             │                          │                         │
 └───────────┬─────────────┘                          └────────────┬────────────┘
             │      sinalização cifrada (AES-256-GCM, HKDF)        │
             └──────► relés MQTT + Nostr públicos (redundantes) ◄──┘
```

- `src/lib/crypto.ts`, `vault.ts` — chave, derivação, envelope AEAD, PIN, código de segurança
- `src/lib/signaling/` — cliente MQTT 3.1.1 mínimo, cliente Nostr, relé local entre abas, hub com deduplicação
- `src/lib/rtc/` — sessões da câmera (multi-monitor, reconexão por ICE restart) e do monitor (watchdog, estatísticas)
- `src/lib/audio/` — detector de choro, classificador IA, sons procedurais, alarmes
- `src/lib/video/` — visão noturna WebGL, movimento/luminosidade, foto e gravação

## Desenvolvimento

```bash
npm install
npm run dev        # http://localhost:5173 (localhost permite câmera sem HTTPS)
npm run build
npm run lint
```

Para testar no celular durante o desenvolvimento é preciso HTTPS (exigência de câmera/microfone dos navegadores) — use o deploy de preview.

### Testes ponta a ponta (Chromium com câmera/microfone falsos)

```bash
npm run build && npx vite preview --port 4173 &
node scripts/e2e.mjs                         # duas abas, relé local
MODE=relay node scripts/e2e.mjs              # dois navegadores isolados, relés públicos
MODE=relay RELAYS=mqtt node scripts/e2e.mjs  # só MQTT (ou RELAYS=nostr)
FAKE_AUDIO=choro.wav node scripts/e2e-cry.mjs              # detecção de choro
EXPECT=none FAKE_AUDIO=silencio.wav node scripts/e2e-cry.mjs
```

### Scripts auxiliares

- `node scripts/render-icons.mjs` — gera os PNGs a partir de `public/icons/icon.svg`
- `node scripts/sync-headers.mjs` — gera `vercel.json` a partir de `security-headers.ts`

## Deploy

**GitHub Pages (automático):** o workflow `.github/workflows/ninar-pages.yml` compila com `BASE_PATH=/<repositório>/` e publica na branch `gh-pages` a cada push na `main` que altere `baba-eletronica/`. Endereço: `https://<usuário>.github.io/<repositório>/`. Como o Pages não permite cabeçalhos próprios, a CSP vai embutida no HTML.

**Vercel (alternativa):** projeto com **Root Directory = `baba-eletronica`** (framework Vite); `vercel.json` adiciona os cabeçalhos de segurança. Não precisa de variáveis de ambiente nem de backend.

## Limitações (honestas)

- **App aberto:** navegadores pausam câmera/microfone se o app for minimizado ou a tela bloquear. A câmera escurece a tela sozinha; no iPhone, desative o bloqueio automático durante o uso.
- **Notificações em segundo plano** funcionam no Android; no iPhone os alertas tocam com o app aberto.
- **Visão noturna é digital:** celulares não têm iluminação infravermelha. Uma luz noturna bem fraca melhora muito o resultado.
- **Redes restritivas:** algumas operadoras móveis bloqueiam conexão direta. Cadastre um servidor TURN em Configurações → Rede (o conteúdo continua cifrado).
- **Não é dispositivo médico** e não substitui a supervisão de um adulto.
