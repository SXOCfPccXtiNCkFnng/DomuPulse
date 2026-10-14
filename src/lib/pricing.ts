import "server-only";
import { DEFAULT_MONTHLY_PRICE_CENTS } from "@/lib/plans";
import { createAdminClient } from "@/lib/supabase/admin";

/** Valor mensal vigente para novas assinaturas, em centavos. */
export async function getMonthlyPriceCents() {
  const { data } = await createAdminClient().from("platform_settings").select("monthly_price_cents").maybeSingle();
  return data?.monthly_price_cents ?? DEFAULT_MONTHLY_PRICE_CENTS;
}
