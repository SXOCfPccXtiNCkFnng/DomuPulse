"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Select } from "@/components/ui/field";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import type { FormState } from "@/lib/validation";
import { createTeam, inviteMember, setMemberActive } from "./actions";

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
