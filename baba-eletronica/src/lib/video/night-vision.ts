// Visão noturna digital em WebGL (roda no monitor).
//
// • Ganho automático + curva gama: realça cenas escuras sem estourar as claras.
// • Redução de ruído temporal adaptativa ao movimento: acumula quadros quando a cena
//   está parada (limpa o "chuvisco" típico do escuro) e reage na hora quando há movimento.
// • Nitidez (unsharp mask), vinheta e estilos: verde (infravermelho), P&B ou cor realçada.
import type { NightStyle } from '../types'

const VS = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = (aPos + 1.0) * 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

const FS_ACC = `
precision mediump float;
uniform sampler2D uVideo;
uniform sampler2D uPrev;
uniform float uGain;
uniform float uGamma;
uniform float uAlpha;
uniform float uFirst;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 v = vec2(vUv.x, 1.0 - vUv.y);
  vec3 c = texture2D(uVideo, v).rgb;
  vec3 n = texture2D(uVideo, v + vec2(uTexel.x, 0.0)).rgb + texture2D(uVideo, v - vec2(uTexel.x, 0.0)).rgb
         + texture2D(uVideo, v + vec2(0.0, uTexel.y)).rgb + texture2D(uVideo, v - vec2(0.0, uTexel.y)).rgb;
  c = mix(c, n * 0.25, 0.45);
  vec3 e = pow(clamp(c * uGain, 0.0, 1.0), vec3(1.0 / uGamma));
  vec3 p = texture2D(uPrev, vUv).rgb;
  float d = distance(e, p);
  float a = uFirst > 0.5 ? 1.0 : mix(uAlpha, 1.0, smoothstep(0.05, 0.2, d));
  gl_FragColor = vec4(mix(p, e, a), 1.0);
}`

const FS_OUT = `
precision mediump float;
uniform sampler2D uAcc;
uniform float uMode;
uniform float uSharp;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(uAcc, vUv).rgb;
  vec3 b = (texture2D(uAcc, vUv + vec2(uTexel.x, 0.0)).rgb + texture2D(uAcc, vUv - vec2(uTexel.x, 0.0)).rgb
          + texture2D(uAcc, vUv + vec2(0.0, uTexel.y)).rgb + texture2D(uAcc, vUv - vec2(0.0, uTexel.y)).rgb) * 0.25;
  c = clamp(c + (c - b) * uSharp, 0.0, 1.0);
  float y = dot(c, vec3(0.299, 0.587, 0.114));
  vec3 o;
  if (uMode > 1.5) o = vec3(0.2, 1.0, 0.45) * pow(y, 0.92) + vec3(0.0, 0.035, 0.012);
  else if (uMode > 0.5) o = vec3(y);
  else o = clamp(mix(vec3(y), c, 1.25), 0.0, 1.0);
  vec2 q = vUv - 0.5;
  float vig = 1.0 - dot(q, q) * 0.85;
  gl_FragColor = vec4(o * vig, 1.0);
}`

interface Target {
  tex: WebGLTexture
  fb: WebGLFramebuffer
}

