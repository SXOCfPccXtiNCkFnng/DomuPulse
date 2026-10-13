-- Pulse: schema inicial
--
-- Hierarquia: organização (imobiliária) > diretoria > equipe > membro.
-- Toda autorização vive no banco (RLS). O front nunca decide o que um
-- usuário pode ver ou alterar; ele só pede, e o Postgres filtra.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- --------------------------------------------------------------------------
-- Tipos
-- --------------------------------------------------------------------------

-- A ordem importa: quanto maior, mais baixo na hierarquia.
create type public.member_role as enum ('owner', 'director', 'manager', 'broker');
create type public.org_status as enum ('trialing', 'active', 'past_due', 'canceled');
create type public.appointment_status as enum ('scheduled', 'done', 'canceled', 'no_show');

-- --------------------------------------------------------------------------
-- Tabelas
-- --------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  timezone text not null default 'America/Sao_Paulo',
  report_slots time[] not null default '{12:00,15:00,18:00,21:00}'
    check (cardinality(report_slots) between 1 and 8),
  status public.org_status not null default 'trialing',
  trial_ends_at timestamptz not null default now() + interval '14 days',
  seats int not null default 10 check (seats > 0),
  asaas_customer_id text unique,
  asaas_subscription_id text unique,
  created_at timestamptz not null default now()
);

create table public.divisions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  created_at timestamptz not null default now(),
  unique (org_id, name),
  unique (id, org_id)
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  division_id uuid not null,
  name text not null check (char_length(name) between 2 and 80),
  created_at timestamptz not null default now(),
  unique (org_id, name),
  unique (id, org_id),
  foreign key (division_id, org_id) references public.divisions (id, org_id) on delete cascade
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 120),
  role public.member_role not null,
  division_id uuid,
  team_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, org_id),
  foreign key (division_id, org_id) references public.divisions (id, org_id),
  foreign key (team_id, org_id) references public.teams (id, org_id),
  constraint members_scope check (
    role = 'owner'
    or (role = 'director' and division_id is not null)
    or (role in ('manager', 'broker') and team_id is not null)
  )
);

create index members_org_idx on public.members (org_id);
create index members_team_idx on public.members (team_id);
create index members_division_idx on public.members (division_id);

-- Um relatório por corretor, por dia, por janela de horário.
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  member_id uuid not null,
  report_date date not null,
  report_slot time not null,
  leads int not null default 0 check (leads between 0 and 100000),
  interactions int not null default 0 check (interactions between 0 and 100000),
  negotiations int not null default 0 check (negotiations between 0 and 100000),
  appointments int not null default 0 check (appointments between 0 and 100000),
  visits int not null default 0 check (visits between 0 and 100000),
  proposals int not null default 0 check (proposals between 0 and 100000),
  presales int not null default 0 check (presales between 0 and 100000),
  sales int not null default 0 check (sales between 0 and 100000),
  submitted_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, report_date, report_slot),
  foreign key (member_id, org_id) references public.members (id, org_id) on delete cascade
);

create index reports_org_date_idx on public.reports (org_id, report_date);

-- Corretor marca se está trabalhando hoje. Só quem está online é cobrado.
create table public.daily_status (
  member_id uuid not null,
  status_date date not null,
  org_id uuid not null,
  online boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (member_id, status_date),
  foreign key (member_id, org_id) references public.members (id, org_id) on delete cascade
);

create index daily_status_org_date_idx on public.daily_status (org_id, status_date);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  member_id uuid not null,
  client_name text not null check (char_length(client_name) between 1 and 120),
  client_phone text check (client_phone ~ '^[0-9+() -]{8,20}$'),
  scheduled_at timestamptz not null,
  status public.appointment_status not null default 'scheduled',
  notes text check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (member_id, org_id) references public.members (id, org_id) on delete cascade
);

