-- Parâmetros do simulador de financiamento (juros SBPE, 30% da renda, LTV,
-- prazo e as faixas do Minha Casa Minha Vida), editáveis pelo administrador no
-- /interno. Fica num JSON na linha única de configurações da plataforma.
alter table public.platform_settings add column if not exists financing jsonb;