export class NightVision {
  readonly supported: boolean
  gain = 1
  luma = 0.5
  private canvas: HTMLCanvasElement
  private gl: WebGLRenderingContext | null
  private progAcc: WebGLProgram | null = null
  private progOut: WebGLProgram | null = null
  private videoTex: WebGLTexture | null = null
  private targets: Target[] = []
  private ping = 0
  private first = true
  private video: HTMLVideoElement | null = null
  private running = false
  private style: NightStyle = 'green'
  private raf = 0
  private vfc = 0
  private sampler = document.createElement('canvas')
  private sctx: CanvasRenderingContext2D | null
  private meterTimer: ReturnType<typeof setInterval> | undefined
  private w = 0
  private h = 0

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.sampler.width = 24
    this.sampler.height = 18
    this.sctx = this.sampler.getContext('2d', { willReadFrequently: true })
    let gl: WebGLRenderingContext | null = null
    try {
      gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false }) as WebGLRenderingContext | null
    } catch {
      gl = null
    }
    this.gl = gl
    this.supported = !!gl && this.init()
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      this.stop()
    })
  }

  private init(): boolean {
    const gl = this.gl!
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader')
      return s
    }
    const link = (fs: string) => {
      const p = gl.createProgram()!
      gl.attachShader(p, compile(gl.VERTEX_SHADER, VS))
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs))
      gl.bindAttribLocation(p, 0, 'aPos')
      gl.linkProgram(p)
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link')
      return p
    }
    try {
      this.progAcc = link(FS_ACC)
      this.progOut = link(FS_OUT)
    } catch (e) {
      console.warn('[visão noturna] WebGL indisponível', e)
      return false
    }
    const quad = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, quad)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    this.videoTex = this.texture()
    return true
  }

  private texture() {
    const gl = this.gl!
    const t = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return t
  }

  private resize(w: number, h: number) {
    const gl = this.gl!
    for (const t of this.targets) {
      gl.deleteTexture(t.tex)
      gl.deleteFramebuffer(t.fb)
    }
    this.targets = [0, 1].map(() => {
      const tex = this.texture()
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      const fb = gl.createFramebuffer()!
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
      return { tex, fb }
    })
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    this.canvas.width = w
    this.canvas.height = h
    this.w = w
    this.h = h
    this.first = true
  }

  setStyle(style: NightStyle) {
    this.style = style
  }

  start(video: HTMLVideoElement) {
    this.video = video
    if (!this.supported || this.running) return
    this.running = true
    this.first = true
    this.loop()
    this.meterTimer = setInterval(() => this.meter(), 400)
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.raf)
    const v = this.video as (HTMLVideoElement & { cancelVideoFrameCallback?: (h: number) => void }) | null
    if (this.vfc && v?.cancelVideoFrameCallback) v.cancelVideoFrameCallback(this.vfc)
    clearInterval(this.meterTimer)
  }

  /** Mede o brilho médio da imagem original para o ganho automático. */
  private meter() {
    const v = this.video
    if (!v || !this.sctx || v.readyState < 2) return
    try {
      this.sctx.drawImage(v, 0, 0, 24, 18)
      const d = this.sctx.getImageData(0, 0, 24, 18).data
      let s = 0
      for (let i = 0; i < d.length; i += 4) s += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114
      this.luma = s / (d.length / 4) / 255
    } catch {
      return
    }
    const target = Math.min(10, Math.max(1, 0.42 / Math.max(this.luma, 0.012)))
    this.gain += (target - this.gain) * 0.35
  }

  private loop = () => {
    if (!this.running) return
    this.draw()
    const v = this.video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }
    if (v?.requestVideoFrameCallback) this.vfc = v.requestVideoFrameCallback(this.loop)
    else this.raf = requestAnimationFrame(this.loop)
  }

  private draw() {
    const gl = this.gl
    const v = this.video
    if (!gl || !v || v.readyState < 2 || !v.videoWidth) return
    const scale = Math.min(1, 1280 / v.videoWidth)
    const w = Math.round(v.videoWidth * scale)
    const h = Math.round(v.videoHeight * scale)
    if (w !== this.w || h !== this.h) this.resize(w, h)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.videoTex)
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, v)
    } catch {
      return
    }
    const src = this.targets[this.ping]
    const dst = this.targets[1 - this.ping]
    const darkness = Math.min(1, (this.gain - 1) / 6)

    // Passo 1: realce + acúmulo temporal → dst
    gl.useProgram(this.progAcc)
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb)
    gl.viewport(0, 0, w, h)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, src.tex)
    const pa = this.progAcc!
    gl.uniform1i(gl.getUniformLocation(pa, 'uVideo'), 0)
    gl.uniform1i(gl.getUniformLocation(pa, 'uPrev'), 1)
    gl.uniform1f(gl.getUniformLocation(pa, 'uGain'), this.style === 'color' ? Math.min(this.gain, 5) : this.gain)
    gl.uniform1f(gl.getUniformLocation(pa, 'uGamma'), 1 + 0.9 * darkness)
    gl.uniform1f(gl.getUniformLocation(pa, 'uAlpha'), 0.55 - 0.35 * darkness)
    gl.uniform1f(gl.getUniformLocation(pa, 'uFirst'), this.first ? 1 : 0)
    gl.uniform2f(gl.getUniformLocation(pa, 'uTexel'), 1 / v.videoWidth, 1 / v.videoHeight)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    this.first = false

    // Passo 2: estilo + nitidez → tela
    gl.useProgram(this.progOut)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, w, h)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, dst.tex)
    const po = this.progOut!
    gl.uniform1i(gl.getUniformLocation(po, 'uAcc'), 0)
    gl.uniform1f(gl.getUniformLocation(po, 'uMode'), this.style === 'green' ? 2 : this.style === 'mono' ? 1 : 0)
    gl.uniform1f(gl.getUniformLocation(po, 'uSharp'), 0.35 + 0.25 * (1 - darkness))
    gl.uniform2f(gl.getUniformLocation(po, 'uTexel'), 1 / w, 1 / h)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    this.ping = 1 - this.ping
  }
}

/** Alternativa sem WebGL: filtros CSS no próprio <video>. */
export function cssNightFilter(style: NightStyle, gain: number): string {
  const b = Math.min(4, Math.max(1, gain * 0.7)).toFixed(2)
  if (style === 'green') return `grayscale(1) brightness(${b}) contrast(1.25) sepia(1) hue-rotate(65deg) saturate(3.2)`
  if (style === 'mono') return `grayscale(1) brightness(${b}) contrast(1.2)`
  return `brightness(${b}) contrast(1.15) saturate(1.2)`
}
