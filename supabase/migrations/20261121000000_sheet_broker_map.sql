-- Vínculo dos nomes de corretor da planilha com os corretores cadastrados.
-- Ex.: { "guerra": "<member_id>", "franca": "<member_id>" } (nome normalizado).
-- Usado na importação planilha -> sistema para casar quem o nome automático não achou.
alter table public.sheet_connections add column if not exists broker_map jsonb;

notify pgrst, 'reload schema';
