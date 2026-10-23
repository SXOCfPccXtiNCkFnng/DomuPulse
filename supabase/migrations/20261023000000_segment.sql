-- Segmento da conta, escolhido no cadastro. Decide o módulo, o menu e o
-- onboarding. 'brokers' = gestão de corretores (produto atual). 'hr' =
-- recrutamento. Contas que já existem continuam em 'brokers'.
alter table public.organizations
  add column segment text not null default 'brokers' check (segment in ('brokers', 'hr'));
