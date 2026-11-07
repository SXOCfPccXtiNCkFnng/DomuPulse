-- Rascunho do relatório: o corretor vai falando ou digitando o que fez (a IA
-- converte em números) e ajustando os campos; tudo fica salvo aqui até ele
-- enviar. Só vira relatório (public.reports) quando ele envia. Só o próprio
-- corretor vê o rascunho.
create table public.report_drafts (
  member_id uuid not null references public.members (id) on delete cascade,
  report_date date not null,
  report_slot time not null,
  -- Números do formulário: { "leads": 3, "visits": 1, ... }.
  totals jsonb not null default '{}'::jsonb,
  notes text check (char_length(notes) <= 500),
  -- O que foi dito e o que a IA entendeu: [{ id, text, deltas, at }].
  entries jsonb not null default '[]'::jsonb check (jsonb_array_length(entries) <= 100),
  updated_at timestamptz not null default now(),
  primary key (member_id, report_date, report_slot)
);

create trigger report_drafts_touch before update on public.report_drafts for each row execute function private.touch_updated_at();

alter table public.report_drafts enable row level security;
revoke all on public.report_drafts from anon;

create policy "rascunho do próprio corretor" on public.report_drafts
  for all to authenticated
  using (exists (select 1 from public.members m where m.id = member_id and m.user_id = (select auth.uid()) and m.active))
  with check (exists (select 1 from public.members m where m.id = member_id and m.user_id = (select auth.uid()) and m.active));

create policy "2fa report_drafts" on public.report_drafts
  as restrictive for all to authenticated using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
