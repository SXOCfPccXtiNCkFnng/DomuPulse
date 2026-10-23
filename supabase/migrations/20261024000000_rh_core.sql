-- Módulo de Recrutamento (RH). Tudo é do nível da organização (não de um
-- corretor): qualquer pessoa da conta de RH gerencia. Nenhuma empresa vê a
-- outra. Mesmas regras restritivas de 2FA das demais tabelas.

-- Vagas ----------------------------------------------------------------------
create table public.vagas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  description text check (char_length(description) <= 4000),
  -- Critérios que a IA usa para pontuar o candidato (texto livre por enquanto).
  criteria text check (char_length(criteria) <= 2000),
  location text check (char_length(location) <= 120),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id)
);
create index vagas_org_idx on public.vagas (org_id, status);

-- Candidatos (banco de talentos; um candidato pode servir a várias vagas) ----
create table public.candidatos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  phone text check (phone ~ '^[0-9+() -]{8,20}$'),
  email text check (char_length(email) <= 254),
  city text check (char_length(city) <= 120),
  resume_path text check (char_length(resume_path) <= 300),
  resume_name text check (char_length(resume_name) <= 200),
  -- Dados extraídos do currículo pela IA (experiência, formação, etc.).
  resume_data jsonb,
  notes text check (char_length(notes) <= 2000),
  -- 'whatsapp' quando entrou sozinho pela conversa; 'manual' quando o RH subiu.
  source text not null default 'manual' check (source in ('manual', 'whatsapp')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id)
);
create index candidatos_org_idx on public.candidatos (org_id);

-- Candidaturas (candidato x vaga): é aqui que vivem status e nota da IA -------
create type public.candidatura_status as enum (
  'novo', 'triagem', 'entrevista', 'aprovado', 'reprovado', 'contratado'
);

create table public.candidaturas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  candidato_id uuid not null,
  vaga_id uuid not null,
  status public.candidatura_status not null default 'novo',
  -- Nota da IA (0 a 100) e o porquê. Quem recusa é o RH, não a automação.
  score smallint check (score between 0 and 100),
  score_reason text check (char_length(score_reason) <= 2000),
  review_note text check (char_length(review_note) <= 2000),
  status_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (candidato_id, vaga_id),
  foreign key (candidato_id, org_id) references public.candidatos (id, org_id) on delete cascade,
  foreign key (vaga_id, org_id) references public.vagas (id, org_id) on delete cascade
);
create index candidaturas_vaga_idx on public.candidaturas (vaga_id, status);
create index candidaturas_org_idx on public.candidaturas (org_id);

-- Entrevistas (alimentam o calendário) ---------------------------------------
create table public.entrevistas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  candidatura_id uuid not null references public.candidaturas (id) on delete cascade,
  scheduled_at timestamptz not null,
  duration_min smallint not null default 30 check (duration_min between 5 and 480),
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now()
);
create index entrevistas_org_time_idx on public.entrevistas (org_id, scheduled_at);

-- Marca a hora quando o status muda, e mantém updated_at.
create function private.candidatura_touch()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  new.updated_at := now();
  return new;
end
$$;

create trigger vagas_touch before update on public.vagas for each row execute function private.touch_updated_at();
create trigger candidatos_touch before update on public.candidatos for each row execute function private.touch_updated_at();
create trigger candidaturas_touch before update on public.candidaturas for each row execute function private.candidatura_touch();

-- RLS: tudo escopado pela organização. ---------------------------------------
do $$
declare t text;
begin
  foreach t in array array['vagas', 'candidatos', 'candidaturas', 'entrevistas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format($p$create policy "ver %1$s da organizacao" on public.%1$I
      for select to authenticated using (org_id = (select private.my_org_id()))$p$, t);
    execute format($p$create policy "gravar %1$s da organizacao" on public.%1$I
      for insert to authenticated with check (org_id = (select private.my_org_id()))$p$, t);
    execute format($p$create policy "editar %1$s da organizacao" on public.%1$I
      for update to authenticated
      using (org_id = (select private.my_org_id())) with check (org_id = (select private.my_org_id()))$p$, t);
    execute format($p$create policy "apagar %1$s da organizacao" on public.%1$I
      for delete to authenticated using (org_id = (select private.my_org_id()))$p$, t);
    execute format($p$create policy "2fa %1$s" on public.%1$I
      as restrictive for all to authenticated using ((select private.mfa_ok())) with check ((select private.mfa_ok()))$p$, t);
  end loop;
end
$$;

-- Bucket privado dos currículos (até 10 MB; PDF, Word e imagens).
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('resumes', 'resumes', false, 10485760,
      array['application/pdf', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'image/jpeg', 'image/png'])
    on conflict (id) do nothing;
  end if;
end
$$;
