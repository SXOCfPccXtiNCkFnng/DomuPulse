-- Ajuste da semana 12/11 a 18/11 para bater com o quadro da planilha ("NOVEMBRO 2").
--
-- Rode no SQL Editor DEPOIS de visitas_planilha_2026-11.sql.
-- Onde o quadro tem mais visitas do que o sistema, cria visitas
-- "Cliente da planilha (sem nome)" no dia certo (12h, sem telefone, sem cliente
-- na carteira), para o corretor completar depois. Onde o sistema tem a mais,
-- nada é mexido. Nunca passa do total do corretor no quadro.
-- Pode rodar de novo: conta o que já existe e não duplica.
-- França e Orlando ficam de fora (sem conta no sistema).

with
org as (
  select o.id, coalesce(o.timezone, 'America/Sao_Paulo') as tz
  from public.organizations o
  where o.id = '3298cbb5-d0ab-4171-a371-94c10e6b43dd'
),
-- Quadro da planilha: corretor, dia, quantidade.
alvo (member_id, dia, qtd) as (
  values
    ('8a919129-dd8f-4b14-9536-f47de9f34470'::uuid, date '2026-11-14', 3), -- DUDA
    ('8a919129-dd8f-4b14-9536-f47de9f34470'::uuid, date '2026-11-15', 2),
    ('8a919129-dd8f-4b14-9536-f47de9f34470'::uuid, date '2026-11-16', 1),
    ('e6864f23-cd4f-442f-9333-93398b61d18c'::uuid, date '2026-11-12', 1), -- FÁBIO
    ('e6864f23-cd4f-442f-9333-93398b61d18c'::uuid, date '2026-11-13', 1),
    ('fb8c1a1b-9375-4c3f-8704-62a30f220130'::uuid, date '2026-11-14', 3), -- FALCONE
    ('fb8c1a1b-9375-4c3f-8704-62a30f220130'::uuid, date '2026-11-15', 2),
    ('ca3d9eb7-f13c-4b81-b068-579d9d897fd3'::uuid, date '2026-11-12', 1), -- GUERRA
    ('ca3d9eb7-f13c-4b81-b068-579d9d897fd3'::uuid, date '2026-11-14', 2),
    ('ca3d9eb7-f13c-4b81-b068-579d9d897fd3'::uuid, date '2026-11-17', 1),
    ('f5b11527-bd11-4bb9-b636-d9b5f946da0e'::uuid, date '2026-11-14', 2), -- HONÓRIO
    ('f5b11527-bd11-4bb9-b636-d9b5f946da0e'::uuid, date '2026-11-15', 1),
    ('f5b11527-bd11-4bb9-b636-d9b5f946da0e'::uuid, date '2026-11-16', 1),
    ('ebde4ebe-dcfa-4de2-b4d4-74b17be67e2c'::uuid, date '2026-11-12', 2), -- JOELICE
    ('ebde4ebe-dcfa-4de2-b4d4-74b17be67e2c'::uuid, date '2026-11-13', 1),
    ('ebde4ebe-dcfa-4de2-b4d4-74b17be67e2c'::uuid, date '2026-11-14', 5),
    ('ebde4ebe-dcfa-4de2-b4d4-74b17be67e2c'::uuid, date '2026-11-15', 2),
    ('ebde4ebe-dcfa-4de2-b4d4-74b17be67e2c'::uuid, date '2026-11-16', 1),
    ('c3c66199-c794-41a2-9932-bf3447e99b12'::uuid, date '2026-11-14', 2), -- PALÁCIO
    ('c3c66199-c794-41a2-9932-bf3447e99b12'::uuid, date '2026-11-15', 3),
    ('9c87f453-42fd-4017-8ec7-1c4758837f46'::uuid, date '2026-11-14', 2)  -- SILVA
),
atual as (
  select a.member_id, (a.scheduled_at at time zone org.tz)::date as dia, count(*)::int as n
  from public.appointments a, org
  where a.org_id = org.id
    and a.scheduled_at >= (timestamp '2026-11-12 00:00' at time zone org.tz)
    and a.scheduled_at <  (timestamp '2026-11-19 00:00' at time zone org.tz)
  group by 1, 2
),
-- Quanto ainda cabe no total de cada corretor.
folga as (
  select m.member_id,
         greatest(m.total - coalesce((select sum(n) from atual x where x.member_id = m.member_id), 0), 0) as falta
  from (select member_id, sum(qtd)::int as total from alvo group by member_id) m
),
vagas as (
  select a.member_id, a.dia, g.k,
         row_number() over (partition by a.member_id order by a.dia, g.k) as ordem
  from alvo a
  left join atual t on t.member_id = a.member_id and t.dia = a.dia
  cross join lateral generate_series(1, greatest(a.qtd - coalesce(t.n, 0), 0)) as g(k)
)
insert into public.appointments (org_id, member_id, client_name, scheduled_at, status, notes)
select org.id, v.member_id, 'Cliente da planilha (sem nome)',
       (v.dia + time '12:00') at time zone org.tz, 'scheduled',
       'Importado da planilha de agendamentos; criado para bater o quadro da semana (a planilha não tinha o nome nem o horário)'
from vagas v
join folga f on f.member_id = v.member_id
cross join org
where v.ordem <= f.falta
  and exists (select 1 from public.members m where m.id = v.member_id and m.org_id = org.id);

-- Resultado: quadro da semana por corretor, para conferir com a planilha.
select m.display_name as corretor,
       count(*) filter (where (a.scheduled_at at time zone o.tz)::date = date '2026-11-12') as qui,
       count(*) filter (where (a.scheduled_at at time zone o.tz)::date = date '2026-11-13') as sex,
       count(*) filter (where (a.scheduled_at at time zone o.tz)::date = date '2026-11-14') as sab,
       count(*) filter (where (a.scheduled_at at time zone o.tz)::date = date '2026-11-15') as dom,
       count(*) filter (where (a.scheduled_at at time zone o.tz)::date = date '2026-11-16') as seg,
       count(*) filter (where (a.scheduled_at at time zone o.tz)::date = date '2026-11-17') as ter,
       count(*) filter (where (a.scheduled_at at time zone o.tz)::date = date '2026-11-18') as qua,
       count(*) as total
from public.appointments a
join public.members m on m.id = a.member_id
cross join (select coalesce(timezone, 'America/Sao_Paulo') as tz from public.organizations where id = '3298cbb5-d0ab-4171-a371-94c10e6b43dd') o
where a.org_id = '3298cbb5-d0ab-4171-a371-94c10e6b43dd'
  and a.scheduled_at >= (timestamp '2026-11-12 00:00' at time zone o.tz)
  and a.scheduled_at <  (timestamp '2026-11-19 00:00' at time zone o.tz)
group by m.display_name
order by m.display_name;
