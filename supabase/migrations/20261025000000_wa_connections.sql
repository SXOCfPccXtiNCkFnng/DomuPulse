-- Conexão de WhatsApp de cada empresa (uma instância do Evolution por org).
-- Guarda o nome da instância, a situação e o número conectado. Só o servidor
-- grava (via chave de serviço, pelas ações e pelo webhook); a org só lê.
create table public.wa_connections (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  instance text not null unique check (char_length(instance) <= 120),
  status text not null default 'disconnected' check (status in ('disconnected', 'connecting', 'connected')),
  phone text check (char_length(phone) <= 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.wa_connections enable row level security;
revoke all on public.wa_connections from anon, authenticated;

create policy "ver conexao da organizacao" on public.wa_connections
  for select to authenticated using (org_id = (select private.my_org_id()));
