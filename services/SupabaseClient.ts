
import { createClient } from '@supabase/supabase-js';

// Supabase Connection Details
const supabaseUrl = 'https://mjsqomffhxfhfmmklfyl.supabase.co';

// Public Key for Browser usage
const supabaseAnonKey = 'sb_publishable_OrFsiS2aWDAp3LIDO6huYg_k9X0qJy9';

// Service Role Key (Only available in Node.js environment)
const serviceRoleKey = typeof process !== 'undefined' ? process.env.SUPABASE_SERVICE_ROLE_KEY : null;

/**
 * Standard client for frontend operations.
 * Configuration: persistSession enabled to maintain user sessions across refreshes.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
});

/**
 * Admin client for sensitive backend operations.
 * Returns standard client if serviceRoleKey is missing (e.g., in browser).
 */
export const supabaseAdmin = serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  : supabase;