create index appointments_org_time_idx on public.appointments (org_id, scheduled_at);
create index appointments_member_time_idx on public.appointments (member_id, scheduled_at);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  member_id uuid not null,
  month date not null check (extract(day from month) = 1),
  metric text not null check (metric in (
    'leads', 'interactions', 'negotiations', 'appointments',
    'visits', 'proposals', 'presales', 'sales'
  )),
  target int not null check (target between 1 and 1000000),
  unique (member_id, month, metric),
  foreign key (member_id, org_id) references public.members (id, org_id) on delete cascade
);

create table public.commissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  member_id uuid not null,
  received_on date not null,
  amount_cents bigint not null check (amount_cents between 1 and 100000000000),
  description text check (char_length(description) <= 200),
  created_at timestamptz not null default now(),
  foreign key (member_id, org_id) references public.members (id, org_id) on delete cascade
);

create index commissions_member_idx on public.commissions (member_id, received_on);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://'),
  p256dh text not null,
  auth_key text not null,
  user_agent text check (char_length(user_agent) <= 400),
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Garante que cada lembrete seja enviado uma única vez, mesmo que o
-- agendador rode várias vezes dentro da mesma janela.
create table public.notification_log (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.members (id) on delete cascade,
  kind text not null,
  ref_date date not null,
  ref_slot time not null,
  sent_at timestamptz not null default now(),
  unique (member_id, kind, ref_date, ref_slot)
);

-- Idempotência do webhook do Asaas: o mesmo evento nunca é processado duas vezes.
create table public.billing_events (
  id text primary key,
  event text not null,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  org_id uuid,
  actor uuid,
  table_name text not null,
  record_id uuid,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  at timestamptz not null default now()
);

create index audit_log_org_idx on public.audit_log (org_id, at desc);

-- --------------------------------------------------------------------------
-- Funções de autorização
--
-- Ficam no schema private, que não é exposto pela API. São SECURITY DEFINER
-- para conseguir ler members sem cair em recursão de RLS.
-- --------------------------------------------------------------------------

create function private.my_org_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select org_id from public.members
  where user_id = (select auth.uid()) and active
$$;

create function private.my_role()
returns public.member_role
language sql stable security definer set search_path = ''
as $$
  select role from public.members
  where user_id = (select auth.uid()) and active
$$;

-- Verdadeiro se o usuário atual lidera o membro alvo (está acima dele na
-- hierarquia e dentro do mesmo escopo). Nulos nunca concedem acesso: a
-- comparação fica dentro de EXISTS, onde NULL equivale a falso.
create function private.leads_member(target uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.members me
    join public.members t on t.org_id = me.org_id
    where me.user_id = (select auth.uid())
      and me.active
      and t.id = target
      and t.id <> me.id
      and t.role > me.role
      and (
        me.role = 'owner'
        or (me.role = 'director' and t.division_id = me.division_id)
        or (me.role = 'manager' and t.team_id = me.team_id)
      )
  )
$$;

create function private.can_view_member(target uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.members
    where id = target and user_id = (select auth.uid()) and active
  ) or private.leads_member(target)
$$;

-- Organização com assinatura em dia (ou em teste) pode gravar dados.
-- Cancelada fica somente leitura.
create function private.org_writable(target_org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.organizations
    where id = target_org
      and (
        status in ('active', 'past_due')
        or (status = 'trialing' and trial_ends_at > now())
      )
  )
$$;

