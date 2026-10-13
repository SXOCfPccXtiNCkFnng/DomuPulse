-- Pulse: recursos de plataforma
--
-- Limite de tentativas, aceite dos termos, registro de erros, batimentos dos
-- crons e cupons. Nenhuma destas tabelas é acessível pelo cliente: só o
-- servidor (service role) lê e grava.

-- --------------------------------------------------------------------------
-- Limite de tentativas
--
-- O limite em memória vale por instância; em hospedagem serverless há várias
-- instâncias e um ataque distribuído contorna. Aqui a contagem é atômica no
-- banco e vale para todas.
-- --------------------------------------------------------------------------

create table public.rate_limits (
  key text primary key check (char_length(key) <= 200),
  count int not null default 0,
  reset_at timestamptz not null
);

create index rate_limits_reset_idx on public.rate_limits (reset_at);

create function public.hit_rate_limit(p_key text, p_window_seconds int)
returns table (hits int, resets_at timestamptz)
language sql security definer set search_path = ''
as $$
  insert into public.rate_limits as r (key, count, reset_at)
  values (left(p_key, 200), 1, now() + make_interval(secs => p_window_seconds))
  on conflict (key) do update set
    count = case when r.reset_at <= now() then 1 else r.count + 1 end,
    reset_at = case when r.reset_at <= now() then now() + make_interval(secs => p_window_seconds) else r.reset_at end
  returning r.count, r.reset_at
$$;

-- --------------------------------------------------------------------------
-- Aceite dos termos (prova de consentimento, LGPD) e contato do cadastro
-- --------------------------------------------------------------------------

alter table public.members
  add column terms_accepted_at timestamptz,
  add column terms_version text check (char_length(terms_version) <= 40),
  add column terms_accepted_ip text check (char_length(terms_accepted_ip) <= 64);

alter table public.organizations
  add column contact_phone text check (contact_phone ~ '^[0-9]{10,11}$');

-- --------------------------------------------------------------------------
-- Registro de erros do painel interno
--
-- O mesmo erro repetido vira uma linha com contador (fingerprint). Resolvido
-- sai da lista de abertos; se voltar a acontecer, abre uma linha nova.
-- --------------------------------------------------------------------------

create table public.ops_alerts (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null,
  source text not null check (char_length(source) <= 80),
  level text not null check (level in ('error', 'warn')),
  message text not null check (char_length(message) <= 2000),
  org_id uuid references public.organizations (id) on delete set null,
  meta jsonb not null default '{}'::jsonb,
  occurrences int not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text
);

create unique index ops_alerts_open_fingerprint on public.ops_alerts (fingerprint) where resolved_at is null;
create index ops_alerts_last_seen_idx on public.ops_alerts (last_seen_at desc);

-- Devolve true quando o erro é novo (ou voltou depois de resolvido): é a
-- hora de avisar a equipe por e-mail. Repetições só somam no contador.
create function public.record_ops_event(
  p_fingerprint text, p_source text, p_level text, p_message text,
  p_org_id uuid, p_meta jsonb, p_count int
)
returns boolean
language sql security definer set search_path = ''
as $$
  insert into public.ops_alerts as a (fingerprint, source, level, message, org_id, meta, occurrences)
  values (p_fingerprint, p_source, p_level, p_message, p_org_id, coalesce(p_meta, '{}'::jsonb), greatest(p_count, 1))
  on conflict (fingerprint) where resolved_at is null do update set
    occurrences = a.occurrences + greatest(p_count, 1),
    last_seen_at = now(),
    message = excluded.message,
    meta = excluded.meta,
    level = excluded.level,
    org_id = coalesce(excluded.org_id, a.org_id)
  returning (xmax = 0)
$$;

-- --------------------------------------------------------------------------
-- Batimentos: última execução de cada cron e último evento de cada webhook.
-- Mostra "o cron parou" antes de um cliente reclamar.
-- --------------------------------------------------------------------------

create table public.system_heartbeats (
  name text primary key check (char_length(name) <= 80),
  last_run_at timestamptz not null default now(),
  last_ok_at timestamptz,
  last_error text,
  last_result jsonb not null default '{}'::jsonb,
  run_count bigint not null default 0
);

create function public.record_heartbeat(p_name text, p_ok boolean, p_result jsonb, p_error text)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.system_heartbeats as h (name, last_run_at, last_ok_at, last_error, last_result, run_count)
  values (p_name, now(), case when p_ok then now() end, case when p_ok then null else left(p_error, 1000) end, coalesce(p_result, '{}'::jsonb), 1)
  on conflict (name) do update set
    last_run_at = now(),
    last_ok_at = case when p_ok then now() else h.last_ok_at end,
    last_error = case when p_ok then null else left(p_error, 1000) end,
    last_result = coalesce(p_result, '{}'::jsonb),
    run_count = h.run_count + 1
$$;

-- --------------------------------------------------------------------------
-- Cupons e controle da assinatura
-- --------------------------------------------------------------------------

create table public.coupons (
  code text primary key check (code ~ '^[A-Z0-9]{3,30}$'),
  percent_off numeric(5, 2) not null check (percent_off > 0 and percent_off <= 100),
  description text check (char_length(description) <= 200),
  active boolean not null default true,
  max_redemptions int check (max_redemptions > 0),
  redemption_count int not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.organizations
  add column coupon_code text references public.coupons (code) on update cascade,
  -- Assentos da assinatura pedida; viram "seats" quando o pagamento confirma.
  add column subscribed_seats int check (subscribed_seats > 0),
  add column trial_reminder_sent_at timestamptz,
  add column trial_ended_notified_at timestamptz;

-- Resgate atômico: só conta se o cupom ainda vale. Devolve o desconto ou nada.
create function public.redeem_coupon(p_code text)
returns numeric
language sql security definer set search_path = ''
as $$
  update public.coupons set redemption_count = redemption_count + 1
  where code = upper(p_code)
    and active
    and (expires_at is null or expires_at > now())
    and (max_redemptions is null or redemption_count < max_redemptions)
  returning percent_off
$$;

-- --------------------------------------------------------------------------
-- Permissões: tudo aqui é só do servidor
-- --------------------------------------------------------------------------

alter table public.rate_limits enable row level security;
alter table public.ops_alerts enable row level security;
alter table public.system_heartbeats enable row level security;
alter table public.coupons enable row level security;

revoke all on public.rate_limits, public.ops_alerts, public.system_heartbeats, public.coupons
  from anon, authenticated;

revoke all on function public.hit_rate_limit(text, int) from public, anon, authenticated;
revoke all on function public.record_ops_event(text, text, text, text, uuid, jsonb, int) from public, anon, authenticated;
revoke all on function public.record_heartbeat(text, boolean, jsonb, text) from public, anon, authenticated;
revoke all on function public.redeem_coupon(text) from public, anon, authenticated;

grant execute on function public.hit_rate_limit(text, int) to service_role;
grant execute on function public.record_ops_event(text, text, text, text, uuid, jsonb, int) to service_role;
grant execute on function public.record_heartbeat(text, boolean, jsonb, text) to service_role;
grant execute on function public.redeem_coupon(text) to service_role;
