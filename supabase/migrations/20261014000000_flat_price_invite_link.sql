-- Plano único: valor fixo mensal por conta (cada gestor assina a sua), sem
-- limite de pessoas. O valor vigente fica aqui e muda pelo painel interno.
create table public.platform_settings (
  id boolean primary key default true check (id),
  monthly_price_cents int not null default 50000 check (monthly_price_cents between 100 and 100000000),
  updated_at timestamptz not null default now()
);

insert into public.platform_settings default values;

alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from anon, authenticated;

-- Valor que a conta paga, gravado ao assinar. Mudar o valor vigente só vale
-- para quem assinar depois.
alter table public.organizations add column price_cents int check (price_cents > 0);

-- Link de convite da conta: quem tem o código entra como corretor. Fica fora
-- de organizations para o corretor não conseguir ler o código pela API.
create table public.org_invites (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  code text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);

insert into public.org_invites (org_id) select id from public.organizations;

-- Toda conta nova já nasce com o seu link.
create function private.create_org_invite()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.org_invites (org_id) values (new.id) on conflict do nothing;
  return new;
end
$$;

create trigger organizations_create_invite after insert on public.organizations
  for each row execute function private.create_org_invite();

alter table public.org_invites enable row level security;
revoke all on public.org_invites from anon, authenticated;
