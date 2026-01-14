
import { createClient } from '@supabase/supabase-js';

// Supabase Connection Details from environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

// Public Key for Browser usage from environment variables
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
