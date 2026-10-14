import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { LEGAL_DOCS_VERSION } from "@/lib/legal";
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
    /** Assinatura cancelada pelo administrador: acesso até esta data. */
    cancelAt: string | null;
  };
  /** Versão dos Termos que a pessoa aceitou por último (null se nunca aceitou). */
  termsVersion: string | null;
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
    cancel_at: string | null;
  };
  terms_version: string | null;
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
      "id, user_id, full_name, role, team_id, division_id, terms_version, organizations (id, name, timezone, report_slots, status, trial_ends_at, cancel_at)",
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
      cancelAt: data.organizations.cancel_at,
    },
    termsVersion: data.terms_version,
  };
});

export function isLeader(role: Role) {
  return role !== "broker";
}

/**
 * Conta que nunca foi ativada (ou cujo acesso gratuito acabou) ainda está no
 * onboarding: só a tela de ativação abre. Cancelada ou em atraso continua
 * abrindo o app, só para consulta.
 */
export function needsActivation(org: Pick<CurrentMember["org"], "status" | "trialEndsAt">) {
  return org.status === "trialing" && !orgCanWrite(org);
}

/**
 * Toda página do app começa por aqui, em vez de getCurrentMember: manda para
 * /ativar quem ainda não ativou a conta. Fica na página, não no layout, porque
 * o layout não roda de novo quando se navega entre páginas.
 */
export async function requireActivatedMember() {
  const member = await getCurrentMember();
  if (needsActivation(member.org)) redirect("/ativar");
  // Termos mudaram desde o último aceite: pede o novo aceite antes de seguir.
  if (member.termsVersion !== LEGAL_DOCS_VERSION) redirect("/termos-atualizados");
  return member;
}

/** A organização pode lançar dados? Assinatura em dia ou acesso gratuito valendo. */
export function orgCanWrite(org: Pick<CurrentMember["org"], "status" | "trialEndsAt">) {
  if (org.status === "active" || org.status === "past_due") return true;
  return org.status === "trialing" && Date.parse(org.trialEndsAt) > Date.now();
}