create function private.can_write_for(target uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.can_view_member(target)
     and private.org_writable(private.my_org_id())
$$;

grant execute on all functions in schema private to authenticated, service_role;

-- --------------------------------------------------------------------------
-- Triggers
-- --------------------------------------------------------------------------

-- org_id é sempre derivado do membro, nunca do que o cliente enviar.
create function private.set_org_from_member()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select org_id into new.org_id from public.members where id = new.member_id;
  if new.org_id is null then
    raise exception 'Membro inválido.' using errcode = '23503';
  end if;
  return new;
end
$$;

create function private.touch_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- Gerente e corretor herdam a diretoria da equipe.
create function private.sync_member_division()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.team_id is not null then
    select division_id into new.division_id from public.teams where id = new.team_id;
  end if;
  return new;
end
$$;

create function private.validate_report()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  org public.organizations;
  local_today date;
  target public.members;
begin
  select * into org from public.organizations where id = new.org_id;
  select * into target from public.members where id = new.member_id;
  local_today := (now() at time zone org.timezone)::date;

  if not target.active or target.role <> 'broker' then
    raise exception 'Relatórios só podem ser lançados para corretores ativos.';
  end if;

  if not (new.report_slot = any (org.report_slots)) then
    raise exception 'Horário de relatório inválido.';
  end if;

  if new.report_date > local_today then
    raise exception 'Não é possível lançar relatório para uma data futura.';
  end if;

  -- O próprio corretor só edita hoje e ontem. A liderança pode corrigir qualquer dia.
  if target.user_id = auth.uid() and new.report_date < local_today - 1 then
    raise exception 'Prazo para editar este relatório encerrado. Fale com seu gerente.';
  end if;

  return new;
end
$$;

create function private.audit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  row_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  row_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  rec jsonb := coalesce(row_new, row_old);
begin
  insert into public.audit_log (org_id, actor, table_name, record_id, action, old_data, new_data)
  values (
    (rec ->> 'org_id')::uuid,
    auth.uid(),
    tg_table_name,
    (rec ->> 'id')::uuid,
    lower(tg_op),
    row_old,
    row_new
  );
  return null;
end
$$;

create trigger members_sync_division before insert or update of team_id on public.members
  for each row execute function private.sync_member_division();

create trigger reports_set_org before insert or update of member_id on public.reports
  for each row execute function private.set_org_from_member();
create trigger reports_validate before insert or update on public.reports
  for each row execute function private.validate_report();
create trigger reports_touch before update on public.reports
  for each row execute function private.touch_updated_at();

create trigger daily_status_set_org before insert or update of member_id on public.daily_status
  for each row execute function private.set_org_from_member();
create trigger daily_status_touch before update on public.daily_status
  for each row execute function private.touch_updated_at();

create trigger appointments_set_org before insert or update of member_id on public.appointments
  for each row execute function private.set_org_from_member();
create trigger appointments_touch before update on public.appointments
  for each row execute function private.touch_updated_at();

create trigger goals_set_org before insert or update of member_id on public.goals
  for each row execute function private.set_org_from_member();

create trigger commissions_set_org before insert or update of member_id on public.commissions
  for each row execute function private.set_org_from_member();

create trigger members_audit after insert or update or delete on public.members
  for each row execute function private.audit();
create trigger reports_audit after update or delete on public.reports
  for each row execute function private.audit();
create trigger appointments_audit after update or delete on public.appointments
  for each row execute function private.audit();
create trigger goals_audit after insert or update or delete on public.goals
  for each row execute function private.audit();
create trigger commissions_audit after insert or update or delete on public.commissions
  for each row execute function private.audit();

-- --------------------------------------------------------------------------
-- Permissões e RLS
-- --------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

alter table public.organizations enable row level security;
alter table public.divisions enable row level security;
alter table public.teams enable row level security;
alter table public.members enable row level security;
alter table public.reports enable row level security;
alter table public.daily_status enable row level security;
alter table public.appointments enable row level security;
alter table public.goals enable row level security;
alter table public.commissions enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_log enable row level security;
alter table public.billing_events enable row level security;
alter table public.audit_log enable row level security;

-- Tabelas internas: nenhum acesso pelo cliente, só pelo servidor.
revoke all on public.notification_log, public.billing_events from authenticated;

-- Membros são criados e alterados somente pelo servidor, que também
-- precisa criar o usuário no Auth.
revoke insert, update, delete on public.members from authenticated;

-- Organização: o dono só altera nome e configurações, nunca plano ou status.
revoke insert, update, delete on public.organizations from authenticated;
grant update (name, timezone, report_slots) on public.organizations to authenticated;

revoke update, delete on public.audit_log from authenticated;

create policy "membros veem a própria organização" on public.organizations
  for select to authenticated
  using (id = (select private.my_org_id()));

create policy "dono altera configurações" on public.organizations
  for update to authenticated
  using (id = (select private.my_org_id()) and (select private.my_role()) = 'owner')
  with check (id = (select private.my_org_id()));

create policy "membros veem diretorias" on public.divisions
  for select to authenticated
  using (org_id = (select private.my_org_id()));

create policy "dono gerencia diretorias" on public.divisions
  for all to authenticated
  using (org_id = (select private.my_org_id()) and (select private.my_role()) = 'owner')
  with check (org_id = (select private.my_org_id()) and (select private.my_role()) = 'owner');

create policy "membros veem equipes" on public.teams
  for select to authenticated
  using (org_id = (select private.my_org_id()));

create policy "liderança gerencia equipes" on public.teams
  for all to authenticated
  using (
    org_id = (select private.my_org_id())
    and (
      (select private.my_role()) = 'owner'
      or (
        (select private.my_role()) = 'director'
        and division_id = (select division_id from public.members where user_id = (select auth.uid()))
      )
    )
  )
  with check (
    org_id = (select private.my_org_id())
    and (
      (select private.my_role()) = 'owner'
      or (
        (select private.my_role()) = 'director'
        and division_id = (select division_id from public.members where user_id = (select auth.uid()))
      )
    )
  );

create policy "ver membros do escopo" on public.members
  for select to authenticated
  using (private.can_view_member(id));

create policy "ver relatórios do escopo" on public.reports
  for select to authenticated using (private.can_view_member(member_id));
create policy "lançar relatórios do escopo" on public.reports
  for insert to authenticated with check (private.can_write_for(member_id));
create policy "editar relatórios do escopo" on public.reports
  for update to authenticated
  using (private.can_write_for(member_id)) with check (private.can_write_for(member_id));
create policy "apagar relatórios (liderança)" on public.reports
  for delete to authenticated using (private.leads_member(member_id));

create policy "ver status do escopo" on public.daily_status
  for select to authenticated using (private.can_view_member(member_id));
create policy "marcar status do escopo" on public.daily_status
  for insert to authenticated with check (private.can_write_for(member_id));
create policy "alterar status do escopo" on public.daily_status
  for update to authenticated
  using (private.can_write_for(member_id)) with check (private.can_write_for(member_id));

create policy "ver agenda do escopo" on public.appointments
  for select to authenticated using (private.can_view_member(member_id));
create policy "criar agenda do escopo" on public.appointments
  for insert to authenticated with check (private.can_write_for(member_id));
create policy "editar agenda do escopo" on public.appointments
  for update to authenticated
  using (private.can_write_for(member_id)) with check (private.can_write_for(member_id));
create policy "apagar agenda do escopo" on public.appointments
  for delete to authenticated using (private.can_write_for(member_id));

create policy "ver metas do escopo" on public.goals
  for select to authenticated using (private.can_view_member(member_id));
create policy "liderança define metas" on public.goals
  for all to authenticated
  using (private.leads_member(member_id) and private.org_writable(org_id))
  with check (private.leads_member(member_id) and private.org_writable((select private.my_org_id())));

create policy "ver comissões do escopo" on public.commissions
  for select to authenticated using (private.can_view_member(member_id));
create policy "lançar comissões do escopo" on public.commissions
  for insert to authenticated with check (private.can_write_for(member_id));
create policy "editar comissões do escopo" on public.commissions
  for update to authenticated
  using (private.can_write_for(member_id)) with check (private.can_write_for(member_id));
create policy "apagar comissões do escopo" on public.commissions
  for delete to authenticated using (private.can_write_for(member_id));

create policy "dispositivos do próprio usuário" on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "dono consulta auditoria" on public.audit_log
  for select to authenticated
  using (org_id = (select private.my_org_id()) and (select private.my_role()) = 'owner');

-- --------------------------------------------------------------------------
-- Tempo real
--
-- O Realtime aplica as mesmas políticas acima: cada pessoa só recebe
-- eventos das linhas que tem permissão para ver.
-- --------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;

alter publication supabase_realtime add table
  public.reports,
  public.daily_status,
  public.appointments,
  public.members;
