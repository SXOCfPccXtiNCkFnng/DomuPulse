-- Visitas de novembro/2026 da "PLANILHA DE AGENDAMENTOS" para a tela Visitas.
--
-- Rode no SQL Editor do Supabase DEPOIS de 20261116000000_visits_board.sql.
-- Pode rodar de novo: não duplica visitas nem clientes.
--
-- A planilha só tem o dia da semana; a data saiu da cor da linha:
--   vermelho  (não veio)  -> semana 05/11 a 11/11, situação "não compareceu"
--   verde     (visitou)   -> semana 05/11 a 11/11, situação "realizada"
--   branco / verde-escuro -> semana atual 12/11 a 18/11, situação "agendada"
-- Ficou de fora "Silvio Construtor" (sem corretor na planilha).

begin;

-- 1) Apelido da planilha -> conta do corretor (members.id).
create temp table _corretor (apelido text primary key, member_id uuid) on commit drop;
insert into _corretor (apelido, member_id) values
  ('DUDA',    '8a919129-dd8f-4b14-9536-f47de9f34470'),
  ('FABIO',   'e6864f23-cd4f-442f-9333-93398b61d18c'),
  ('FALCONE', 'fb8c1a1b-9375-4c3f-8704-62a30f220130'),
  ('FRANCA',  null), -- ainda sem conta: as visitas dele ficam de fora
  ('GUERRA',  'ca3d9eb7-f13c-4b81-b068-579d9d897fd3'),
  ('HONORIO', 'f5b11527-bd11-4bb9-b636-d9b5f946da0e'),
  ('JOELICE', 'ebde4ebe-dcfa-4de2-b4d4-74b17be67e2c'),
  ('ORLANDO', null), -- ainda sem conta: as visitas dele ficam de fora
  ('PALACIO', 'c3c66199-c794-41a2-9932-bf3447e99b12'),
  ('SILVA',   '9c87f453-42fd-4017-8ec7-1c4758837f46');

