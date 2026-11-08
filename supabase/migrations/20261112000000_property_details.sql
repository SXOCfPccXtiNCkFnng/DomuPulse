-- Imóveis: opções de quartos (ex.: 2 quartos com 45 m² e 3 quartos com 62 m²),
-- valor garantido e % pós-chaves. bedrooms e area_m2 continuam guardando a
-- menor opção, para quem ainda lê só essas colunas.
alter table public.properties
  add column if not exists layouts jsonb not null default '[]'::jsonb
    check (jsonb_typeof(layouts) = 'array' and jsonb_array_length(layouts) <= 10);

alter table public.properties
  add column if not exists guaranteed_cents bigint check (guaranteed_cents between 0 and 100000000000);

alter table public.properties
  add column if not exists post_keys_pct numeric(5, 2) check (post_keys_pct between 0 and 100);

-- Imóveis já cadastrados viram uma opção só, com os quartos e a área que tinham.
update public.properties
set layouts = jsonb_build_array(jsonb_build_object('bedrooms', bedrooms, 'area_m2', area_m2))
where layouts = '[]'::jsonb and (bedrooms is not null or area_m2 is not null);

notify pgrst, 'reload schema';
