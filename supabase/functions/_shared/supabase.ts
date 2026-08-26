// Shared Supabase clients for Edge Functions (Deno)
// Uses service_role for privileged operations, anon for user-scoped
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0?target=deno";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in Edge Function env");
}

export function getServiceClient() {
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function getUserClient(authHeader: string | null) {
  const token = authHeader?.replace("Bearer ", "");
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function getUserFromRequest(req: Request) {
  const authHeader = req.headers.get("Authorization");
  const client = getUserClient(authHeader);
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return null;
  return user;
}

// Helper to check journal role
export async function hasJournalRole(
  supabase: ReturnType<typeof getServiceClient>,
  userId: string,
  journalId: string,
  roles: string[],
): Promise<boolean> {
  const { data } = await supabase
    .from("journal_members")
    .select("role")
    .eq("journal_id", journalId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .in("role", roles as never)
    .limit(1);
  return (data?.length ?? 0) > 0;
}
