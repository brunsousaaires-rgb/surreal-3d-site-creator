import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

// Publishable/anon values — safe to expose client-side (access is enforced by RLS).
// Env vars override these when set (e.g. in Vercel project settings).
const FALLBACK_URL = 'https://obhamuywujieknrcstmh.supabase.co'
const FALLBACK_KEY = 'sb_publishable_kZQR3Hag8HN8WpbmPxEKfA_g1KtcA5f'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || FALLBACK_URL
const supabaseKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string) || FALLBACK_KEY

export const supabase = createClient<Database>(supabaseUrl, supabaseKey)
