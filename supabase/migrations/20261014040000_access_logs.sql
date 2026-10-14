-- Registros de acesso à aplicação (Marco Civil da Internet, art. 15): quem
-- entrou, de qual IP e quando, guardados por 6 meses. Sem chave estrangeira
-- de propósito: a lei manda guardar mesmo que a conta seja excluída. Só o
-- servidor grava e lê; a limpeza diária apaga o que passou do prazo.
create table public.access_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  event text not null check (event in ('login', 'signup', 'join')),
  ip text check (char_length(ip) <= 64),
  user_agent text check (char_length(user_agent) <= 400),
  at timestamptz not null default now()
);

create index access_logs_at_idx on public.access_logs (at);
create index access_logs_user_idx on public.access_logs (user_id, at desc);

alter table public.access_logs enable row level security;
revoke all on public.access_logs from anon, authenticated;
