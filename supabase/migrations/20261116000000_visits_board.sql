-- Visitas da semana (quinta a quarta): quadro da equipe toda, visível para
-- todos os membros da imobiliária. A agenda continua com o escopo de sempre
-- (corretor vê as dele); o quadro lê pelas funções abaixo.

-- Região da visita (Zona Leste, Zona Oeste, Sem preferência...).
alter table public.appointments
  add column if not exists region text check (char_length(region) between 1 and 40);

-- Visitas da imobiliária de quem chama, no intervalo (até 62 dias).
create or replace function public.visits_board(p_from timestamptz, p_to timestamptz)
returns table (
  id uuid,
  member_id uuid,
  client_name text,
  client_phone text,
  scheduled_at timestamptz,
  status public.appointment_status,
  region text
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
    select a.id, a.member_id, a.client_name, a.client_phone, a.scheduled_at, a.status, a.region
    from public.appointments a
    where a.org_id = v_org and a.scheduled_at >= p_from and a.scheduled_at < p_to
    order by a.scheduled_at;
end
$$;

-- Membros da imobiliária de quem chama (linhas do quadro: corretores ativos e
-- quem tiver visita na semana).
create or replace function public.visits_board_brokers()
returns table (id uuid, name text, active boolean, is_broker boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_org uuid := private.my_org_id();
begin
  if v_org is null or not private.mfa_ok() then
    return;
  end if;
  return query
    select m.id, m.display_name, m.active, m.role = 'broker'
    from public.members m
    where m.org_id = v_org
    order by m.display_name;
end
$$;

revoke all on function public.visits_board(timestamptz, timestamptz) from public, anon;
revoke all on function public.visits_board_brokers() from public, anon;
grant execute on function public.visits_board(timestamptz, timestamptz) to authenticated;
grant execute on function public.visits_board_brokers() to authenticated;

notify pgrst, 'reload schema';
