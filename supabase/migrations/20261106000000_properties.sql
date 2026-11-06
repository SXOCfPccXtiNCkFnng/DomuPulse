-- Imóveis da imobiliária. A liderança (administrador, superintendente e
-- gerente) cadastra; toda a equipe vê e escolhe o imóvel ao cadastrar um
-- cliente. Idempotente: pode rodar de novo sem erro.

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  code text check (char_length(code) <= 30),
  kind text check (char_length(kind) <= 40),
  deal text not null default 'venda' check (deal in ('venda', 'locacao')),
  neighborhood text check (char_length(neighborhood) <= 120),
  city text check (char_length(city) <= 80),
  price_cents bigint check (price_cents between 0 and 100000000000),
  bedrooms smallint check (bedrooms between 0 and 50),
  area_m2 integer check (area_m2 between 0 and 1000000),
  status text not null default 'available' check (status in ('available', 'reserved', 'sold', 'inactive')),
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id)
);
create index if not exists properties_org_idx on public.properties (org_id, status);

drop trigger if exists properties_touch on public.properties;
create trigger properties_touch before update on public.properties for each row execute function private.touch_updated_at();

alter table public.properties enable row level security;
revoke all on public.properties from anon;

drop policy if exists "ver imoveis da organizacao" on public.properties;
create policy "ver imoveis da organizacao" on public.properties
  for select to authenticated using (org_id = (select private.my_org_id()));

drop policy if exists "lideranca cadastra imoveis" on public.properties;
create policy "lideranca cadastra imoveis" on public.properties
  for insert to authenticated
  with check (
    org_id = (select private.my_org_id())
    and (select private.my_role()) <> 'broker'
    and private.org_writable(org_id)
  );

drop policy if exists "lideranca edita imoveis" on public.properties;
create policy "lideranca edita imoveis" on public.properties
  for update to authenticated
  using (org_id = (select private.my_org_id()) and (select private.my_role()) <> 'broker')
  with check (
    org_id = (select private.my_org_id())
    and (select private.my_role()) <> 'broker'
    and private.org_writable(org_id)
  );

drop policy if exists "lideranca apaga imoveis" on public.properties;
create policy "lideranca apaga imoveis" on public.properties
  for delete to authenticated
  using (org_id = (select private.my_org_id()) and (select private.my_role()) <> 'broker');

drop policy if exists "2fa properties" on public.properties;
create policy "2fa properties" on public.properties
  as restrictive for all to authenticated using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

-- Cliente ligado a um imóvel cadastrado. A chave composta impede ligar a um
-- imóvel de outra imobiliária; apagar o imóvel só desfaz o vínculo.
alter table public.clients add column if not exists property_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_property_fk') then
    alter table public.clients
      add constraint clients_property_fk foreign key (property_id, org_id)
      references public.properties (id, org_id) on delete set null (property_id);
  end if;
end
$$;
create index if not exists clients_property_idx on public.clients (property_id);

notify pgrst, 'reload schema';
