-- Estado da conversa do bot de RH com cada candidato (por número de WhatsApp).
-- É memória interna da automação: só o servidor grava; a org pode ler.
create table public.wa_conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  phone text not null check (char_length(phone) <= 30),
  -- Em que ponto da conversa está.
  stage text not null default 'awaiting_vaga' check (stage in ('awaiting_vaga', 'awaiting_resume', 'done', 'human')),
  vaga_id uuid,
  candidato_id uuid,
  name text check (char_length(name) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, phone),
  foreign key (vaga_id, org_id) references public.vagas (id, org_id) on delete set null,
  foreign key (candidato_id, org_id) references public.candidatos (id, org_id) on delete set null
);
create index wa_conversations_org_idx on public.wa_conversations (org_id);

alter table public.wa_conversations enable row level security;
revoke all on public.wa_conversations from anon, authenticated;

create policy "ver conversas da organizacao" on public.wa_conversations
  for select to authenticated using (org_id = (select private.my_org_id()));
