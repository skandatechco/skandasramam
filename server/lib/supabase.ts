import "dotenv/config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Service-role Supabase client. SERVER ONLY: it bypasses Row Level Security.
 * Never import this from anything under client/ and never send its key to the browser.
 */
export function getServiceClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.",
    );
  }
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

/**
 * Client that acts AS the signed-in administrator: anon key + the caller's own
 * JWT. Queries run under the `authenticated` role, so Row Level Security,
 * is_admin() and column grants are what actually authorise each operation.
 * The service-role key is deliberately NOT used by any /api/admin route.
 */
export function getUserClient(jwt: string): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Admin API is not configured: set SUPABASE_URL and SUPABASE_ANON_KEY on the server.",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}
