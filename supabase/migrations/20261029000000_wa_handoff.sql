-- Handoff humano: quando o recrutador responde o candidato na mão, o bot pausa
-- naquela conversa (stage 'human'). Para não confundir a resposta do recrutador
-- com a resposta automática do próprio bot, guardamos os ids das mensagens que
-- o bot enviou; uma mensagem 'fromMe' cujo id não está aqui veio da pessoa.
alter table public.wa_conversations
  add column if not exists bot_msg_ids text[] not null default '{}';