-- 2) Visitas (apelido, cliente, telefone, data/hora local, região, situação, observação).
create temp table _visita (
  apelido text, nome text, telefone text, quando timestamp, regiao text,
  situacao public.appointment_status, obs text
) on commit drop;
insert into _visita values
  ('FRANCA', 'André luiz', '(11) 92099-6512', '2026-11-07 10:00', 'Zona Oeste', 'no_show', null),
  ('FRANCA', 'Francisco Rodrigues', '(11) 94077-9284', '2026-11-07 14:30', 'Zona Leste', 'no_show', null),
  ('PALACIO', 'Fernanda', '(11) 99314-6429', '2026-11-08 12:00', 'Zona Oeste', 'no_show', null),
  ('JOELICE', 'Antonio', '(11) 95194-1982', '2026-11-09 10:30', 'Zona Norte', 'no_show', null),
  ('JOELICE', 'Tiago dos santos', '(11) 95970-6634', '2026-11-09 10:30', 'Zona Sul', 'no_show', null),
  ('JOELICE', 'Fernando', '(11) 93229-8303', '2026-11-09 10:30', 'Sem preferência', 'no_show', null),
  ('JOELICE', 'Carlos michel', '(11) 93393-0619', '2026-11-09 11:00', 'Outras regiões', 'no_show', null),
  ('JOELICE', 'Elizabete', '(11) 97607-8753', '2026-11-09 15:00', 'Outras regiões', 'no_show', 'Região: Jundiaí'),
  ('JOELICE', 'Ester Oliveira', '(11) 99368-0937', '2026-11-09 15:30', 'Outras regiões', 'no_show', 'Região: ABC'),
  ('JOELICE', 'Antonio', '(11) 97642-4106', '2026-11-09 16:00', 'Zona Leste', 'no_show', null),
  ('JOELICE', 'Rita', '(11) 99923-4273', '2026-11-08 14:00', 'Zona Leste', 'no_show', null),
  ('JOELICE', 'Silvana Domingues', '(11) 99320-0423', '2026-11-07 15:30', 'Zona Norte', 'no_show', null),
  ('JOELICE', 'Irene', '(11) 97899-1550', '2026-11-08 14:30', 'Outras regiões', 'no_show', 'Região: Guarulhos'),
  ('JOELICE', 'Alan', '(11) 98835-3790', '2026-11-09 18:00', 'Zona Sul', 'done', null),
  ('HONORIO', 'Mislene Aquino', '(11) 96706-7118', '2026-11-08 10:00', 'Zona Sul', 'no_show', null),
  ('HONORIO', 'JACKELINE', '(11) 96134-9262', '2026-11-07 17:00', 'Outras regiões', 'no_show', 'Região: ABC'),
  ('HONORIO', 'ELISEU', '(11) 99977-5357', '2026-11-07 14:00', 'Outras regiões', 'no_show', 'Região: Guarulhos'),
  ('PALACIO', 'marcos', '(11) 97728-8896', '2026-11-06 09:00', 'Zona Leste', 'done', null),
  ('FALCONE', 'Vanessa', '(11) 98502-3855', '2026-11-07 11:00', 'Outras regiões', 'done', 'Região: Osasco'),
  ('JOELICE', 'Emilly', '(11) 96564-0978', '2026-11-07 14:00', 'Zona Leste', 'no_show', null),
  ('ORLANDO', 'alexandre', '(81) 9106-5874', '2026-11-08 09:00', 'Zona Leste', 'done', null),
  ('JOELICE', 'Renato', '(11) 98624-4788', '2026-11-08 10:30', 'Sem preferência', 'no_show', null),
  ('JOELICE', 'Ivone', '(11) 99299-0174', '2026-11-08 15:00', 'Zona Oeste', 'no_show', null),
  ('GUERRA', 'VALDECY', '(11) 94942-1494', '2026-11-07 11:10', 'Sem preferência', 'no_show', null),
  ('PALACIO', 'marcos', '(11) 99430-5802', '2026-11-07 16:00', 'Outras regiões', 'done', 'Região: Guarulhos'),
  ('JOELICE', 'Fatiam', '(11) 96102-1150', '2026-11-09 18:30', 'Zona Leste', 'no_show', null),
  ('FRANCA', 'André luiz', '(11) 92099-6512', '2026-11-11 14:00', 'Zona Oeste', 'done', null),
  ('JOELICE', 'peter Alves', '(11) 94744-8479', '2026-11-10 20:00', 'Zona Sul', 'no_show', null),
  ('JOELICE', 'Jurandir', '(11) 99695-8349', '2026-11-10 15:00', 'Sem preferência', 'no_show', null),
  ('JOELICE', 'Marlete', '(11) 97297-6124', '2026-11-11 12:00', 'Sem preferência', 'no_show', null),
  ('JOELICE', 'Ritchelly', '(11) 93087-2867', '2026-11-11 15:30', 'Zona Sul', 'no_show', null),
  ('ORLANDO', 'maria bastos', '(11) 98221-2703', '2026-11-09 13:00', 'Sem preferência', 'no_show', null),
  ('ORLANDO', 'fran', '(11) 91336-3487', '2026-11-09 11:00', null, 'no_show', null),
  ('ORLANDO', 'Nina', '(11) 97603-6608', '2026-11-09 11:30', null, 'no_show', null),
  ('HONORIO', 'ERICA', '(11) 95422-2052', '2026-11-09 11:00', null, 'done', null),
  ('ORLANDO', 'maria', '(11) 98334-2527', '2026-11-10 10:30', 'Zona Leste', 'no_show', null),
  ('ORLANDO', 'william', '(11) 97640-7592', '2026-11-10 10:30', null, 'no_show', null),
  ('PALACIO', 'francisco', '(11) 94608-7712', '2026-11-08 17:00', 'Zona Norte', 'done', null),
  ('FRANCA', 'paulo', '(11) 99642-1065', '2026-11-11 10:20', 'Zona Sul', 'done', null),
  ('FRANCA', 'Amanda Bezerra', '(11) 93962-8671', '2026-11-14 15:00', 'Zona Leste', 'scheduled', null),
  ('DUDA', 'Oscar', '(11) 93936-5162', '2026-11-14 10:30', 'Sem preferência', 'scheduled', null),
  ('DUDA', 'Caio', '(11) 99392-2352', '2026-11-14 11:30', 'Sem preferência', 'scheduled', null),
  ('DUDA', 'Paulo', '(11) 96446-5451', '2026-11-14 12:50', 'Sem preferência', 'scheduled', null),
  ('JOELICE', 'Sandra Nascimento', '(11) 97161-2107', '2026-11-14 15:00', 'Outras regiões', 'scheduled', 'Região: ABC'),
  ('JOELICE', 'Alisson', '(11) 96421-5958', '2026-11-12 20:20', null, 'scheduled', null),
  ('JOELICE', 'Ivany', '(11) 97291-6346', '2026-11-14 14:30', 'Zona Oeste', 'scheduled', null),
  ('GUERRA', 'joyce', '(11) 91669-9416', '2026-11-12 14:00', 'Outras regiões', 'scheduled', 'Região: ABC'),
  ('PALACIO', 'Tatiane', '(11) 96717-5045', '2026-11-14 15:30', 'Zona Sul', 'scheduled', null),
  ('JOELICE', 'Esmeralda', '(11) 96511-5928', '2026-11-13 16:30', 'Zona Norte', 'scheduled', null),
  ('PALACIO', 'Ritchelly', '(11) 93087-2867', '2026-11-12 15:30', null, 'scheduled', null),
  ('JOELICE', 'Sandra Nascimento', '(11) 97688-8883', '2026-11-15 13:00', 'Zona Leste', 'scheduled', null),
  ('ORLANDO', 'Thiago Lucas', '(11) 98742-8890', '2026-11-14 15:00', 'Zona Leste', 'scheduled', null),
  ('ORLANDO', 'MIGUEL', '(11) 95906-9408', '2026-11-14 15:00', null, 'scheduled', null),
  ('FRANCA', 'YESABET', '(11) 94874-2147', '2026-11-14 11:00', null, 'scheduled', null),
  ('FRANCA', 'Felipe', '(11) 94179-5237', '2026-11-15 10:30', 'Zona Leste', 'scheduled', null),
  ('FABIO', 'Sheila Dos Santos', '(11) 97634-4037', '2026-11-13 20:00', 'Zona Leste', 'scheduled', null),
  ('DUDA', 'Rosana', '(11) 95415-5944', '2026-11-14 11:30', 'Sem preferência', 'scheduled', null),
  ('FABIO', 'Ana', '(11) 93204-4169', '2026-11-12 14:30', 'Zona Leste', 'scheduled', null),
  ('SILVA', 'barbosa', '(11) 95651-9707', '2026-11-14 17:35', 'Zona Sul', 'scheduled', null),
  ('PALACIO', 'marcos', '(11) 95159-8674', '2026-11-15 11:00', 'Zona Leste', 'scheduled', null),
  ('PALACIO', 'Luena', '(11) 98752-0602', '2026-11-14 11:00', 'Zona Sul', 'scheduled', null),
  ('JOELICE', 'Samuel Rodrigues', '(11) 91181-9128', '2026-11-14 11:00', 'Outras regiões', 'scheduled', null),
  ('JOELICE', 'Jennyfer Machado', '(11) 98735-9082', '2026-11-15 15:00', 'Zona Norte', 'scheduled', null),
  ('FALCONE', 'Gabrielle', '(11) 94885-9575', '2026-11-15 10:00', 'Zona Oeste', 'scheduled', 'Região: Zona Oeste e ABC'),
  ('FRANCA', 'Priscila Maria', '(11) 96081-7049', '2026-11-14 14:30', 'Zona Sul', 'scheduled', null),
  ('FALCONE', 'Vitor', '(11) 96662-0497', '2026-11-15 10:00', 'Zona Norte', 'scheduled', null),
  ('JOELICE', 'Hudson Coelho', '(11) 96703-4294', '2026-11-15 10:30', 'Zona Norte', 'scheduled', null),
  ('JOELICE', 'Val Marques', '(11) 96033-3322', '2026-11-14 15:30', 'Outras regiões', 'scheduled', 'Região: ABC'),
  ('DUDA', 'lorenna', '(11) 95193-5566', '2026-11-15 13:15', 'Zona Leste', 'scheduled', null),
  ('DUDA', 'Fabio', '(11) 97991-1571', '2026-11-16 14:00', 'Sem preferência', 'scheduled', null),
  ('HONORIO', 'Vilma Santos', '(11) 95698-2787', '2026-11-15 10:30', 'Zona Leste', 'scheduled', null),
  ('HONORIO', 'Lucilene', '(11) 99277-6041', '2026-11-16 17:00', 'Zona Sul', 'scheduled', null),
  ('HONORIO', 'Hélio', '(11) 99717-1872', '2026-11-14 11:00', 'Zona Leste', 'scheduled', null);

