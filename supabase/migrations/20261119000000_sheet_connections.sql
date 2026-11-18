-- Conexão da empresa com uma planilha do Google (integração de Visitas).
-- Uma por empresa. Guarda o refresh token (criptografado) e qual planilha usar.
-- A tabela é acessada só pelo service role (nunca pelo cliente), porque guarda
-- o token: por isso tem RLS ligado e NENHUMA policy para authenticated.
-- Idempotente: pode rodar de novo sem erro.

create table if not exists public.sheet_connections (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  provider text not null default 'google',
  spreadsheet_id text,
  spreadsheet_url text,
  sheet_title text,
  -- Mapa coluna da planilha -> campo do sistema, definido ao conectar.
  column_map jsonb,
  -- Refresh token do Google, selado com AES (lib secret-box). Nunca em texto puro.
  refresh_token_encrypted text,
  enabled boolean not null default false,
  -- connected | needs_sheet | error
  status text not null default 'needs_sheet',
  connected_by uuid references public.members (id) on delete set null,
  last_push_at timestamptz,
  last_pull_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sheet_connections enable row level security;
revoke all on public.sheet_connections from anon;

drop trigger if exists sheet_connections_touch on public.sheet_connections;
create trigger sheet_connections_touch before update on public.sheet_connections
  for each row execute function private.touch_updated_at();

notify pgrst, 'reload schema';
