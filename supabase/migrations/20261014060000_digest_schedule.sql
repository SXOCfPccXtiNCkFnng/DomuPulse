-- Cada pessoa da liderança escolhe quando recebe os resumos por e-mail.
--   daily_digest_hour: hora do resumo do dia (vazio = 1 hora depois do último horário de relatório)
--   weekly_digest_weekday: dia da semana do resumo semanal, às 8h (0 = domingo, 1 = segunda...)
--   monthly_digest: resumo do mês anterior, no dia 1 às 8h
alter table public.members
  add column daily_digest_hour smallint check (daily_digest_hour between 0 and 23),
  add column weekly_digest_weekday smallint not null default 1 check (weekly_digest_weekday between 0 and 6),
  add column monthly_digest boolean not null default true;
