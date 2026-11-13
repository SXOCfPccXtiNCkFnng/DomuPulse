-- Situação detalhada da visita (as cores da planilha): mensagem enviada,
-- confirmado, remarcado, não veio, não irá vir, visita feita.
-- O status de sempre (agendada/realizada/faltou/cancelada) acompanha sozinho:
-- escolher a situação ajusta o status, e mudar o status na Agenda ajusta a situação.

alter table public.appointments
  add column if not exists visit_stage text
  check (visit_stage in ('message_sent', 'confirmed', 'rescheduled', 'no_show', 'wont_come', 'visited'));

create or replace function private.sync_visit_stage()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.visit_stage is distinct from old.visit_stage then
    new.status := case new.visit_stage
      when 'visited' then 'done'
      when 'no_show' then 'no_show'
      when 'wont_come' then 'canceled'
      else 'scheduled'
    end::public.appointment_status;
  elsif new.status is distinct from old.status then
    new.visit_stage := case new.status
      when 'done' then 'visited'
      when 'no_show' then 'no_show'
      when 'canceled' then 'wont_come'
      else case
        when new.scheduled_at is distinct from old.scheduled_at then 'rescheduled'
        when old.visit_stage in ('message_sent', 'confirmed', 'rescheduled') then old.visit_stage
      end
    end;
  elsif new.scheduled_at is distinct from old.scheduled_at and new.status = 'scheduled' then
    new.visit_stage := 'rescheduled';
  end if;
  return new;
end
$$;

drop trigger if exists appointments_visit_stage on public.appointments;
create trigger appointments_visit_stage before update on public.appointments
  for each row execute function private.sync_visit_stage();

-- Quadro de visitas passa a devolver a situação.
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
  visit_stage text
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
    select a.id, a.member_id, a.client_name, a.client_phone, a.scheduled_at, a.status, a.region, a.visit_stage
    from public.appointments a
    where a.org_id = v_org and a.scheduled_at >= p_from and a.scheduled_at < p_to
    order by a.scheduled_at;
end
$$;

revoke all on function public.visits_board(timestamptz, timestamptz) from public, anon;
grant execute on function public.visits_board(timestamptz, timestamptz) to authenticated;

-- Quem já tinha visita fechada ganha a situação equivalente.
update public.appointments
set visit_stage = case status when 'done' then 'visited' when 'no_show' then 'no_show' when 'canceled' then 'wont_come' end
where visit_stage is null and status <> 'scheduled';

notify pgrst, 'reload schema';
