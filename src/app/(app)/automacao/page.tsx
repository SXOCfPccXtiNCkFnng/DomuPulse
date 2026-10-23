import clsx from "clsx";
import { Bot, ListChecks, MessagesSquare } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { requireActivatedMember } from "@/lib/auth";
import { geminiConfigured } from "@/lib/gemini";
import { DEFAULT_CLOSING, DEFAULT_DOC_CHECKLIST, DEFAULT_GREETING } from "@/lib/recruitment";
import { createAdminClient } from "@/lib/supabase/admin";
import { dateIn, formatDate, formatTimeIn } from "@/lib/time";
import { type Conversation, ConversationsList } from "./conversations";
import { AutomationForm, ChecklistForm } from "./form";

export const metadata: Metadata = { title: "Automação" };

const TABS = [
  { id: "atendimento", label: "Atendimento", Icon: Bot },
  { id: "conversas", label: "Conversas", Icon: MessagesSquare },
  { id: "checklist", label: "Checklist de documentos", Icon: ListChecks },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default async function AutomacaoPage(props: PageProps<"/automacao">) {
  const member = await requireActivatedMember();
  if (member.org.segment !== "hr") redirect("/painel");
  const sp = await props.searchParams;
  const tab: TabId = TABS.find((t) => t.id === sp.aba)?.id ?? "atendimento";

  // Conversas com a equipe aparecem como contador na aba.
  const { count: paused } = await createAdminClient()
    .from("wa_conversations")
    .select("id", { count: "exact", head: true })
    .eq("org_id", member.org.id)
    .eq("stage", "human");

  return (
    <div className="flex flex-col gap-5">
      <header className="animate-rise">
        <p className="text-sm text-muted">Recrutamento</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Atendimento automático</h1>
      </header>

      {/* Fica preso no topo ao rolar: dá para trocar de aba de qualquer ponto da página. */}
      <nav
        aria-label="Seções da automação"
        className="sticky top-14 z-20 -mx-4 overflow-x-auto bg-bg/85 px-4 py-2 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-10 lg:px-10"
      >
        <ul className="flex w-max gap-1 rounded-xl bg-surface-2 p-1">
          {TABS.map(({ id, label, Icon }) => (
            <li key={id}>
              <Link
                href={`/automacao?aba=${id}`}
                scroll={false}
                aria-current={tab === id ? "page" : undefined}
                className={clsx(
                  "flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-medium whitespace-nowrap transition-colors",
                  tab === id ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
                )}
              >
                <Icon className="size-4" />
                {label}
                {id === "conversas" && paused ? (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-warn-soft px-1.5 text-[11px] font-semibold text-warn tabular-nums">
                    {paused}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {tab === "atendimento" ? <Atendimento orgId={member.org.id} isOwner={member.role === "owner"} /> : null}
      {tab === "conversas" ? <Conversas orgId={member.org.id} timezone={member.org.timezone} /> : null}
      {tab === "checklist" ? <Checklist orgId={member.org.id} /> : null}
    </div>
  );
}

async function Atendimento({ orgId, isOwner }: { orgId: string; isOwner: boolean }) {
  const { data } = await createAdminClient().from("rh_settings").select("bot_enabled, greeting, instructions, closing").eq("org_id", orgId).maybeSingle();
  return (
    <>
      {!geminiConfigured() ? (
        <p className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">O atendimento automático ainda não foi ativado neste ambiente. Fale com o suporte.</p>
      ) : null}
      <Card>
        <CardHeader title="Como o atendimento funciona" description="Conversa com o candidato, coleta o currículo e dá uma nota por vaga" />
        {isOwner ? (
          <AutomationForm
            initial={{
              botEnabled: data?.bot_enabled ?? true,
              greeting: (data?.greeting as string | null) ?? "",
              instructions: (data?.instructions as string | null) ?? "",
              closing: (data?.closing as string | null) ?? "",
            }}
            defaults={{ greeting: DEFAULT_GREETING, closing: DEFAULT_CLOSING }}
          />
        ) : (
          <p className="p-5 text-sm text-muted sm:p-6">Só o administrador configura a automação.</p>
        )}
      </Card>
    </>
  );
}

async function Conversas({ orgId, timezone }: { orgId: string; timezone: string }) {
  const admin = createAdminClient();
  const { data: convs } = await admin
    .from("wa_conversations")
    .select("id, phone, name, stage, candidato_id, vaga_id, updated_at")
    .eq("org_id", orgId)
    .order("updated_at", { ascending: false })
    .limit(100);

  // Nome do candidato (quando já mandou currículo) e título da vaga.
  const candIds = [...new Set((convs ?? []).map((c) => c.candidato_id as string | null).filter((v): v is string => Boolean(v)))];
  const vagaIds = [...new Set((convs ?? []).map((c) => c.vaga_id as string | null).filter((v): v is string => Boolean(v)))];
  const [{ data: cands }, { data: vagas }] = await Promise.all([
    candIds.length ? admin.from("candidatos").select("id, name").eq("org_id", orgId).in("id", candIds) : Promise.resolve({ data: [] }),
    vagaIds.length ? admin.from("vagas").select("id, title").eq("org_id", orgId).in("id", vagaIds) : Promise.resolve({ data: [] }),
  ]);
  const candName = new Map((cands ?? []).map((c) => [c.id as string, c.name as string]));
  const vagaTitle = new Map((vagas ?? []).map((v) => [v.id as string, v.title as string]));
  const conversations: Conversation[] = (convs ?? []).map((c) => ({
    id: c.id as string,
    phone: c.phone as string,
    name: candName.get(c.candidato_id as string) ?? (c.name as string | null) ?? "Sem nome",
    stage: c.stage as Conversation["stage"],
    vagaTitle: vagaTitle.get(c.vaga_id as string) ?? null,
    updatedAt: `${formatDate(dateIn(c.updated_at as string, timezone)).slice(0, 5)} ${formatTimeIn(c.updated_at as string, timezone)}`,
  }));

  return (
    <Card>
      <CardHeader
        title="Conversas no WhatsApp"
        description="Quando alguém da equipe responde pelo WhatsApp, o atendimento automático pausa sozinho naquela conversa. Aqui você pausa ou devolve ao atendimento automático."
      />
      <ConversationsList conversations={conversations} />
    </Card>
  );
}

async function Checklist({ orgId }: { orgId: string }) {
  const { data } = await createAdminClient().from("rh_settings").select("doc_checklist").eq("org_id", orgId).maybeSingle();
  const saved = (data?.doc_checklist as string[] | null) ?? [];
  return (
    <Card>
      <CardHeader
        title="Checklist de documentos"
        description="Lista que você envia ao candidato aprovado pelo WhatsApp, em Candidatos. Os documentos chegam direto no WhatsApp da empresa."
      />
      <ChecklistForm items={saved.length ? saved : DEFAULT_DOC_CHECKLIST} usingDefault={saved.length === 0} />
    </Card>
  );
}
