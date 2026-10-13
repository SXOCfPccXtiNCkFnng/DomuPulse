import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { supabaseSecretKey } from "@/lib/env.server";

// Ignora o RLS. Use apenas depois de verificar a permissão de quem chamou,
// e somente em Server Actions, Route Handlers ou tarefas agendadas.
export function createAdminClient() {
  return createClient(publicEnv().supabaseUrl, supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
