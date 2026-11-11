-- Alçada Comercial | Consulta rápida — Diretoria Tubarões (base: alçada de 05/11/2026).
-- Cadastra na organização 3298cbb5-d0ab-4171-a371-94c10e6b43dd um imóvel para cada
-- empreendimento + tipologia da alçada (23 no total), como os blocos do PDF:
--   01 Studio 24 m² (9) · 02 1 dormitório + office (8) · 03 1 dormitório (3) · 04 2 dormitórios (3)
-- O nome é o do empreendimento e o Tipo é a tipologia, igual ao PDF.
--
-- Requer as migrações 20261112000000_property_details.sql e 20261113000000_property_pricing.sql.
-- Pode rodar de novo sem duplicar. Para cada empreendimento + tipologia:
--   1. se já existe imóvel com esse nome (ignorando acentos e maiúsculas) e esse Tipo, ele é atualizado;
--   2. senão, um imóvel antigo com esse nome e Tipo fora da alçada (ex.: "Apartamento" ou
--      "Studio 24 m² e 2 dormitórios", da versão anterior) é reaproveitado;
--   3. senão, o imóvel é criado.
-- Endereço, % pós-chaves, observações e as opções de quartos já preenchidas (da mesma
-- quantidade de quartos da tipologia) são mantidos.
--
-- Critério da alçada: renda real do cliente (não a renda apurada no SICAQ).
-- price_cents = menor valor final da tipologia; guaranteed_cents = menor garantido.

begin;

