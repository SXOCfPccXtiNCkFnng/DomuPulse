-- Resumo do dia por e-mail para a liderança, uma hora depois do último
-- horário de relatório. Cada pessoa pode desligar, como no resumo semanal.
alter table public.members add column daily_digest boolean not null default true;
