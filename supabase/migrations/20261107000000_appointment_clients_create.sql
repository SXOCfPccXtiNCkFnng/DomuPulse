-- Visitas antigas da agenda (de antes do vínculo com a carteira) que ficaram
-- sem cliente: cria o cliente para o corretor da visita e liga a visita a ele,
-- em todas as empresas. Idempotente: só mexe em visitas ainda sem cliente.
--
-- 1) Primeiro liga ao cliente que já existe com o mesmo telefone (mesmo corretor).
-- 2) O que sobrar vira cliente novo: um por corretor + telefone (ou + nome, se
--    a visita não tem telefone), para não duplicar quem teve várias visitas.
--    Etapa: "Visitou" se alguma visita foi realizada; "Visita agendada" se
--    ainda tem visita marcada; senão "Em conversa".

update public.appointments a
set client_id = c.id
from public.clients c
where a.client_id is null
  and a.org_id = c.org_id
  and a.member_id = c.member_id
  and a.client_phone is not null
  and length(regexp_replace(a.client_phone, '\D', '', 'g')) >= 8
  and regexp_replace(a.client_phone, '\D', '', 'g') = regexp_replace(coalesce(c.phone, ''), '\D', '', 'g');

do $$
declare
  r record;
  new_id uuid;
begin
  for r in
    with orphans as (
      select
        a.org_id,
        a.member_id,
        left(btrim(a.client_name), 120) as name,
        case when a.client_phone ~ '^[0-9+() -]{8,20}$' then a.client_phone end as phone,
        a.status,
        a.scheduled_at,
        case
          when length(regexp_replace(coalesce(a.client_phone, ''), '\D', '', 'g')) >= 8
            then 'p:' || regexp_replace(a.client_phone, '\D', '', 'g')
          else 'n:' || lower(btrim(a.client_name))
        end as k
      from public.appointments a
      where a.client_id is null
        and btrim(coalesce(a.client_name, '')) <> ''
    )
    select
      org_id,
      member_id,
      k,
      (array_agg(name order by scheduled_at desc))[1] as name,
      (array_agg(phone order by scheduled_at desc) filter (where phone is not null))[1] as phone,
      case
        when bool_or(status = 'done') then 'visited'
        when bool_or(status = 'scheduled') then 'scheduled'
        else 'talking'
      end as stage,
      least(min(scheduled_at), now()) as first_at
    from orphans
    group by org_id, member_id, k
  loop
    insert into public.clients (org_id, member_id, name, phone, stage, created_at, stage_changed_at)
    values (r.org_id, r.member_id, r.name, r.phone, r.stage::public.client_stage, r.first_at, r.first_at)
    returning id into new_id;

    update public.appointments a
    set client_id = new_id
    where a.client_id is null
      and a.org_id = r.org_id
      and a.member_id = r.member_id
      and btrim(coalesce(a.client_name, '')) <> ''
      and case
            when length(regexp_replace(coalesce(a.client_phone, ''), '\D', '', 'g')) >= 8
              then 'p:' || regexp_replace(a.client_phone, '\D', '', 'g')
            else 'n:' || lower(btrim(a.client_name))
          end = r.k;
  end loop;
end
$$;
