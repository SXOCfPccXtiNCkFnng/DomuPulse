-- Atendimento do WhatsApp pergunta antes o que a pessoa quer (candidatar-se ou
-- tirar uma dúvida). Nova etapa: 'awaiting_intent'.
alter table public.wa_conversations drop constraint if exists wa_conversations_stage_check;
alter table public.wa_conversations
  add constraint wa_conversations_stage_check
  check (stage in ('awaiting_intent', 'awaiting_vaga', 'awaiting_resume', 'done', 'human'));
alter table public.wa_conversations alter column stage set default 'awaiting_intent';
