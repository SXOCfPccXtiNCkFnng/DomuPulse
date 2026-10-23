-- Aviso ao candidato quando o RH aprova ou recusa a candidatura.
-- 'notify_at': quando o aviso deve sair (a recusa é com atraso, não na cara).
-- 'notified_at': quando o aviso já foi enviado (não repete).
alter table public.candidaturas
  add column if not exists notify_at timestamptz,
  add column if not exists notified_at timestamptz;

-- O cron diário procura recusas que já passaram da hora e ainda não avisadas.
create index if not exists candidaturas_notify_idx
  on public.candidaturas (notify_at)
  where notified_at is null;
