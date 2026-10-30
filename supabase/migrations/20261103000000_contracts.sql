-- Contratos de locação/venda e reajustes. A IA lê o contrato e sugere os
-- dados; o sistema calcula o reajuste pelo índice; uma pessoa da liderança
-- confere antes de valer. Corretores não veem contratos.

-- Índices mensais (públicos, do Banco Central). Só o servidor grava.
create table public.index_values (
  index_code text not null check (index_code in ('ipca', 'igpm', 'incc_m', 'incc_di')),
  ref_month date not null check (extract(day from ref_month) = 1),
  pct numeric(8, 4) not null,
  fetched_at timestamptz not null default now(),
  primary key (index_code, ref_month)
);

-- Contratos -------------------------------------------------------------------
create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null default 'locacao' check (kind in ('locacao', 'venda')),
  -- Como a equipe reconhece o contrato: imóvel, unidade, número.
  reference text not null check (char_length(reference) between 2 and 160),
  party_name text not null check (char_length(party_name) between 1 and 160),
  party_email text check (char_length(party_email) <= 254),
  party_phone text check (party_phone ~ '^[0-9+() -]{8,20}$'),
  index_code text not null check (index_code in ('ipca', 'igpm', 'incc_m', 'incc_di')),
  -- Data-base: a partir dela o reajuste acontece a cada period_months.
  base_date date not null,
  period_months smallint not null default 12 check (period_months between 1 and 36),
  -- Meses de defasagem do índice (o do mês do reajuste ainda não saiu).
  lag_months smallint not null default 1 check (lag_months between 0 and 3),
  -- Índice negativo reduz o valor? A maioria dos contratos diz que não.
  allow_decrease boolean not null default false,
  current_value_cents bigint not null check (current_value_cents > 0),
  last_adjusted_on date,
  next_adjustment_on date not null,
  status text not null default 'active' check (status in ('active', 'ended')),
  file_path text check (char_length(file_path) <= 300),
  file_name text check (char_length(file_name) <= 200),
  -- O que a IA leu (trecho da cláusula, observações), para a conferência.
  extracted jsonb,
  -- Lido pela IA e ainda não conferido por uma pessoa.
  needs_review boolean not null default false,
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id)
);
create index contracts_org_next_idx on public.contracts (org_id, status, next_adjustment_on);

-- Reajustes (um por contrato e data). Só vale depois de aprovado. -------------
create table public.contract_adjustments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  contract_id uuid not null,
  due_on date not null,
  index_code text not null check (index_code in ('ipca', 'igpm', 'incc_m', 'incc_di')),
  -- Variações mensais usadas no cálculo: [{ "month": "2026-01", "pct": 0.33 }].
  months jsonb not null default '[]'::jsonb,
  missing_months text[] not null default '{}',
  accumulated_pct numeric(9, 4) not null,
  old_value_cents bigint not null check (old_value_cents > 0),
  new_value_cents bigint not null check (new_value_cents > 0),
  -- Valor que a pessoa confirmou (pode ajustar o arredondamento).
  final_value_cents bigint check (final_value_cents > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'skipped')),
  letter_text text check (char_length(letter_text) <= 4000),
  reviewed_by uuid references public.members (id) on delete set null,
  reviewed_at timestamptz,
  sent_at timestamptz,
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract_id, due_on),
  foreign key (contract_id, org_id) references public.contracts (id, org_id) on delete cascade
);
create index contract_adjustments_org_idx on public.contract_adjustments (org_id, status, due_on);

create trigger contracts_touch before update on public.contracts for each row execute function private.touch_updated_at();
create trigger contract_adjustments_touch before update on public.contract_adjustments for each row execute function private.touch_updated_at();

-- RLS: só a liderança da própria organização. --------------------------------
do $$
declare t text;
begin
  foreach t in array array['contracts', 'contract_adjustments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format($p$create policy "ver %1$s da organizacao" on public.%1$I
      for select to authenticated
      using (org_id = (select private.my_org_id()) and (select private.my_role()) <> 'broker')$p$, t);
    execute format($p$create policy "gravar %1$s da organizacao" on public.%1$I
      for insert to authenticated
      with check (org_id = (select private.my_org_id()) and (select private.my_role()) <> 'broker')$p$, t);
    execute format($p$create policy "editar %1$s da organizacao" on public.%1$I
      for update to authenticated
      using (org_id = (select private.my_org_id()) and (select private.my_role()) <> 'broker')
      with check (org_id = (select private.my_org_id()) and (select private.my_role()) <> 'broker')$p$, t);
    execute format($p$create policy "apagar %1$s da organizacao" on public.%1$I
      for delete to authenticated
      using (org_id = (select private.my_org_id()) and (select private.my_role()) <> 'broker')$p$, t);
    execute format($p$create policy "2fa %1$s" on public.%1$I
      as restrictive for all to authenticated using ((select private.mfa_ok())) with check ((select private.mfa_ok()))$p$, t);
  end loop;
end
$$;

alter table public.index_values enable row level security;
revoke all on public.index_values from anon;
revoke insert, update, delete on public.index_values from authenticated;
create policy "ver indices" on public.index_values for select to authenticated using (true);

-- Bucket privado dos contratos (até 10 MB, o que cabe numa leitura da IA; PDF e imagens).
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('contracts', 'contracts', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
    on conflict (id) do nothing;
  end if;
end
$$;
