// Classificador de sons com IA (YAMNet / AudioSet, via MediaPipe), rodando 100% no aparelho.
// Nenhum áudio sai do celular: o modelo é baixado uma vez e executa localmente em WebAssembly.

const MEDIAPIPE_VERSION = '0.10.21'
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@${MEDIAPIPE_VERSION}/wasm`
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite'

/** Classes do AudioSet consideradas choro. */
const CRY_CLASSES = ['Baby cry, infant cry', 'Crying, sobbing', 'Whimper', 'Wail, moan']
const OTHER_CLASSES = ['Speech', 'Music', 'Laughter', 'Baby laughter', 'Silence', 'Television', 'Dog', 'Cough']

const LABEL_PT: Record<string, string> = {
  'Baby cry, infant cry': 'choro de bebê',
  'Crying, sobbing': 'choro',
  Whimper: 'resmungo',
  'Wail, moan': 'gemido',
  Speech: 'fala',
  Music: 'música',
  Laughter: 'risada',
  'Baby laughter': 'risada de bebê',
  Silence: 'silêncio',
  Television: 'TV',
  Dog: 'cachorro',
  Cough: 'tosse',
}

export const labelPt = (name: string) => LABEL_PT[name] ?? name

export interface AiResult {
  cry: number
  top: string
}

export interface AiClassifier {
  classify(samples: Float32Array, sampleRate: number): AiResult
  close(): void
}

let loading: Promise<AiClassifier> | null = null

export function loadAiClassifier(): Promise<AiClassifier> {
  if (!loading) {
    loading = create()
    loading.catch(() => (loading = null))
  }
  return loading
}

async function create(): Promise<AiClassifier> {
  const { AudioClassifier, FilesetResolver } = await import('@mediapipe/tasks-audio')
  const fileset = await FilesetResolver.forAudioTasks(WASM_BASE)
  const classifier = await AudioClassifier.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL },
    categoryAllowlist: [...CRY_CLASSES, ...OTHER_CLASSES],
    maxResults: -1,
  })
  return {
    classify(samples, sampleRate) {
      const results = classifier.classify(samples, sampleRate)
      let cry = 0
      let top = ''
      let topScore = 0
      for (const r of results) {
        for (const c of r.classifications[0]?.categories ?? []) {
          if (CRY_CLASSES.includes(c.categoryName)) cry = Math.max(cry, c.score)
          if (c.score > topScore) {
            topScore = c.score
            top = c.categoryName
          }
        }
      }
      return { cry, top }
    },
    close() {
      classifier.close()
      loading = null
    },
  }
}
