-- Sem teste grátis aberto: a conta nasce aguardando ativação. O acesso
-- gratuito passa a vir de cupons de "dias grátis", entregues pela DomuTech
-- a quem ela escolher. Cupom de desconto (%) continua valendo na assinatura.

alter table public.organizations alter column trial_ends_at set default now();

alter table public.coupons alter column percent_off drop not null;
alter table public.coupons add column free_days int check (free_days between 1 and 365);
alter table public.coupons add constraint coupons_one_benefit
  check ((percent_off is not null) <> (free_days is not null));

-- Cada imobiliária usa cada cupom uma vez só.
create table public.coupon_redemptions (
  org_id uuid not null references public.organizations (id) on delete cascade,
  code text not null references public.coupons (code) on update cascade,
  redeemed_at timestamptz not null default now(),
  primary key (org_id, code)
);

alter table public.coupon_redemptions enable row level security;
revoke all on public.coupon_redemptions from anon, authenticated;

-- Resgate atômico: confere validade, registra o uso pela imobiliária e
-- soma no contador, tudo ou nada. Devolve o benefício, ou nada se o cupom
-- não vale ou essa imobiliária já usou.
drop function public.redeem_coupon(text);

create function public.redeem_coupon(p_code text, p_org uuid)
returns table (percent_off numeric, free_days int)
language plpgsql security definer set search_path = ''
as $$
declare
  c public.coupons;
begin
  select * into c from public.coupons
  where code = upper(p_code)
    and active
    and (expires_at is null or expires_at > now())
    and (max_redemptions is null or redemption_count < max_redemptions)
  for update;
  if not found then
    return;
  end if;

  insert into public.coupon_redemptions (org_id, code) values (p_org, c.code)
  on conflict do nothing;
  if not found then
    return;
  end if;

  update public.coupons set redemption_count = redemption_count + 1 where code = c.code;
  return query select c.percent_off, c.free_days;
end
$$;

revoke all on function public.redeem_coupon(text, uuid) from public, anon, authenticated;
grant execute on function public.redeem_coupon(text, uuid) to service_role;
