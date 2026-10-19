-- E-mails que recebem alertas de novos cadastros de clientes pagantes (donos de imobiliárias)
alter table public.platform_settings
  add column if not exists signup_alert_emails text[] not null default array['alanfelipe1678@gmail.com']::text[];

-- Garante que o registro existente tenha o e-mail padrão caso esteja vazio
update public.platform_settings
set signup_alert_emails = array['alanfelipe1678@gmail.com']::text[]
where signup_alert_emails is null or cardinality(signup_alert_emails) = 0;
