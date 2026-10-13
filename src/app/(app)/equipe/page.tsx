import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Badge, Card, CardHeader } from "@/components/ui/card";
import { getCurrentMember, ROLE_LABEL, ROLE_RANK, type Role } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { InviteForm, MemberActions, RenameDivision, TeamActions, TeamForm } from "./forms";
import { ImportMembers } from "./import";

export const metadata: Metadata = { title: "Equipe" };

type MemberRow = {
  id: string;
  full_name: string;
  role: Role;
  team_id: string | null;
  division_id: string | null;
  active: boolean;
  terms_accepted_at: string | null;
};
type Option = { id: string; name: string };

export default async function EquipePage() {
  const me = await getCurrentMember();
  if (me.role === "broker") redirect("/painel");

  const supabase = await createClient();
  const [{ data: members }, { data: teams }, { data: divisions }, { data: org }] = await Promise.all([
    supabase.from("members").select("id, full_name, role, team_id, division_id, active, terms_accepted_at").order("full_name"),
    supabase.from("teams").select("id, name, division_id").order("name"),
    supabase.from("divisions").select("id, name").order("name"),
    supabase.from("organizations").select("seats").single(),
  ]);

  const list = (members ?? []) as MemberRow[];
  const activeCount = list.filter((m) => m.active).length;
  const scopedTeams = (teams ?? []).filter(
    (t) => me.role === "owner" || (me.role === "director" ? t.division_id === me.divisionId : t.id === me.teamId),
  );
  const teamOptions: Option[] = scopedTeams.map((t) => ({ id: t.id, name: t.name }));
  const divisionOptions: Option[] = (divisions ?? []).map((d) => ({ id: d.id, name: d.name }));
  const canEditTeams = me.role === "owner" || me.role === "director";

  const leadership = list.filter((m) => m.role === "owner" || m.role === "director");
  const byTeam = scopedTeams.map((t) => ({ team: t, people: list.filter((m) => m.team_id === t.id) }));

  const line = (p: MemberRow) => (
    <MemberLine
      key={p.id}
      person={p}
      canManage={p.id !== me.id && ROLE_RANK[p.role] > ROLE_RANK[me.role]}
      myRole={me.role}
      teams={teamOptions}
      divisions={divisionOptions}
    />
  );

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
              <CardHeader
                title={team.name}
                description={`${people.filter((p) => p.active).length} pessoas ativas`}
                action={canEditTeams ? <TeamActions teamId={team.id} name={team.name} hasPeople={people.length > 0} /> : null}
              />
              <ul className="mt-3 divide-y divide-line border-t border-line">
                {people.length === 0 ? <li className="px-6 py-5 text-sm text-muted">Ninguém nesta equipe ainda.</li> : null}
                {people.map(line)}
              </ul>
            </Card>
          ))}

          {me.role === "owner" && leadership.length > 0 ? (
            <Card>
              <CardHeader title="Liderança" description="Administradores e superintendentes" />
              <ul className="mt-3 divide-y divide-line border-t border-line">{leadership.map(line)}</ul>
            </Card>
          ) : null}
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Convidar pessoa" description="Ela recebe um e-mail para criar a senha" />
            <InviteForm myRole={me.role} teams={teamOptions} divisions={divisionOptions} />
          </Card>

          {teamOptions.length ? (
            <Card>
              <CardHeader title="Importar planilha" description="Convide várias pessoas de uma vez" />
              <ImportMembers teams={teamOptions.map((t) => t.name)} canInviteManagers={me.role === "owner" || me.role === "director"} />
            </Card>
          ) : null}

          {canEditTeams ? (
            <Card>
              <CardHeader title="Nova equipe" />
              <TeamForm isOwner={me.role === "owner"} divisions={divisionOptions} />
            </Card>
          ) : null}

          {me.role === "owner" && divisionOptions.length > 0 ? (
            <Card>
              <CardHeader title="Diretorias" description="Agrupam as equipes de cada superintendente" />
              <ul className="mt-3 divide-y divide-line border-t border-line">
                {divisionOptions.map((d) => (
                  <li key={d.id} className="px-5 py-3 sm:px-6">
                    <RenameDivision divisionId={d.id} name={d.name} />
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MemberLine({
  person,
  canManage,
  myRole,
  teams,
  divisions,
}: {
  person: MemberRow;
  canManage: boolean;
  myRole: Role;
  teams: Option[];
  divisions: Option[];
}) {
  const pending = person.active && !person.terms_accepted_at && person.role !== "owner";
  return (
    <li className="px-5 py-3 sm:px-6">
      <div className="flex items-center gap-3">
        <Avatar name={person.full_name} />
        <div className="min-w-0 flex-1">
          <p className={person.active ? "truncate text-sm font-medium" : "truncate text-sm font-medium text-muted line-through"}>
            {person.full_name}
          </p>
          <p className="text-xs text-muted">{ROLE_LABEL[person.role]}</p>
        </div>
        {!person.active ? <Badge>Inativo</Badge> : null}
        {pending ? <Badge tone="warn">Convite pendente</Badge> : null}
      </div>
      {canManage ? (
        <MemberActions
          member={{
            id: person.id,
            name: person.full_name,
            role: person.role,
            scopeId: (person.role === "director" ? person.division_id : person.team_id) ?? "",
            active: person.active,
            pending,
          }}
          myRole={myRole}
          teams={teams}
          divisions={divisions}
        />
      ) : null}
    </li>
  );
}
