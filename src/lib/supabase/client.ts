import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

export function getBrowserClient() {
  const { supabaseUrl, supabaseKey } = publicEnv();
  return createBrowserClient(supabaseUrl, supabaseKey);
}
