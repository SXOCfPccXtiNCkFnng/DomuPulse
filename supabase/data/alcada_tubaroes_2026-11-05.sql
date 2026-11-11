-- Alçada Comercial | Consulta rápida — Diretoria Tubarões (base: alçada de 05/11/2026).
-- Cadastra os 19 empreendimentos da alçada na organização 3298cbb5-d0ab-4171-a371-94c10e6b43dd.
--
-- Requer as migrações 20261112000000_property_details.sql e 20261113000000_property_pricing.sql.
-- Pode rodar de novo sem duplicar: empreendimento que já existe (mesmo nome, ignorando
-- acentos e maiúsculas) é atualizado; os demais são criados. Nos que já existem, endereço,
-- opções de quartos, % pós-chaves e observações são mantidos.
--
-- Critério da alçada: renda real do cliente (não a renda apurada no SICAQ).
-- price_cents = menor valor final da alçada; guaranteed_cents = menor garantido.

begin;

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
-- Empreendimento -> condições da alçada (na ordem do PDF) e opções de quartos.
src(title, conds, layouts) as (
  values
    ('VIVA CAMPO LIMPO',        array['studio_abaixo_2800', 'studio_2800_160'], '[{"bedrooms": 1, "area_m2": 24}]'),
    ('BOSQUE GIOVANNI GRONCHI', array['studio_abaixo_2800', 'studio_2800_160'], '[{"bedrooms": 1, "area_m2": 24}]'),
    ('CLUBE CANGAÍBA',          array['studio_abaixo_2800', 'studio_2800_160'], '[{"bedrooms": 1, "area_m2": 24}]'),
    ('CLUBE VILA DAS BELEZAS',  array['studio_abaixo_2800', 'studio_2800_165'], '[{"bedrooms": 1, "area_m2": 24}]'),
    ('ESTAÇÃO SAPOPEMBA',       array['studio_2800_160', 'sapo_2d_ate5', 'sapo_2d_11a20'],
                                '[{"bedrooms": 1, "area_m2": 24}, {"bedrooms": 2, "area_m2": null}]'),
    ('CLUBE ARICANDUVA',        array['studio_2800_165', 'arica_2d_ate5', 'arica_2d_6a9'],
                                '[{"bedrooms": 1, "area_m2": 24}, {"bedrooms": 2, "area_m2": null}]'),
    ('CLUBE GUARAPIRANGA',      array['studio_2800_165', 'guara_2d_ate5', 'guara_2d_6a10', 'guara_2d_11a15', 'guara_2d_16a20'],
                                '[{"bedrooms": 1, "area_m2": 24}, {"bedrooms": 2, "area_m2": null}]'),
    ('PRIME SANTANA',           array['studio_3201'], '[{"bedrooms": 1, "area_m2": 24}]'),
    ('PRIME ALTO DO IPIRANGA',  array['studio_3201'], '[{"bedrooms": 1, "area_m2": 24}]'),
    ('CLUBE ANÁLIA FRANCO',     array['office_3201'], '[{"bedrooms": 1, "area_m2": null}]'),
    ('VILA CARRÃO',             array['office_3201'], '[{"bedrooms": 1, "area_m2": null}]'),
    ('VILA GUILHERME',          array['office_3201'], '[{"bedrooms": 1, "area_m2": null}]'),
    ('PARQUE INDEPENDÊNCIA',    array['office_3201'], '[{"bedrooms": 1, "area_m2": null}]'),
    ('PRIME SAÚDE',             array['office_3201', '1d_180'], '[{"bedrooms": 1, "area_m2": null}]'),
    ('ORATÓRIO',                array['office_3201'], '[{"bedrooms": 1, "area_m2": null}]'),
    ('ESTAÇÃO VILA TOLSTÓI',    array['office_3201'], '[{"bedrooms": 1, "area_m2": null}]'),
    ('AVENIDA VILA EMA',        array['office_3201'], '[{"bedrooms": 1, "area_m2": null}]'),
    ('PRIME SAPOPEMBA',         array['1d_170'], '[{"bedrooms": 1, "area_m2": null}]'),
    ('ALTO DA BOA VISTA',       array['1d_190'], '[{"bedrooms": 1, "area_m2": null}]')
),
calc as (
  select
    s.title,
    upper(translate(trim(s.title), 'ÁÀÂÃÉÊÍÓÔÕÚÜÇáàâãéêíóôõúüç', 'AAAAEEIOOOUUCaaaaeeiooouuc')) as key,
    s.layouts::jsonb as layouts,
    p.pricing,
    (select min((x->>'final_cents')::bigint) from jsonb_array_elements(p.pricing) x) as price_cents,
    (select min((x->>'guaranteed_cents')::bigint) from jsonb_array_elements(p.pricing) x) as guaranteed_cents,
    (select min((l->>'bedrooms')::smallint) from jsonb_array_elements(s.layouts::jsonb) l) as bedrooms,
    (select min((l->>'area_m2')::int) from jsonb_array_elements(s.layouts::jsonb) l) as area_m2
  from src s
  cross join lateral (
    select jsonb_agg(c.c order by u.ord) as pricing
    from unnest(s.conds) with ordinality u(id, ord)
    join cond c on c.id = u.id
  ) p
),
upd as (
  update public.properties t
  set pricing = c.pricing,
      pricing_date = date '2026-11-05',
      price_cents = c.price_cents,
      guaranteed_cents = c.guaranteed_cents,
      kind = coalesce(t.kind, 'Apartamento'),
      city = coalesce(t.city, 'São Paulo'),
      layouts = case when t.layouts = '[]'::jsonb then c.layouts else t.layouts end,
      bedrooms = case when t.layouts = '[]'::jsonb then c.bedrooms else t.bedrooms end,
      area_m2 = case when t.layouts = '[]'::jsonb then c.area_m2 else t.area_m2 end
  from calc c
  where t.org_id = '3298cbb5-d0ab-4171-a371-94c10e6b43dd'
    and upper(translate(trim(t.title), 'ÁÀÂÃÉÊÍÓÔÕÚÜÇáàâãéêíóôõúüç', 'AAAAEEIOOOUUCaaaaeeiooouuc')) = c.key
  returning c.key
)
insert into public.properties
  (org_id, title, kind, deal, city, price_cents, guaranteed_cents, bedrooms, area_m2, layouts, status, pricing, pricing_date)
select
  '3298cbb5-d0ab-4171-a371-94c10e6b43dd', c.title, 'Apartamento', 'venda', 'São Paulo',
  c.price_cents, c.guaranteed_cents, c.bedrooms, c.area_m2, c.layouts, 'available', c.pricing, date '2026-11-05'
from calc c
where c.key not in (select key from upd);

commit;

-- Conferência: deve listar os 19 empreendimentos com a quantidade de condições de cada um.
select title, price_cents / 100 as valor_a_partir_de, guaranteed_cents / 100 as menor_garantido,
       jsonb_array_length(pricing) as condicoes, pricing_date
from public.properties
where org_id = '3298cbb5-d0ab-4171-a371-94c10e6b43dd'
order by title;
