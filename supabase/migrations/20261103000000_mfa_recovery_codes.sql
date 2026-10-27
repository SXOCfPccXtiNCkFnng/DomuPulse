-- Códigos de recuperação do 2FA. A pessoa guarda ~10 códigos quando ativa a
-- verificação em duas etapas; se perder o celular, usa um para entrar (o código
-- remove o 2FA da conta, e ela configura de novo). Guardamos só o hash.
-- Só o service role mexe aqui (tudo passa por ações do servidor).
create table public.mfa_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index mfa_recovery_codes_user_idx on public.mfa_recovery_codes (user_id) where used_at is null;

alter table public.mfa_recovery_codes enable row level security;
revoke all on public.mfa_recovery_codes from anon, authenticated;
