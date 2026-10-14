-- Carteira de clientes: só o corretor dono cadastra, edita e apaga. A
-- liderança continua vendo tudo do escopo (política de leitura sem mudança),
-- mas não altera a carteira de ninguém.
drop policy "cadastrar clientes do escopo" on public.clients;
drop policy "editar clientes do escopo" on public.clients;
drop policy "apagar clientes do escopo" on public.clients;

create function private.is_my_member(target uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.members
    where id = target and user_id = (select auth.uid()) and active
  )
$$;

grant execute on function private.is_my_member(uuid) to authenticated, service_role;

create policy "corretor cadastra os próprios clientes" on public.clients
  for insert to authenticated
  with check (private.is_my_member(member_id) and private.org_writable(private.my_org_id()));
create policy "corretor edita os próprios clientes" on public.clients
  for update to authenticated
  using (private.is_my_member(member_id) and private.org_writable(private.my_org_id()))
  with check (private.is_my_member(member_id));
create policy "corretor apaga os próprios clientes" on public.clients
  for delete to authenticated
  using (private.is_my_member(member_id) and private.org_writable(private.my_org_id()));

-- Resumo semanal: e-mail opcional para receber em outro endereço. Vazio, vai
-- para o e-mail de login. Gravado pelo servidor, como weekly_digest.
alter table public.members add column digest_email text
  check (char_length(digest_email) <= 254 and digest_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');