-- 3) Confere a ligação antes de gravar qualquer coisa.
do $$
declare
  org constant uuid := '3298cbb5-d0ab-4171-a371-94c10e6b43dd';
  faltando text;
  fora text;
begin
  select string_agg(distinct v.apelido, ', ') into faltando
  from _visita v left join _corretor c using (apelido)
  where c.apelido is null;
  if faltando is not null then
    raise exception 'Apelido fora da lista de corretores: %', faltando;
  end if;

  select string_agg(c.apelido, ', ') into fora
  from _corretor c
  where c.member_id is not null
    and not exists (select 1 from public.members m where m.id = c.member_id and m.org_id = org);
  if fora is not null then
    raise exception 'Estes IDs não são da imobiliária: %', fora;
  end if;
end $$;

-- 4) Clientes: um por telefone na carteira de cada corretor (reaproveita quem já existe).
with g as (
  select
    c.member_id,
    regexp_replace(v.telefone, '\D', '', 'g') as digits,
    (array_agg(v.nome order by v.quando desc))[1] as nome,
    (array_agg(v.telefone order by v.quando desc))[1] as telefone,
    case
      when bool_or(v.situacao = 'done') then 'visited'
      when bool_or(v.situacao = 'scheduled') then 'scheduled'
      else 'talking'
    end::public.client_stage as stage
  from _visita v
  join _corretor c using (apelido)
  where v.telefone is not null and c.member_id is not null
  group by 1, 2
)
insert into public.clients (org_id, member_id, name, phone, source, stage)
select '3298cbb5-d0ab-4171-a371-94c10e6b43dd', g.member_id, g.nome, g.telefone, 'Planilha de agendamentos', g.stage
from g
where not exists (
  select 1 from public.clients k
  where k.member_id = g.member_id
    and regexp_replace(coalesce(k.phone, ''), '\D', '', 'g') = g.digits
);

