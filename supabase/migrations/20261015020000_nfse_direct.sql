-- Emissão direta na API oficial da NFS-e Nacional (biblioteca open-nfse), sem
-- intermediário pago. O Pulse passa a guardar o certificado A1 de cada
-- corretor, criptografado (AES-256-GCM) com uma chave que só existe no
-- servidor (NFSE_CERT_KEY). Nem quem abrir o banco consegue usar o certificado.

alter table public.fiscal_profiles
  drop column focus_company_id,
  drop column focus_token,
  add column certificate_encrypted text check (char_length(certificate_encrypted) <= 200000),
  add column certificate_password_encrypted text check (char_length(certificate_password_encrypted) <= 2000),
  add column certificate_subject text check (char_length(certificate_subject) <= 500),
  -- Alíquota aproximada do Simples Nacional (%), exigida na nota de ME/EPP.
  add column simples_rate numeric(5, 2) check (simples_rate between 0 and 99.99);

-- Nota emitida direto na API nacional.
alter table public.invoices drop constraint invoices_source_check;
alter table public.invoices add constraint invoices_source_check check (source in ('upload', 'focus', 'national'));
alter table public.invoices
  add column nfse_access_key text unique check (char_length(nfse_access_key) <= 60),
  add column nfse_dps_id text unique check (char_length(nfse_dps_id) <= 60);

-- Fila de reenvio: quando a rede falha, a nota já assinada fica aqui e a rotina
-- reenvia. O governo descarta duplicadas pelo identificador da DPS. Só o servidor acessa.
create table public.nfse_pending (
  id text primary key check (char_length(id) <= 120),
  member_id uuid not null references public.members (id) on delete cascade,
  payload jsonb not null,
  not_before timestamptz,
  created_at timestamptz not null default now()
);

create index nfse_pending_member_idx on public.nfse_pending (member_id);

alter table public.nfse_pending enable row level security;
revoke all on public.nfse_pending from anon, authenticated;
