import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { CLOUD_CONFIGURED, SUPABASE_ANON_KEY, SUPABASE_URL } from './config'

export const supabase: SupabaseClient | null = CLOUD_CONFIGURED ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } }) : null
