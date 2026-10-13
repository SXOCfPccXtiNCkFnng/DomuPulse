import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/roles";
import { normalizeSlot } from "@/lib/time";

export { ROLE_LABEL, ROLE_RANK, type Role } from "@/lib/roles";

export type OrgStatus = "trialing" | "active" | "past_due" | "canceled";

export type CurrentMember = {
  id: string;
  userId: string;
  fullName: string;
  role: Role;
  teamId: string | null;
  divisionId: string | null;
  org: {
    id: string;
    name: string;
    timezone: string;
    reportSlots: string[];
    status: OrgStatus;
    trialEndsAt: string;
  };
};

type MemberRow = {
  id: string;
  user_id: string;
  full_name: string;
  role: Role;
  team_id: string | null;
  division_id: string | null;
  organizations: {
    id: string;
    name: string;
    timezone: string;
    report_slots: string[];
    status: OrgStatus;
    trial_ends_at: string;
  };
};

// Camada de acesso a dados: o único lugar que resolve quem é o usuário.
// getClaims valida a assinatura do JWT, ao contrário de getSession.
export const getCurrentMember = cache(async (): Promise<CurrentMember> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) redirect("/entrar");

  // Segunda checagem da verificação em duas etapas (o proxy não roda em
  // pré-carregamentos de página). Sem isso, o RLS devolveria vazio e a
  // pessoa veria "sem acesso" em vez da tela do código.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") redirect("/verificacao");

  const { data } = await supabase
    .from("members")
    .select(
      "id, user_id, full_name, role, team_id, division_id, organizations (id, name, timezone, report_slots, status, trial_ends_at)",
    )
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle<MemberRow>();

  if (!data) redirect("/entrar?erro=sem-acesso");

  return {
    id: data.id,
    userId: data.user_id,
    fullName: data.full_name,
    role: data.role,
    teamId: data.team_id,
    divisionId: data.division_id,
    org: {
      id: data.organizations.id,
      name: data.organizations.name,
      timezone: data.organizations.timezone,
      reportSlots: data.organizations.report_slots.map(normalizeSlot),
      status: data.organizations.status,
      trialEndsAt: data.organizations.trial_ends_at,
    },
  };
});

export function isLeader(role: Role) {
  return role !== "broker";
}