-- 5) Visitas, ligadas ao cliente e ao corretor, no fuso da imobiliária.
with v as (
  select
    c.member_id,
    x.*,
    x.quando at time zone coalesce(
      (select o.timezone from public.organizations o where o.id = '3298cbb5-d0ab-4171-a371-94c10e6b43dd'),
      'America/Sao_Paulo'
    ) as em
  from _visita x
  join _corretor c using (apelido)
  where c.member_id is not null
)
insert into public.appointments (org_id, member_id, client_id, client_name, client_phone, scheduled_at, status, region, notes)
select
  '3298cbb5-d0ab-4171-a371-94c10e6b43dd',
  v.member_id,
  (
    select k.id from public.clients k
    where k.member_id = v.member_id
      and v.telefone is not null
      and regexp_replace(coalesce(k.phone, ''), '\D', '', 'g') = regexp_replace(v.telefone, '\D', '', 'g')
    order by k.created_at
    limit 1
  ),
  v.nome,
  v.telefone,
  v.em,
  v.situacao,
  v.regiao,
  concat_ws('; ', 'Importado da planilha de agendamentos', v.obs)
from v
where not exists (
  select 1 from public.appointments a
  where a.member_id = v.member_id
    and a.scheduled_at = v.em
    and lower(a.client_name) = lower(v.nome)
);

commit;

-- 6) Resumo do que entrou, por corretor.
select m.display_name as corretor, a.status, count(*) as visitas
from public.appointments a
join public.members m on m.id = a.member_id
where a.org_id = '3298cbb5-d0ab-4171-a371-94c10e6b43dd'
  and a.notes like 'Importado da planilha de agendamentos%'
group by 1, 2
order by 1, 2;
