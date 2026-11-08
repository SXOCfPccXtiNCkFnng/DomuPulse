-- Meta semanal: quanto o corretor deve fazer por semana (segunda a domingo) em
-- cada tarefa. Como a diária, fica na tabela goals e vale para as semanas do
-- mês indicado; numa semana que vira o mês, cada dia usa a meta do seu mês.
alter table public.goals drop constraint if exists goals_period_check;
alter table public.goals add constraint goals_period_check check (period in ('month', 'week', 'day'));

-- Aviso de meta batida (mês, semana e dia) para o corretor e o gerente da
-- equipe, uma vez, no momento em que o total cruza a meta.
create or replace function private.notify_goal_reached()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  g record;
  month_start date := date_trunc('month', new.report_date)::date;
  week_start date := date_trunc('week', new.report_date)::date;
  total bigint;
  delta bigint;
  broker public.members;
  label text;
  scope text;
begin
  select * into broker from public.members where id = new.member_id;

  for g in
    select metric, target, period from public.goals where member_id = new.member_id and month = month_start
  loop
    delta := coalesce((to_jsonb(new) ->> g.metric)::bigint, 0)
           - coalesce((case when tg_op = 'UPDATE' then to_jsonb(old) ->> g.metric end)::bigint, 0);
    if delta <= 0 then
      continue;
    end if;

    if g.period = 'day' then
      execute format('select coalesce(sum(%I), 0) from public.reports where member_id = $1 and report_date = $2', g.metric)
        into total using new.member_id, new.report_date;
    elsif g.period = 'week' then
      execute format('select coalesce(sum(%I), 0) from public.reports where member_id = $1 and report_date >= $2 and report_date < $2 + 7', g.metric)
        into total using new.member_id, week_start;
    else
      execute format(
        'select coalesce(sum(%I), 0) from public.reports where member_id = $1 and report_date >= $2 and report_date < ($2 + interval ''1 month'')',
        g.metric
      ) into total using new.member_id, month_start;
    end if;

    if total >= g.target and total - delta < g.target then
      label := case g.metric
        when 'sales' then 'vendas' when 'visits' then 'visitas' when 'appointments' then 'agendamentos'
        when 'proposals' then 'propostas' when 'presales' then 'pré-vendas' when 'negotiations' then 'negociações'
        when 'interactions' then 'interações' else 'leads' end;
      scope := case g.period
        when 'day' then format('do dia %s', to_char(new.report_date, 'DD/MM'))
        when 'week' then format('da semana (%s a %s)', to_char(week_start, 'DD/MM'), to_char(week_start + 6, 'DD/MM'))
        else 'do mês' end;

      insert into public.notifications (user_id, org_id, kind, title, body, url)
      values (broker.user_id, broker.org_id, 'goal_reached',
              case g.period when 'day' then 'Meta do dia batida' when 'week' then 'Meta da semana batida' else 'Meta batida' end,
              format('Você bateu a meta de %s %s: %s de %s.', label, scope, total, g.target),
              case when g.period = 'month' then '/metas' else '/painel' end);

      insert into public.notifications (user_id, org_id, kind, title, body, url)
      select m.user_id, m.org_id, 'goal_reached',
             case g.period when 'day' then 'Meta do dia batida na equipe' when 'week' then 'Meta da semana batida na equipe' else 'Meta batida na equipe' end,
             format('%s bateu a meta de %s %s: %s de %s.', broker.display_name, label, scope, total, g.target), '/metas'
      from public.members m
      where m.team_id = broker.team_id and m.role = 'manager' and m.active;
    end if;
  end loop;

  return null;
end
$$;
