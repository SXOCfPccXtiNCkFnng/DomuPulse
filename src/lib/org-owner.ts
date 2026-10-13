import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** Nome e e-mail do administrador da organização, para os avisos de cobrança. */
export async function orgOwnerContact(orgId: string): Promise<{ email: string; fullName: string } | null> {
  const admin = createAdminClient();
  const { data: owner } = await admin
    .from("members")
    .select("user_id, full_name")
    .eq("org_id", orgId)
    .eq("role", "owner")
    .eq("active", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!owner) return null;
  const { data } = await admin.auth.admin.getUserById(owner.user_id);
  const email = data.user?.email;
  return email ? { email, fullName: owner.full_name } : null;
}
