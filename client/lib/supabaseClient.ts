import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client, used ONLY for administrator sign-in/session handling.
 * It carries the public URL and the public ANON key. The service-role key never
 * appears in browser code. All admin data goes through /api/admin/*, which
 * re-verifies the session and admin rights on every request.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const authConfigured = Boolean(url && key);

export const supabase: SupabaseClient | null = authConfigured
  ? createClient(url!, key!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;
