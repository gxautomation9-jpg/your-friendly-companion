// Server-only helper: verify a Supabase user bearer token from an incoming Request.
// Returns the user id on success, or null if the token is missing/invalid.
import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/server-env";

export async function verifySupabaseUser(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const url = getServerEnv("SUPABASE_URL");
  const key = getServerEnv("SUPABASE_PUBLISHABLE_KEY");
  if (!url || !key) return null;

  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    });
    const { data, error } = await supabase.auth.getClaims(token);
    if (error || !data?.claims?.sub) return null;
    return data.claims.sub as string;
  } catch {
    return null;
  }
}
