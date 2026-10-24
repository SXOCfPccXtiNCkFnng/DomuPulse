-- Memória do atendimento do WhatsApp: as últimas mensagens da conversa, para a
-- IA responder com contexto em vez de um menu numerado.
alter table public.wa_conversations
  add column if not exists history jsonb not null default '[]'::jsonb;
