-- Notas fiscais dos corretores: o corretor envia a nota que emitiu (qualquer
-- valor: comissão, valor mensal, outro serviço) e a liderança acompanha até o
-- pagamento. A nota pode ou não estar ligada a uma comissão.
--
-- Situação: enviada -> conferida -> paga. A liderança também pode recusar,
-- com motivo, e o corretor manda outra.

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  member_id uuid not null,
  commission_id uuid references public.commissions (id) on delete set null,
  number text not null check (char_length(number) between 1 and 40),
  amount_cents bigint not null check (amount_cents between 1 and 100000000000),
  issued_on date not null,
  description text not null check (char_length(description) between 2 and 200),
  notes text check (char_length(notes) <= 500),
  file_path text not null check (char_length(file_path) <= 300),
  file_name text not null check (char_length(file_name) <= 200),
  status text not null default 'sent' check (status in ('sent', 'checked', 'paid', 'rejected')),
  review_note text check (char_length(review_note) <= 300),
  status_changed_at timestamptz not null default now(),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, org_id),
  foreign key (member_id, org_id) references public.members (id, org_id) on delete cascade
);

create index invoices_org_idx on public.invoices (org_id, created_at desc);
create index invoices_member_idx on public.invoices (member_id, created_at desc);

-- Leitura pelo app segue o mesmo escopo dos relatórios: o corretor vê as
-- dele, a liderança vê as da equipe. Toda escrita passa pelo servidor, que
-- confere permissão, arquivo e situação antes de gravar.
alter table public.invoices enable row level security;
revoke all on public.invoices from anon, authenticated;
grant select on public.invoices to authenticated;

create policy "ver notas do escopo" on public.invoices
  for select to authenticated using (private.can_view_member(member_id));
create policy "segunda etapa quando ativada" on public.invoices
  as restrictive for select to authenticated using ((select private.mfa_ok()));

alter publication supabase_realtime add table public.invoices;

-- Pasta privada dos arquivos. Sem políticas de acesso: só o servidor envia
-- (por link de envio de uso único) e só ele gera links temporários de leitura.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('invoices', 'invoices', false, 5242880, array['application/pdf', 'application/xml', 'text/xml', 'image/jpeg', 'image/png'])
    on conflict (id) do nothing;
  end if;
end
$$;
