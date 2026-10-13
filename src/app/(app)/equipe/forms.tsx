"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Select } from "@/components/ui/field";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import type { FormState } from "@/lib/validation";
import { createTeam, deleteTeam, inviteMember, renameDivision, renameTeam, resendInvite, setMemberActive, updateMember } from "./actions";

type Option = { id: string; name: string };

const initial: FormState = {};

const INVITABLE: Record<Role, Role[]> = {
  owner: ["broker", "manager", "director"],
  director: ["broker", "manager"],
  manager: ["broker"],
  broker: [],
};

export function InviteForm({ myRole, teams, divisions }: { myRole: Role; teams: Option[]; divisions: Option[] }) {
  const [state, action, pending] = useActionState(inviteMember, initial);
  const roles = INVITABLE[myRole];
  const [role, setRole] = useState<Role>(roles[0]);
  const scopes = role === "director" ? divisions : teams;

  if (teams.length === 0 && role !== "director") {
    return <p className="px-5 pt-3 pb-6 text-sm text-muted sm:px-6">Crie uma equipe antes de convidar pessoas.</p>;
  }

  return (
    <form action={action} className="flex flex-col gap-4 p-5 sm:p-6" noValidate>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}
      <Field label="Nome completo" error={state.fieldErrors?.fullName}>
        <Input name="fullName" required autoComplete="off" />
      </Field>
      <Field label="E-mail" error={state.fieldErrors?.email}>
        <Input name="email" type="email" inputMode="email" required autoComplete="off" />
      </Field>
      {roles.length > 1 ? (
        <Field label="Cargo">
          <Select name="role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <input type="hidden" name="role" value={role} />
      )}
      <Field label={role === "director" ? "Diretoria" : "Equipe"} error={state.fieldErrors?.scopeId}>
        <Select name="scopeId" defaultValue={scopes[0]?.id} key={role}>
          {scopes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Enviando..." : "Enviar convite"}
      </Button>
    </form>
  );
}

export function TeamForm({ isOwner, divisions }: { isOwner: boolean; divisions: Option[] }) {
  const [state, action, pending] = useActionState(createTeam, initial);
  return (
    <form action={action} className="flex flex-col gap-4 p-5 sm:p-6" noValidate>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}
      <Field label="Nome da equipe" error={state.fieldErrors?.name}>
        <Input name="name" placeholder="Ex.: Equipe Norte" required />
      </Field>
      {isOwner && divisions.length > 0 ? (
        <Field label="Diretoria">
          <Select name="divisionId" defaultValue={divisions[0].id}>
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      {isOwner && divisions.length === 0 ? (
        <Field label="Nome da diretoria" hint="Agrupa as equipes. Pode trocar depois.">
          <Input name="divisionName" placeholder="Diretoria principal" />
        </Field>
      ) : null}
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Criando..." : "Criar equipe"}
      </Button>
    </form>
  );
}

export function MemberToggle({ memberId, active, name }: { memberId: string; active: boolean; name: string }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = () =>
    start(async () => {
      const result = await setMemberActive(memberId, !active);
      setConfirming(false);
      setError(result.error ?? null);
    });

  if (active && confirming) {
    return (
      <span className="flex items-center gap-1.5">
        <Button size="sm" variant="danger" onClick={run} disabled={pending} aria-label={`Confirmar desativação de ${name}`}>
          {pending ? "Desativando..." : "Confirmar"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
          Cancelar
        </Button>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-2">
      {error ? <span className="text-xs text-danger">{error}</span> : null}
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => (active ? setConfirming(true) : run())}
      >
        {active ? "Desativar" : pending ? "Reativando..." : "Reativar"}
      </Button>
    </span>
  );
}

type MemberInfo = { id: string; name: string; role: Role; scopeId: string; active: boolean; pending: boolean };

/** Editar, reenviar convite e desativar: as ações de cada pessoa da lista. */
export function MemberActions({
  member,
  myRole,
  teams,
  divisions,
}: {
  member: MemberInfo;
  myRole: Role;
  teams: Option[];
  divisions: Option[];
}) {
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<FormState | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="mt-2 pl-11">
      <div className="flex flex-wrap items-center gap-1">
        {member.active ? (
          <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>
            {editing ? "Fechar" : "Editar"}
          </Button>
        ) : null}
        {member.pending ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => start(async () => setNotice(await resendInvite(member.id)))}
          >
            {pending ? "Reenviando..." : "Reenviar convite"}
          </Button>
        ) : null}
        <MemberToggle memberId={member.id} active={member.active} name={member.name} />
      </div>
      {notice?.error ? <p className="mt-1 text-xs text-danger">{notice.error}</p> : null}
      {notice?.success ? <p className="mt-1 text-xs text-brand-text">{notice.success}</p> : null}
      {editing ? <MemberEditForm member={member} myRole={myRole} teams={teams} divisions={divisions} onDone={() => setEditing(false)} /> : null}
    </div>
  );
}