create temp table _alcada on commit drop as
with
addon(a) as (
  -- Adicional por andar (1 dormitório + office e 1 dormitório): até o 5º valor base.
  values ('[{"from": 6, "to": 10, "add_cents": 500000},
            {"from": 11, "to": 15, "add_cents": 1000000},
            {"from": 16, "to": 20, "add_cents": 1500000}]'::jsonb)
),
cond(id, c) as (
  values
    -- 01 STUDIO 24 m²
    ('studio_abaixo_2800', jsonb_build_object(
      'typology', 'Studio 24 m²', 'income_from_cents', null, 'income_below_cents', 280000,
      'floor_from', null, 'floor_to', null, 'guaranteed_cents', 17000000, 'final_cents', 20478700,
      'floor_addons', '[]'::jsonb, 'note', '1 fiador na hora')),
    ('studio_2800_160', jsonb_build_object(
      'typology', 'Studio 24 m²', 'income_from_cents', 280000, 'income_below_cents', null,
      'floor_from', null, 'floor_to', null, 'guaranteed_cents', 16000000, 'final_cents', 20478700,
      'floor_addons', '[]'::jsonb, 'note', null)),
    ('studio_2800_165', jsonb_build_object(
      'typology', 'Studio 24 m²', 'income_from_cents', 280000, 'income_below_cents', null,
      'floor_from', null, 'floor_to', null, 'guaranteed_cents', 16500000, 'final_cents', 20478700,
      'floor_addons', '[]'::jsonb, 'note', null)),
    ('studio_3201', jsonb_build_object(
      'typology', 'Studio 24 m²', 'income_from_cents', 320100, 'income_below_cents', null,
      'floor_from', null, 'floor_to', null, 'guaranteed_cents', 18000000, 'final_cents', 22500000,
      'floor_addons', '[]'::jsonb, 'note', null)),
    -- 02 1 DORMITÓRIO + OFFICE (projetos liberados)
    ('office_3201', jsonb_build_object(
      'typology', '1 dormitório + office', 'income_from_cents', 320100, 'income_below_cents', null,
      'floor_from', null, 'floor_to', null, 'guaranteed_cents', 19000000, 'final_cents', 24550000,
      'floor_addons', (select a from addon),
      'note', 'Acima de 30 m²: + R$ 10 mil no valor final, além do adicional de pavimento.')),
    -- 03 1 DORMITÓRIO
    ('1d_170', jsonb_build_object(
      'typology', '1 dormitório', 'income_from_cents', null, 'income_below_cents', null,
      'floor_from', null, 'floor_to', null, 'guaranteed_cents', 17000000, 'final_cents', 22050000,
      'floor_addons', (select a from addon), 'note', null)),
    ('1d_180', jsonb_build_object(
      'typology', '1 dormitório', 'income_from_cents', null, 'income_below_cents', null,
      'floor_from', null, 'floor_to', null, 'guaranteed_cents', 18000000, 'final_cents', 23050000,
      'floor_addons', (select a from addon), 'note', null)),
    ('1d_190', jsonb_build_object(
      'typology', '1 dormitório', 'income_from_cents', null, 'income_below_cents', null,
      'floor_from', null, 'floor_to', null, 'guaranteed_cents', 19000000, 'final_cents', 24050000,
      'floor_addons', (select a from addon), 'note', null)),
    -- 04 2 DORMITÓRIOS — Clube Guarapiranga (garantido R$ 220 mil)
    ('guara_2d_ate5', jsonb_build_object(
      'typology', '2 dormitórios', 'income_from_cents', null, 'income_below_cents', null,
      'floor_from', null, 'floor_to', 5, 'guaranteed_cents', 22000000, 'final_cents', 29950000,
      'floor_addons', '[]'::jsonb, 'note', null)),
    ('guara_2d_6a10', jsonb_build_object(
      'typology', '2 dormitórios', 'income_from_cents', null, 'income_below_cents', null,
      'floor_from', 6, 'floor_to', 10, 'guaranteed_cents', 22000000, 'final_cents', 30550000,
      'floor_addons', '[]'::jsonb, 'note', null)),
    ('guara_2d_11a15', jsonb_build_object(
      'typology', '2 dormitórios', 'income_from_cents', null, 'income_below_cents', null,
      'floor_from', 11, 'floor_to', 15, 'guaranteed_cents', 22000000, 'final_cents', 31050000,
      'floor_addons', '[]'::jsonb, 'note', null)),
    ('guara_2d_16a20', jsonb_build_object(
      'typology', '2 dormitórios', 'income_from_cents', null, 'income_below_cents', null,
      'floor_from', 16, 'floor_to', 20, 'guaranteed_cents', 22000000, 'final_cents', 32050000,
      'floor_addons', '[]'::jsonb, 'note', null)),
    -- 04 2 DORMITÓRIOS — Clube Aricanduva
    ('arica_2d_ate5', jsonb_build_object(
      'typology', '2 dormitórios', 'income_from_cents', null, 'income_below_cents', null,
      'floor_from', null, 'floor_to', 5, 'guaranteed_cents', 20000000, 'final_cents', 26050000,
      'floor_addons', '[]'::jsonb, 'note', null)),
    ('arica_2d_6a9', jsonb_build_object(
      'typology', '2 dormitórios', 'income_from_cents', null, 'income_below_cents', null,
      'floor_from', 6, 'floor_to', 9, 'guaranteed_cents', 20500000, 'final_cents', 26550000,
      'floor_addons', '[]'::jsonb, 'note', null)),
    -- 04 2 DORMITÓRIOS — Estação Sapopemba
    ('sapo_2d_ate5', jsonb_build_object(
      'typology', '2 dormitórios', 'income_from_cents', null, 'income_below_cents', null,
      'floor_from', null, 'floor_to', 5, 'guaranteed_cents', 20000000, 'final_cents', 26550000,
      'floor_addons', '[]'::jsonb, 'note', null)),
    ('sapo_2d_11a20', jsonb_build_object(
      'typology', '2 dormitórios', 'income_from_cents', null, 'income_below_cents', null,
      'floor_from', 11, 'floor_to', 20, 'guaranteed_cents', 21000000, 'final_cents', 27550000,
      'floor_addons', '[]'::jsonb, 'note', null))
),
-- Um imóvel por empreendimento + tipologia, na ordem do PDF.
src(ord, title, kind, conds, bedrooms, area_m2) as (
  values
    -- 01 STUDIO 24 m²
    (1,  'VIVA CAMPO LIMPO',        'Studio 24 m²', array['studio_abaixo_2800', 'studio_2800_160'], 1, 24),
    (2,  'BOSQUE GIOVANNI GRONCHI', 'Studio 24 m²', array['studio_abaixo_2800', 'studio_2800_160'], 1, 24),
    (3,  'CLUBE CANGAÍBA',          'Studio 24 m²', array['studio_abaixo_2800', 'studio_2800_160'], 1, 24),
    (4,  'CLUBE VILA DAS BELEZAS',  'Studio 24 m²', array['studio_abaixo_2800', 'studio_2800_165'], 1, 24),
    (5,  'ESTAÇÃO SAPOPEMBA',       'Studio 24 m²', array['studio_2800_160'], 1, 24),
    (6,  'CLUBE ARICANDUVA',        'Studio 24 m²', array['studio_2800_165'], 1, 24),
    (7,  'CLUBE GUARAPIRANGA',      'Studio 24 m²', array['studio_2800_165'], 1, 24),
    (8,  'PRIME SANTANA',           'Studio 24 m²', array['studio_3201'], 1, 24),
    (9,  'PRIME ALTO DO IPIRANGA',  'Studio 24 m²', array['studio_3201'], 1, 24),
    -- 02 1 DORMITÓRIO + OFFICE
    (10, 'CLUBE ANÁLIA FRANCO',     '1 dormitório + office', array['office_3201'], 1, null),
    (11, 'VILA CARRÃO',             '1 dormitório + office', array['office_3201'], 1, null),
    (12, 'VILA GUILHERME',          '1 dormitório + office', array['office_3201'], 1, null),
    (13, 'PARQUE INDEPENDÊNCIA',    '1 dormitório + office', array['office_3201'], 1, null),
    (14, 'PRIME SAÚDE',             '1 dormitório + office', array['office_3201'], 1, null),
    (15, 'ORATÓRIO',                '1 dormitório + office', array['office_3201'], 1, null),
    (16, 'ESTAÇÃO VILA TOLSTÓI',    '1 dormitório + office', array['office_3201'], 1, null),
    (17, 'AVENIDA VILA EMA',        '1 dormitório + office', array['office_3201'], 1, null),
    -- 03 1 DORMITÓRIO
    (18, 'PRIME SAPOPEMBA',         '1 dormitório', array['1d_170'], 1, null),
    (19, 'PRIME SAÚDE',             '1 dormitório', array['1d_180'], 1, null),
    (20, 'ALTO DA BOA VISTA',       '1 dormitório', array['1d_190'], 1, null),
    -- 04 2 DORMITÓRIOS
    (21, 'CLUBE GUARAPIRANGA',      '2 dormitórios', array['guara_2d_ate5', 'guara_2d_6a10', 'guara_2d_11a15', 'guara_2d_16a20'], 2, null),
    (22, 'CLUBE ARICANDUVA',        '2 dormitórios', array['arica_2d_ate5', 'arica_2d_6a9'], 2, null),
    (23, 'ESTAÇÃO SAPOPEMBA',       '2 dormitórios', array['sapo_2d_ate5', 'sapo_2d_11a20'], 2, null)
)
select
  s.ord, s.title, s.kind, s.bedrooms::smallint as bedrooms, s.area_m2::int as area_m2,
  upper(translate(s.title, 'ÁÀÂÃÉÊÍÓÔÕÚÜÇáàâãéêíóôõúüç', 'AAAAEEIOOOUUCaaaaeeiooouuc')) as key,
  p.pricing,
  (select min((x->>'final_cents')::bigint) from jsonb_array_elements(p.pricing) x) as price_cents,
  (select min((x->>'guaranteed_cents')::bigint) from jsonb_array_elements(p.pricing) x) as guaranteed_cents
