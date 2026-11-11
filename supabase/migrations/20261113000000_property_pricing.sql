-- Imóveis: alçada comercial. Cada empreendimento guarda as condições de venda
-- por tipologia (studio, 1 dormitório, 1 dormitório + office, 2 dormitórios),
-- faixa de renda real do cliente, faixa de andar, valor garantido, valor final,
-- adicional por andar e observações (ex.: "1 fiador na hora").
--
-- Formato de cada item de pricing:
--   { "typology": "Studio 24 m²",
--     "income_from_cents": 280000,      -- renda real a partir de (inclusive)
--     "income_below_cents": null,       -- renda real abaixo de
--     "floor_from": null, "floor_to": 5,
--     "guaranteed_cents": 16000000,
--     "final_cents": 20478700,
--     "floor_addons": [{ "from": 6, "to": 10, "add_cents": 500000 }],
--     "note": "1 fiador na hora" }
alter table public.properties
  add column if not exists pricing jsonb not null default '[]'::jsonb
    check (jsonb_typeof(pricing) = 'array' and jsonb_array_length(pricing) <= 40);

-- Data base da alçada (ex.: alçada de 05/11/2026).
alter table public.properties
  add column if not exists pricing_date date;

notify pgrst, 'reload schema';
