-- Checklist de documentos da admissão: o RH monta a lista (uma vez, na
-- Automação) e envia ao candidato pelo WhatsApp. O Pulse não recebe nem guarda
-- os documentos; só registra quando a lista foi enviada.
alter table public.rh_settings
  add column if not exists doc_checklist text[] not null default '{}'
    check (cardinality(doc_checklist) <= 30);

alter table public.candidaturas
  add column if not exists checklist_sent_at timestamptz;
