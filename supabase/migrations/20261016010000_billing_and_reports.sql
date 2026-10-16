-- (#2) Suspensão "pegajosa": quando a DomuTech suspende à mão, ou quando há
-- estorno/chargeback, a conta não pode ser reativada por um pagamento atrasado
-- que chegue depois. Só "Liberar acesso" no painel interno limpa isso.
alter table public.organizations
  add column suspended_at timestamptz;

-- (#8) O próprio corretor não pode editar um relatório antigo nem mudar a data
-- ou o dono dele (evita remarcar um relatório velho como de hoje). A liderança
-- continua podendo corrigir qualquer dia.
create or replace function private.validate_report()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  org public.organizations;
  local_today date;
  target public.members;
begin
  select * into org from public.organizations where id = new.org_id;
  select * into target from public.members where id = new.member_id;
  local_today := (now() at time zone org.timezone)::date;

  if not target.active or target.role <> 'broker' then
    raise exception 'Relatórios só podem ser lançados para corretores ativos.';
  end if;

  if not (new.report_slot = any (org.report_slots)) then
    raise exception 'Horário de relatório inválido.';
  end if;

  if new.report_date > local_today then
    raise exception 'Não é possível lançar relatório para uma data futura.';
  end if;

  -- O próprio corretor só edita hoje e ontem. A liderança pode corrigir qualquer dia.
  if target.user_id = auth.uid() and new.report_date < local_today - 1 then
    raise exception 'Prazo para editar este relatório encerrado. Fale com seu gerente.';
  end if;

  -- Numa edição do próprio corretor: não mexe em relatório antigo nem muda a
  -- data/dono de um relatório já lançado.
  if tg_op = 'UPDATE' and target.user_id = auth.uid() then
    if old.report_date < local_today - 1 then
      raise exception 'Prazo para editar este relatório encerrado. Fale com seu gerente.';
    end if;
    if new.report_date <> old.report_date or new.member_id <> old.member_id then
      raise exception 'Não é possível mudar a data ou o dono de um relatório já lançado.';
    end if;
  end if;

  return new;
end
$$;
