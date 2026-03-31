import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase environment variables not configured. Using offline mode.');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);

export let isSupabaseConnected = false;

export async function checkSupabaseConnection(): Promise<boolean> {
  if (!supabaseUrl || !supabaseAnonKey) return false;
  try {
    const { error } = await supabase.from('_health_check_dummy').select('count').limit(0).single();
    isSupabaseConnected = !error || error.code === 'PGRST116' || error.code === '42P01';
    return isSupabaseConnected;
  } catch {
    isSupabaseConnected = false;
    return false;
  }
}

// Auto-check connection on load
checkSupabaseConnection();
