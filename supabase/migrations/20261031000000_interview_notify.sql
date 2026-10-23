-- Confirmação e lembrete de entrevista para o candidato (WhatsApp e e-mail).
-- O local vai na mensagem; as observações continuam só para a equipe.
alter table public.entrevistas
  add column if not exists location text check (char_length(location) <= 300),
  -- Antecedência do lembrete em minutos; null = não enviar lembrete.
  add column if not exists remind_before_min smallint check (remind_before_min between 15 and 2880),
  add column if not exists remind_at timestamptz,
  add column if not exists reminded_at timestamptz,
  add column if not exists confirmed_at timestamptz;

create index if not exists entrevistas_remind_idx
  on public.entrevistas (remind_at)
  where reminded_at is null and remind_at is not null;
