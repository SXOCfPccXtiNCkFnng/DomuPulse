-- Fotos dos imóveis. A liderança envia; toda a equipe vê. As fotos ficam num
-- bucket público porque vão aparecer na página pública do imóvel (link para
-- mandar no WhatsApp) e no card de preview, que o WhatsApp busca sem login.
-- Idempotente: pode rodar de novo sem erro.

create table if not exists public.property_photos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null,
  path text not null,
  sort smallint not null default 0 check (sort between 0 and 1000),
  created_at timestamptz not null default now(),
  unique (id, org_id),
  constraint property_photos_property_fk foreign key (property_id, org_id)
    references public.properties (id, org_id) on delete cascade
);
create index if not exists property_photos_property_idx on public.property_photos (property_id, sort);

alter table public.property_photos enable row level security;
revoke all on public.property_photos from anon;

drop policy if exists "ver fotos de imoveis da organizacao" on public.property_photos;
create policy "ver fotos de imoveis da organizacao" on public.property_photos
  for select to authenticated using (org_id = (select private.my_org_id()));

drop policy if exists "lideranca adiciona fotos de imoveis" on public.property_photos;
create policy "lideranca adiciona fotos de imoveis" on public.property_photos
  for insert to authenticated
  with check (
    org_id = (select private.my_org_id())
    and (select private.my_role()) <> 'broker'
    and private.org_writable(org_id)
  );

drop policy if exists "lideranca edita fotos de imoveis" on public.property_photos;
create policy "lideranca edita fotos de imoveis" on public.property_photos
  for update to authenticated
  using (org_id = (select private.my_org_id()) and (select private.my_role()) <> 'broker')
  with check (org_id = (select private.my_org_id()) and (select private.my_role()) <> 'broker');

drop policy if exists "lideranca apaga fotos de imoveis" on public.property_photos;
create policy "lideranca apaga fotos de imoveis" on public.property_photos
  for delete to authenticated
  using (org_id = (select private.my_org_id()) and (select private.my_role()) <> 'broker');

drop policy if exists "2fa property_photos" on public.property_photos;
create policy "2fa property_photos" on public.property_photos
  as restrictive for all to authenticated using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

-- Bucket público das fotos (até 10 MB; JPG, PNG e WEBP). O upload é feito pelo
-- servidor (service role) com URL assinada, então não precisa de policy de escrita.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('property-photos', 'property-photos', true, 10485760,
      array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;
  end if;
end
$$;

notify pgrst, 'reload schema';
