-- Carteira de clientes (quadro por etapa) e preferência do resumo semanal.
--
-- Mesmas regras da agenda: cada cliente pertence a um corretor; o corretor
-- vê os seus, a liderança vê os do seu escopo, nenhuma imobiliária vê outra.

create type public.client_stage as enum (
  'lead', 'talking', 'scheduled', 'visited', 'proposal', 'presale', 'won', 'lost'
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  member_id uuid not null,
  name text not null check (char_length(name) between 1 and 120),
  phone text check (phone ~ '^[0-9+() -]{8,20}$'),
  email text check (char_length(email) <= 254 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  source text check (char_length(source) <= 60),
  interest text check (char_length(interest) <= 200),
  value_cents bigint check (value_cents between 0 and 100000000000),
  notes text check (char_length(notes) <= 2000),
  stage public.client_stage not null default 'lead',
  lost_reason text check (char_length(lost_reason) <= 200),
  stage_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id),
  foreign key (member_id, org_id) references public.members (id, org_id) on delete cascade
);

create index clients_org_stage_idx on public.clients (org_id, stage);
create index clients_member_idx on public.clients (member_id);

-- Visita da agenda ligada ao cliente. A chave composta impede ligar a um
-- cliente de outra imobiliária.
alter table public.appointments add column client_id uuid;
alter table public.appointments
  add foreign key (client_id, org_id) references public.clients (id, org_id) on delete set null (client_id);
create index appointments_client_idx on public.appointments (client_id);

create function private.client_stage_changed()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.stage is distinct from old.stage then
    new.stage_changed_at := now();
    if new.stage <> 'lost' then new.lost_reason := null; end if;
  end if;
  return new;
end
$$;

create trigger clients_set_org before insert or update of member_id on public.clients
  for each row execute function private.set_org_from_member();
create trigger clients_touch before update on public.clients
  for each row execute function private.touch_updated_at();
create trigger clients_stage before update of stage on public.clients
  for each row execute function private.client_stage_changed();
create trigger clients_audit after update or delete on public.clients
  for each row execute function private.audit();

alter table public.clients enable row level security;
revoke all on public.clients from anon;

create policy "ver clientes do escopo" on public.clients
  for select to authenticated using (private.can_view_member(member_id));
create policy "cadastrar clientes do escopo" on public.clients
  for insert to authenticated with check (private.can_write_for(member_id));
create policy "editar clientes do escopo" on public.clients
  for update to authenticated
  using (private.can_write_for(member_id)) with check (private.can_write_for(member_id));
create policy "apagar clientes do escopo" on public.clients
  for delete to authenticated using (private.can_write_for(member_id));
create policy "segunda etapa quando ativada" on public.clients
  as restrictive for all to authenticated using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

alter publication supabase_realtime add table public.clients;

-- Resumo semanal: cada pessoa da liderança pode desligar. Gravado pelo
-- servidor (members não aceita escrita do cliente).
alter table public.members add column weekly_digest boolean not null default true;
