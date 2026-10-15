-- Emissão de NFS-e pelo próprio Pulse, pela Focus NFe (padrão nacional).
-- O corretor (prestador, com o CNPJ dele) emite contra a imobiliária (tomadora).

-- Dados da imobiliária como tomadora das notas. Gravados só pelo servidor.
alter table public.organizations
  add column fiscal_legal_name text check (char_length(fiscal_legal_name) between 2 and 150),
  add column fiscal_cnpj text check (fiscal_cnpj ~ '^[0-9]{14}$'),
  add column fiscal_email text check (char_length(fiscal_email) <= 80),
  add column fiscal_cep text check (fiscal_cep ~ '^[0-9]{8}$'),
  add column fiscal_street text check (char_length(fiscal_street) <= 255),
  add column fiscal_number text check (char_length(fiscal_number) <= 60),
  add column fiscal_district text check (char_length(fiscal_district) <= 60),
  add column fiscal_city text check (char_length(fiscal_city) <= 80),
  add column fiscal_uf text check (fiscal_uf ~ '^[A-Z]{2}$'),
  add column fiscal_city_ibge text check (fiscal_city_ibge ~ '^[0-9]{7}$'),
  -- Código de tributação nacional do serviço (cTribNac, 6 dígitos). Fica
  -- configurável porque a lista nacional muda; confira no ambiente de testes.
  add column nfse_service_code text not null default '100501' check (nfse_service_code ~ '^[0-9]{6}$');

-- Cadastro fiscal de cada corretor (prestador). Guarda o token de emissão da
-- empresa na Focus, que é secreto: nenhum acesso pelo app, só pelo servidor.
-- O certificado digital nunca fica aqui: vai direto para a Focus.
create table public.fiscal_profiles (
  member_id uuid primary key,
  org_id uuid not null,
  cnpj text not null check (cnpj ~ '^[0-9]{14}$'),
  legal_name text not null check (char_length(legal_name) between 2 and 150),
  municipal_registration text check (char_length(municipal_registration) <= 20),
  -- 1 = não optante, 2 = MEI, 3 = Simples Nacional ME/EPP
  simples_option smallint not null check (simples_option in (1, 2, 3)),
  email text check (char_length(email) <= 80),
  cep text not null check (cep ~ '^[0-9]{8}$'),
  street text not null check (char_length(street) <= 255),
  number text not null check (char_length(number) <= 60),
  district text not null check (char_length(district) <= 60),
  city text not null check (char_length(city) <= 80),
  uf text not null check (uf ~ '^[A-Z]{2}$'),
  city_ibge text not null check (city_ibge ~ '^[0-9]{7}$'),
  focus_company_id bigint,
  focus_token text,
  certificate_valid_until timestamptz,
  status text not null default 'pending' check (status in ('pending', 'active', 'error')),
  last_error text check (char_length(last_error) <= 1000),
  next_dps_number integer not null default 1 check (next_dps_number > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (member_id, org_id) references public.members (id, org_id) on delete cascade
);

alter table public.fiscal_profiles enable row level security;
revoke all on public.fiscal_profiles from anon, authenticated;

-- Número da DPS: sequencial por corretor, sem repetir mesmo com dois envios ao mesmo tempo.
create function public.take_dps_number(p_member uuid)
returns integer
language sql security definer set search_path = ''
as $$
  update public.fiscal_profiles
  set next_dps_number = next_dps_number + 1, updated_at = now()
  where member_id = p_member
  returning next_dps_number - 1
$$;

revoke all on function public.take_dps_number(uuid) from public, anon, authenticated;
grant execute on function public.take_dps_number(uuid) to service_role;

-- Notas emitidas pelo Pulse: o arquivo vem da Focus, não de um envio do corretor.
alter table public.invoices
  alter column file_path drop not null,
  alter column file_name drop not null,
  add column source text not null default 'upload' check (source in ('upload', 'focus')),
  add column focus_ref text unique check (char_length(focus_ref) <= 60),
  add column nfse_number text check (char_length(nfse_number) <= 40),
  add column nfse_verification_code text check (char_length(nfse_verification_code) <= 60),
  add column nfse_pdf_url text check (char_length(nfse_pdf_url) <= 1000),
  add column nfse_portal_url text check (char_length(nfse_portal_url) <= 1000),
  add column issue_error text check (char_length(issue_error) <= 1000),
  add constraint invoices_upload_has_file check (source <> 'upload' or (file_path is not null and file_name is not null));

alter table public.invoices drop constraint invoices_status_check;
alter table public.invoices add constraint invoices_status_check
  check (status in ('processing', 'error', 'sent', 'checked', 'paid', 'rejected', 'canceled'));

create index invoices_processing_idx on public.invoices (status) where status = 'processing';