function MemberEditForm({
  member,
  myRole,
  teams,
  divisions,
  onDone,
}: {
  member: MemberInfo;
  myRole: Role;
  teams: Option[];
  divisions: Option[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(async (prev: FormState, data: FormData) => {
    const result = await updateMember(member.id, prev, data);
    if (result.success) onDone();
    return result;
  }, initial);
  const roles = INVITABLE[myRole];
  const [role, setRole] = useState<Role>(member.role);
  const [name, setName] = useState(member.name);
  const scopes = role === "director" ? divisions : teams;
  const [scopeId, setScopeId] = useState(scopes.some((s) => s.id === member.scopeId) ? member.scopeId : (scopes[0]?.id ?? ""));

  return (
    <form action={action} className="mt-3 flex flex-col gap-3 rounded-xl bg-surface-2 p-4" noValidate>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Nome" error={state.fieldErrors?.fullName}>
          <Input name="fullName" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Cargo" error={state.fieldErrors?.role}>
          <Select
            name="role"
            value={role}
            onChange={(e) => {
              const next = e.target.value as Role;
              setRole(next);
              const list = next === "director" ? divisions : teams;
              if (!list.some((s) => s.id === scopeId)) setScopeId(list[0]?.id ?? "");
            }}
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={role === "director" ? "Diretoria" : "Equipe"} error={state.fieldErrors?.scopeId}>
          <Select name="scopeId" value={scopeId} onChange={(e) => setScopeId(e.target.value)}>
            {scopes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Button type="submit" size="sm" disabled={pending} className="self-start">
        {pending ? "Salvando..." : "Salvar alterações"}
      </Button>
    </form>
  );
}

/** Renomear e excluir equipe. Excluir só aparece com a equipe vazia. */
export function TeamActions({ teamId, name, hasPeople }: { teamId: string; name: string; hasPeople: boolean }) {
  const [mode, setMode] = useState<"idle" | "rename" | "delete">("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [state, action, saving] = useActionState(async (prev: FormState, data: FormData) => {
    const result = await renameTeam(teamId, prev, data);
    if (result.success) setMode("idle");
    return result;
  }, initial);

  if (mode === "rename") {
    return (
      <form action={action} className="flex items-start gap-1.5" noValidate>
        <span className="flex flex-col gap-1">
          <Input name="name" defaultValue={name} className="h-8 w-40 text-sm" autoFocus aria-label="Novo nome da equipe" />
          {state.fieldErrors?.name || state.error ? <span className="text-xs text-danger">{state.fieldErrors?.name ?? state.error}</span> : null}
        </span>
        <Button type="submit" size="sm" disabled={saving}>
          Salvar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setMode("idle")}>
          Cancelar
        </Button>
      </form>
    );
  }

  if (mode === "delete") {
    return (
      <span className="flex flex-col items-end gap-1">
        <span className="flex gap-1.5">
          <Button
            size="sm"
            variant="danger"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const result = await deleteTeam(teamId);
                if (result.error) setError(result.error);
              })
            }
          >
            {pending ? "Excluindo..." : "Confirmar exclusão"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMode("idle")}>
            Cancelar
          </Button>
        </span>
        {error ? <span className="max-w-64 text-right text-xs text-danger">{error}</span> : null}
      </span>
    );
  }

  return (
    <span className="flex gap-1">
      <Button size="sm" variant="ghost" onClick={() => setMode("rename")}>
        Renomear
      </Button>
      {!hasPeople ? (
        <Button size="sm" variant="ghost" onClick={() => setMode("delete")}>
          Excluir
        </Button>
      ) : null}
    </span>
  );
}

export function RenameDivision({ divisionId, name }: { divisionId: string; name: string }) {
  const [editing, setEditing] = useState(false);
  const [state, action, saving] = useActionState(async (prev: FormState, data: FormData) => {
    const result = await renameDivision(divisionId, prev, data);
    if (result.success) setEditing(false);
    return result;
  }, initial);

  if (!editing) {
    return (
      <span className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{name}</span>
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          Renomear
        </Button>
      </span>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-start gap-1.5" noValidate>
      <span className="flex flex-col gap-1">
        <Input name="name" defaultValue={name} className="h-8 w-44 text-sm" autoFocus aria-label="Novo nome da diretoria" />
        {state.fieldErrors?.name || state.error ? <span className="text-xs text-danger">{state.fieldErrors?.name ?? state.error}</span> : null}
      </span>
      <Button type="submit" size="sm" disabled={saving}>
        Salvar
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
        Cancelar
      </Button>
    </form>
  );
}
