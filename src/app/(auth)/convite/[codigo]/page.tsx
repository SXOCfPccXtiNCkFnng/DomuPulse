import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { JoinForm } from "@/components/auth-forms";
import { AuthHeading } from "@/components/auth-heading";
import { findOrgByInviteCode } from "@/lib/invite-link";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Convite", robots: { index: false, follow: false } };

export default function InvitePage({ params }: PageProps<"/convite/[codigo]">) {
  return (
    <Suspense fallback={<InviteSkeleton />}>
      <Invite params={params} />
    </Suspense>
  );
}

function InviteSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <span className="h-4 w-32 animate-pulse rounded bg-surface-2" />
      <span className="h-12 w-full animate-pulse rounded-xl bg-surface-2" />
      <span className="h-72 w-full animate-pulse rounded-xl bg-surface-2" />
    </div>
  );
}

async function Invite({ params }: { params: PageProps<"/convite/[codigo]">["params"] }) {
  const { codigo } = await params;
  const org = await findOrgByInviteCode(codigo);

  if (!org) {
    return (
      <AuthHeading eyebrow="Convite" title={<>Link <span className="text-brand-text">inválido.</span></>}>
        Este link de convite não vale mais. Peça um novo ao seu gestor, ou{" "}
        <Link href="/entrar" className="font-medium text-ink underline underline-offset-4">
          entre
        </Link>{" "}
        se você já tem conta.
      </AuthHeading>
    );
  }

  const { data: teams } = await createAdminClient().from("teams").select("id, name").eq("org_id", org.id).order("name");

  return (
    <>
      <AuthHeading eyebrow="Convite" title={<>Entre na equipe da <span className="text-brand-text">{org.name}.</span></>}>
        Crie seu acesso para lançar seus relatórios pelo celular.
      </AuthHeading>
      {teams?.length ? (
        <JoinForm code={codigo} teams={teams} />
      ) : (
        <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-ink-2">
          A {org.name} ainda não criou as equipes. Avise seu gestor e abra o link de novo depois.
        </p>
      )}
      <p className="mt-8 text-sm text-muted">
        Já tem conta?{" "}
        <Link href="/entrar" className="font-medium text-ink underline-offset-4 hover:underline">
          Entrar
        </Link>
      </p>
    </>
  );
}
