-- Marca visitas cuja data é aproximada (vieram da planilha só com o dia da
-- semana, sem data real). Na tela, elas aparecem como "sem data".
alter table public.appointments add column if not exists date_approx boolean not null default false;

-- A função das visitas passa a devolver date_approx também.
drop function if exists public.visits_board(timestamptz, timestamptz);
create function public.visits_board(p_from timestamptz, p_to timestamptz)
returns table (
  id uuid,
  member_id uuid,
  client_name text,
  client_phone text,
  scheduled_at timestamptz,
  status public.appointment_status,
  region text,
  visit_stage text,
  date_approx boolean
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_org uuid := private.my_org_id();
begin
  if v_org is null or not private.mfa_ok() then
    return;
  end if;
  if p_to <= p_from or p_to - p_from > interval '62 days' then
    raise exception 'Período inválido.';
  end if;
  return query
    select a.id, a.member_id, a.client_name, a.client_phone, a.scheduled_at, a.status, a.region, a.visit_stage, a.date_approx
    from public.appointments a
    where a.org_id = v_org and a.scheduled_at >= p_from and a.scheduled_at < p_to
    order by a.scheduled_at;
end
$$;
revoke all on function public.visits_board(timestamptz, timestamptz) from public, anon;
grant execute on function public.visits_board(timestamptz, timestamptz) to authenticated;

notify pgrst, 'reload schema';
