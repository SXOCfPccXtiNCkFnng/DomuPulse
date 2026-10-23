-- Configuração da IA de recrutamento de cada empresa: liga/desliga o bot e
-- personaliza as mensagens e as instruções que a IA usa.
create table public.rh_settings (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  bot_enabled boolean not null default true,
  greeting text check (char_length(greeting) <= 1000),
  instructions text check (char_length(instructions) <= 2000),
  closing text check (char_length(closing) <= 1000),
  updated_at timestamptz not null default now()
);

alter table public.rh_settings enable row level security;
revoke all on public.rh_settings from anon, authenticated;

create policy "ver config da organizacao" on public.rh_settings
  for select to authenticated using (org_id = (select private.my_org_id()));
