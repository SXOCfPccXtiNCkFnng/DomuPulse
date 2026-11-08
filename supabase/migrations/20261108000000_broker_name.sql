-- Nome de corretor: é por ele que a imobiliária localiza cada pessoa. Quando
-- preenchido, vira o nome principal em listas, filtros, relatórios e avisos;
-- o nome completo fica como informação secundária.
alter table public.members
  add column if not exists broker_name text check (broker_name is null or char_length(btrim(broker_name)) between 2 and 80);

alter table public.members
  add column if not exists display_name text generated always as (coalesce(nullif(btrim(broker_name), ''), full_name)) stored;

-- Aviso de meta batida para o gerente: pelo nome de corretor.
create or replace function private.notify_goal_reached()
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
             format('%s bateu a meta de %s do mês: %s de %s.', broker.display_name, label, total, g.target), '/metas'
      from public.members m
      where m.team_id = broker.team_id and m.role = 'manager' and m.active;
    end if;
  end loop;

  return null;
end
$$;
