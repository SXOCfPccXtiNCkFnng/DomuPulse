import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Badge, Card, CardHeader } from "@/components/ui/card";
import { getCurrentMember, ROLE_LABEL, ROLE_RANK, type Role } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { InviteForm, MemberToggle, TeamForm } from "./forms";

export const metadata: Metadata = { title: "Equipe" };

type MemberRow = { id: string; full_name: string; role: Role; team_id: string | null; division_id: string | null; active: boolean };

export default async function EquipePage() {
  const me = await getCurrentMember();
  if (me.role === "broker") redirect("/painel");

  const supabase = await createClient();
  const [{ data: members }, { data: teams }, { data: divisions }, { data: org }] = await Promise.all([
    supabase.from("members").select("id, full_name, role, team_id, division_id, active").order("full_name"),
    supabase.from("teams").select("id, name, division_id").order("name"),
    supabase.from("divisions").select("id, name").order("name"),
    supabase.from("organizations").select("seats").single(),
  ]);

  const list = (members ?? []) as MemberRow[];
  const activeCount = list.filter((m) => m.active).length;
  const scopedTeams = (teams ?? []).filter(
    (t) => me.role === "owner" || (me.role === "director" ? t.division_id === me.divisionId : t.id === me.teamId),
  );

  const leadership = list.filter((m) => m.role === "owner" || m.role === "director");
  const byTeam = scopedTeams.map((t) => ({ team: t, people: list.filter((m) => m.team_id === t.id) }));

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4 animate-rise">
        <div>
          <p className="text-sm text-muted">{me.org.name}</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Equipe</h1>
        </div>
        {me.role === "owner" && org ? (
          <Badge tone={activeCount >= org.seats ? "warn" : "neutral"} className="h-8 px-3 text-[13px]">
            {activeCount} de {org.seats} assentos em uso
          </Badge>
        ) : null}
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          {byTeam.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="font-display text-lg font-semibold">Comece criando a primeira equipe</p>
              <p className="mt-1 text-sm text-muted">Depois convide o gerente e os corretores dela.</p>
            </Card>
          ) : null}

          {byTeam.map(({ team, people }) => (
            <Card key={team.id}>
              <CardHeader title={team.name} description={`${people.filter((p) => p.active).length} pessoas ativas`} />
              <ul className="mt-3 divide-y divide-line border-t border-line">
                {people.length === 0 ? <li className="px-6 py-5 text-sm text-muted">Ninguém nesta equipe ainda.</li> : null}
                {people.map((p) => (
                  <MemberLine key={p.id} person={p} canManage={p.id !== me.id && ROLE_RANK[p.role] > ROLE_RANK[me.role]} />
                ))}
              </ul>
            </Card>
          ))}

          {me.role === "owner" && leadership.length > 0 ? (
            <Card>
              <CardHeader title="Liderança" description="Administradores e superintendentes" />
              <ul className="mt-3 divide-y divide-line border-t border-line">
                {leadership.map((p) => (
                  <MemberLine key={p.id} person={p} canManage={p.id !== me.id && ROLE_RANK[p.role] > ROLE_RANK[me.role]} />
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Convidar pessoa" description="Ela recebe um e-mail para criar a senha" />
            <InviteForm
              myRole={me.role}
              teams={scopedTeams.map((t) => ({ id: t.id, name: t.name }))}
              divisions={(divisions ?? []).map((d) => ({ id: d.id, name: d.name }))}
            />
          </Card>

          {me.role === "owner" || me.role === "director" ? (
            <Card>
              <CardHeader title="Nova equipe" />
              <TeamForm
                isOwner={me.role === "owner"}
                divisions={(divisions ?? []).map((d) => ({ id: d.id, name: d.name }))}
              />
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MemberLine({ person, canManage }: { person: MemberRow; canManage: boolean }) {
  return (
    <li className="flex items-center gap-3 px-5 py-3 sm:px-6">
      <Avatar name={person.full_name} />
      <div className="min-w-0 flex-1">
        <p className={person.active ? "truncate text-sm font-medium" : "truncate text-sm font-medium text-muted line-through"}>
          {person.full_name}
        </p>
        <p className="text-xs text-muted">{ROLE_LABEL[person.role]}</p>
      </div>
      {!person.active ? <Badge>Inativo</Badge> : null}
      {canManage ? <MemberToggle memberId={person.id} active={person.active} name={person.full_name} /> : null}
    </li>
  );
}
