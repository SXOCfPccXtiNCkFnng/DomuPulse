-- 1) Dia em que a semana começa, por imobiliária (0 = domingo ... 6 = sábado).
--    Padrão segunda; quem fecha a semana na quarta usa quinta (4). Vale para a
--    meta da semana, o filtro "Esta semana" e o resumo semanal.
-- 2) Meta de visitas por semana de cada corretor no quadro de Visitas
--    (padrão 15), que só a liderança altera.

alter table public.organizations
  add column if not exists week_start smallint not null default 1 check (week_start between 0 and 6);
grant update (week_start) on public.organizations to authenticated;

alter table public.members
  add column if not exists visit_goal smallint not null default 15 check (visit_goal between 0 and 999);

-- Muda a meta de visitas de um corretor: só liderança, dentro do próprio escopo.
create or replace function public.set_visit_goal(p_member uuid, p_goal integer)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if private.my_role() is null or private.my_role() = 'broker' or not private.mfa_ok() then
    raise exception 'Só a liderança altera a meta de visitas.' using errcode = '42501';
  end if;
  if p_goal is null or p_goal < 0 or p_goal > 999 then
    raise exception 'Meta inválida.' using errcode = '22023';
  end if;
  if not private.can_write_for(p_member) then
    raise exception 'Corretor fora do seu escopo.' using errcode = '42501';
  end if;
  update public.members set visit_goal = p_goal where id = p_member and org_id = private.my_org_id();
end
$$;

revoke all on function public.set_visit_goal(uuid, integer) from public, anon;
grant execute on function public.set_visit_goal(uuid, integer) to authenticated;

-- Linhas do quadro de Visitas passam a trazer a meta.
drop function if exists public.visits_board_brokers();
create function public.visits_board_brokers()
returns table (id uuid, name text, active boolean, is_broker boolean, visit_goal smallint)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_org uuid := private.my_org_id();
begin
  if v_org is null or not private.mfa_ok() then
    return;
  end if;
  return query
    select m.id, m.display_name, m.active, m.role = 'broker', m.visit_goal
    from public.members m
    where m.org_id = v_org
    order by m.display_name;
end
$$;

revoke all on function public.visits_board_brokers() from public, anon;
grant execute on function public.visits_board_brokers() to authenticated;

-- Aviso de meta batida: a semana começa no dia configurado pela imobiliária.
create or replace function private.notify_goal_reached()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  g record;
  month_start date := date_trunc('month', new.report_date)::date;
  week_start date;
  first_day smallint;
  total bigint;
  delta bigint;
  broker public.members;
  label text;
  scope text;
begin
  select * into broker from public.members where id = new.member_id;
  select o.week_start into first_day from public.organizations o where o.id = broker.org_id;
  week_start := new.report_date - ((extract(dow from new.report_date)::int - coalesce(first_day, 1) + 7) % 7);

  for g in
    select metric, target, period, slot from public.goals where member_id = new.member_id and month = month_start
  loop
    if g.period = 'slot' and g.slot <> new.report_slot then
      continue;
    end if;

    delta := coalesce((to_jsonb(new) ->> g.metric)::bigint, 0)
           - coalesce((case when tg_op = 'UPDATE' then to_jsonb(old) ->> g.metric end)::bigint, 0);
    if delta <= 0 then
      continue;
    end if;

    if g.period = 'slot' then
      total := coalesce((to_jsonb(new) ->> g.metric)::bigint, 0);
    elsif g.period = 'day' then
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
        when 'slot' then format('do horário das %s',
          case when extract(minute from g.slot) = 0 then to_char(g.slot, 'FMHH24"h"') else to_char(g.slot, 'FMHH24"h"MI') end)
        when 'day' then format('do dia %s', to_char(new.report_date, 'DD/MM'))
        when 'week' then format('da semana (%s a %s)', to_char(week_start, 'DD/MM'), to_char(week_start + 6, 'DD/MM'))
        else 'do mês' end;

      insert into public.notifications (user_id, org_id, kind, title, body, url)
      values (broker.user_id, broker.org_id, 'goal_reached',
              case g.period when 'slot' then 'Meta do horário batida' when 'day' then 'Meta do dia batida'
                            when 'week' then 'Meta da semana batida' else 'Meta batida' end,
              format('Você bateu a meta de %s %s: %s de %s.', label, scope, total, g.target),
              case when g.period = 'month' then '/metas' else '/painel' end);

      if g.period <> 'slot' then
        insert into public.notifications (user_id, org_id, kind, title, body, url)
        select m.user_id, m.org_id, 'goal_reached',
               case g.period when 'day' then 'Meta do dia batida na equipe' when 'week' then 'Meta da semana batida na equipe' else 'Meta batida na equipe' end,
               format('%s bateu a meta de %s %s: %s de %s.', broker.display_name, label, scope, total, g.target), '/metas'
        from public.members m
        where m.team_id = broker.team_id and m.role = 'manager' and m.active;
      end if;
    end if;
  end loop;

  return null;
end
$$;

notify pgrst, 'reload schema';