from src s
cross join lateral (
  select jsonb_agg(c.c order by u.ord) as pricing
  from unnest(s.conds) with ordinality u(id, ord)
  join cond c on c.id = u.id
) p;

do $$
declare
  v_org constant uuid := '3298cbb5-d0ab-4171-a371-94c10e6b43dd';
  v_kinds constant text[] := array['Studio 24 m²', '1 dormitório + office', '1 dormitório', '2 dormitórios'];
  r record;
  v_id uuid;
  v_layouts jsonb;
begin
  for r in select * from _alcada order by ord loop
    -- 1. mesmo nome e mesmo Tipo
    select id into v_id from public.properties
    where org_id = v_org
      and upper(translate(trim(title), 'ÁÀÂÃÉÊÍÓÔÕÚÜÇáàâãéêíóôõúüç', 'AAAAEEIOOOUUCaaaaeeiooouuc')) = r.key
      and kind = r.kind
    order by created_at
    limit 1;

    -- 2. mesmo nome com Tipo antigo (fora das tipologias da alçada)
    if v_id is null then
      select id into v_id from public.properties
      where org_id = v_org
        and upper(translate(trim(title), 'ÁÀÂÃÉÊÍÓÔÕÚÜÇáàâãéêíóôõúüç', 'AAAAEEIOOOUUCaaaaeeiooouuc')) = r.key
        and (kind is null or not (kind = any (v_kinds)))
      order by created_at
      limit 1;
    end if;

    if v_id is null then
      insert into public.properties
        (org_id, title, kind, deal, city, price_cents, guaranteed_cents, bedrooms, area_m2, layouts, status, pricing, pricing_date)
      values
        (v_org, r.title, r.kind, 'venda', 'São Paulo', r.price_cents, r.guaranteed_cents, r.bedrooms, r.area_m2,
         jsonb_build_array(jsonb_build_object('bedrooms', r.bedrooms, 'area_m2', r.area_m2)),
         'available', r.pricing, date '2026-11-05');
    else
      -- Mantém as opções de quartos já preenchidas com a mesma quantidade de quartos da tipologia.
      select coalesce(jsonb_agg(l), '[]'::jsonb) into v_layouts
      from public.properties t, jsonb_array_elements(t.layouts) l
      where t.id = v_id and (l->>'bedrooms')::int is not distinct from r.bedrooms::int;
      if v_layouts = '[]'::jsonb then
        v_layouts := jsonb_build_array(jsonb_build_object('bedrooms', r.bedrooms, 'area_m2', r.area_m2));
      end if;

      update public.properties
      set kind = r.kind,
          city = coalesce(city, 'São Paulo'),
          price_cents = r.price_cents,
          guaranteed_cents = r.guaranteed_cents,
          pricing = r.pricing,
          pricing_date = date '2026-11-05',
          layouts = v_layouts,
          bedrooms = (select min((l->>'bedrooms')::smallint) from jsonb_array_elements(v_layouts) l),
          area_m2 = (select min((l->>'area_m2')::int) from jsonb_array_elements(v_layouts) l)
      where id = v_id;
    end if;
  end loop;
end
$$;

commit;

-- Conferência: deve listar 23 imóveis (empreendimento + tipologia) com a quantidade de condições.
select title, kind, price_cents / 100 as valor_a_partir_de, guaranteed_cents / 100 as menor_garantido,
       jsonb_array_length(pricing) as condicoes, neighborhood, area_m2
from public.properties
where org_id = '3298cbb5-d0ab-4171-a371-94c10e6b43dd'
order by title, kind;
