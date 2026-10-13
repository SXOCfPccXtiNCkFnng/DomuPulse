-- Somas de relatórios por período, calculadas no banco.
--
-- O Supabase devolve no máximo 1.000 linhas por consulta; um mês de uma
-- equipe grande passa disso. Estas funções agregam no Postgres e devolvem
-- poucas linhas. São SECURITY INVOKER: o RLS de reports vale normalmente,
-- então cada cargo soma só o que pode ver.

create function public.report_totals_by_member(p_from date, p_to date)
returns table (
  member_id uuid,
  days_reported int,
  slots_reported int,
  leads bigint,
  interactions bigint,
  negotiations bigint,
  appointments bigint,
  visits bigint,
  proposals bigint,
  presales bigint,
  sales bigint
)
language plpgsql stable security invoker set search_path = ''
as $$
begin
  if p_to < p_from or p_to - p_from > 366 then
    raise exception 'Período inválido: escolha até 1 ano.';
  end if;
  return query
    select r.member_id, count(distinct r.report_date)::int, count(*)::int,
           sum(r.leads), sum(r.interactions), sum(r.negotiations), sum(r.appointments),
           sum(r.visits), sum(r.proposals), sum(r.presales), sum(r.sales)
    from public.reports r
    where r.report_date between p_from and p_to
    group by r.member_id;
end
$$;

create function public.report_totals_by_day(p_from date, p_to date, p_team uuid default null)
returns table (
  report_date date,
  leads bigint,
  interactions bigint,
  negotiations bigint,
  appointments bigint,
  visits bigint,
  proposals bigint,
  presales bigint,
  sales bigint
)
language plpgsql stable security invoker set search_path = ''
as $$
begin
  if p_to < p_from or p_to - p_from > 366 then
    raise exception 'Período inválido: escolha até 1 ano.';
  end if;
  return query
    select r.report_date,
           sum(r.leads), sum(r.interactions), sum(r.negotiations), sum(r.appointments),
           sum(r.visits), sum(r.proposals), sum(r.presales), sum(r.sales)
    from public.reports r
    where r.report_date between p_from and p_to
      and (p_team is null or r.member_id in (select m.id from public.members m where m.team_id = p_team))
    group by r.report_date
    order by r.report_date;
end
$$;

revoke all on function public.report_totals_by_member(date, date) from public, anon;
revoke all on function public.report_totals_by_day(date, date, uuid) from public, anon;
grant execute on function public.report_totals_by_member(date, date) to authenticated, service_role;
grant execute on function public.report_totals_by_day(date, date, uuid) to authenticated, service_role;
