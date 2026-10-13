-- Verificação em duas etapas aplicada no banco.
--
-- Bloquear só as telas não basta: com a senha, daria para chamar a API do
-- Supabase direto. Estas regras são RESTRITIVAS (somam-se às demais com E):
-- quem tem um fator verificado só acessa dados com sessão aal2, ou seja,
-- depois de digitar o código do aplicativo autenticador.

create function private.mfa_ok()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = (select auth.uid()) and f.status = 'verified'
      )
$$;

grant execute on function private.mfa_ok() to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'organizations', 'divisions', 'teams', 'members', 'reports', 'daily_status',
    'appointments', 'goals', 'commissions', 'push_subscriptions', 'audit_log'
  ] loop
    execute format(
      'create policy "segunda etapa quando ativada" on public.%I as restrictive for all to authenticated
         using ((select private.mfa_ok())) with check ((select private.mfa_ok()))',
      t
    );
  end loop;
end
$$;
