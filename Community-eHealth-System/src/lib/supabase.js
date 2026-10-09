import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
const hasSupabaseUrl = Boolean(supabaseUrl)
const hasSupabaseAnonKey = Boolean(supabaseAnonKey)

export const supabaseConfigured = hasSupabaseUrl && hasSupabaseAnonKey
export const supabaseConfigurationError = !hasSupabaseUrl || !hasSupabaseAnonKey
  ? 'Set both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local, then restart the dev server.'
  : ''

export const supabase = supabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null
