-- Agendamento dos lembretes. Rode uma vez por ambiente no SQL Editor do
-- Supabase, depois de publicar o app na Vercel.
--
-- Não fica em migrations porque depende da URL e do segredo de cada
-- ambiente, guardados no Vault (criptografados), nunca em texto no código.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1. Guarde a URL e o segredo (o mesmo CRON_SECRET configurado na Vercel):
--
-- select vault.create_secret('https://pulse.domutech.digital/api/cron/reminders', 'pulse_cron_url');
-- select vault.create_secret('COLE_AQUI_O_CRON_SECRET', 'pulse_cron_secret');

-- 2. Agende a chamada a cada 5 minutos:
select cron.schedule(
  'pulse-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'pulse_cron_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'pulse_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);

-- Para conferir as execuções:
-- select * from cron.job_run_details order by start_time desc limit 20;
