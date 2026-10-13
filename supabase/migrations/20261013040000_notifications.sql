-- Avisos dentro do app (o sininho do painel).
--
-- Cada pessoa vê e marca como lido só os próprios avisos. Quem cria é o
-- servidor (chave de serviço) ou os gatilhos do banco, nunca o cliente.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  org_id uuid references public.organizations (id) on delete cascade,
  kind text not null check (char_length(kind) <= 40),
  title text not null check (char_length(title) <= 120),
  body text check (char_length(body) <= 400),
  url text check (url ~ '^/[^/\\]'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
-- Do aviso, o cliente só pode mudar a marca de lido.
grant update (read_at) on public.notifications to authenticated;

create policy "ver os próprios avisos" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy "marcar os próprios avisos como lidos" on public.notifications
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "segunda etapa quando ativada" on public.notifications
  as restrictive for all to authenticated using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

alter publication supabase_realtime add table public.notifications;

-- --------------------------------------------------------------------------
-- Meta batida
--
-- O corretor grava o relatório direto no banco, sem passar pelo servidor do
-- app. Este gatilho percebe quando o total do mês cruza a meta e avisa o
-- corretor e o gerente da equipe, uma vez, no momento do cruzamento.
-- --------------------------------------------------------------------------

create function private.notify_goal_reached()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  g record;
  month_start date := date_trunc('month', new.report_date)::date;
  total bigint;
  delta bigint;
  broker public.members;
  label text;
begin
  select * into broker from public.members where id = new.member_id;

  for g in
    select metric, target from public.goals where member_id = new.member_id and month = month_start
  loop
    delta := coalesce((to_jsonb(new) ->> g.metric)::bigint, 0)
           - coalesce((case when tg_op = 'UPDATE' then to_jsonb(old) ->> g.metric end)::bigint, 0);
    if delta <= 0 then
      continue;
    end if;

    execute format(
      'select coalesce(sum(%I), 0) from public.reports where member_id = $1 and report_date >= $2 and report_date < ($2 + interval ''1 month'')',
      g.metric
    ) into total using new.member_id, month_start;

    if total >= g.target and total - delta < g.target then
      label := case g.metric
        when 'sales' then 'vendas' when 'visits' then 'visitas' when 'appointments' then 'agendamentos'
        when 'proposals' then 'propostas' when 'presales' then 'pré-vendas' when 'negotiations' then 'negociações'
        when 'interactions' then 'interações' else 'leads' end;

      insert into public.notifications (user_id, org_id, kind, title, body, url)
      values (broker.user_id, broker.org_id, 'goal_reached', 'Meta batida',
              format('Você bateu a meta de %s do mês: %s de %s.', label, total, g.target), '/metas');

      insert into public.notifications (user_id, org_id, kind, title, body, url)
      select m.user_id, m.org_id, 'goal_reached', 'Meta batida na equipe',
             format('%s bateu a meta de %s do mês: %s de %s.', broker.full_name, label, total, g.target), '/metas'
      from public.members m
      where m.team_id = broker.team_id and m.role = 'manager' and m.active;
    end if;
  end loop;

  return null;
end
$$;

create trigger reports_goal_reached after insert or update on public.reports
  for each row execute function private.notify_goal_reached();
