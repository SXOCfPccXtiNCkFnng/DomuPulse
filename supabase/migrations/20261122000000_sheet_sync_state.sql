-- Foto do que foi sincronizado por último de cada visita (para saber qual lado
-- mudou: planilha ou sistema). Guarda só os campos editáveis pela planilha.
-- Acessada só pelo service role (sem policy para authenticated).
create table if not exists public.sheet_sync_state (
  appointment_id uuid primary key references public.appointments (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  snapshot jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists sheet_sync_state_org_idx on public.sheet_sync_state (org_id);

alter table public.sheet_sync_state enable row level security;
revoke all on public.sheet_sync_state from anon;

notify pgrst, 'reload schema';
