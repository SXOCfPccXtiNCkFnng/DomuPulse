-- O administrador altera nome, fuso e horários direto pela API (o RLS
-- permite essas três colunas). O formulário valida, mas quem chama a API
-- sem passar por ele não pode gravar um fuso inexistente, que quebraria o
-- cálculo do dia nos relatórios, nem horários fora do formato.

create function private.validate_org_settings()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Fuso horário inválido.';
  end if;
  if (select count(distinct s) from unnest(new.report_slots) s) <> cardinality(new.report_slots) then
    raise exception 'Horários de relatório repetidos.';
  end if;
  if exists (select 1 from unnest(new.report_slots) s where s < '06:00' or s > '23:00') then
    raise exception 'Use horários de relatório entre 06:00 e 23:00.';
  end if;
  new.report_slots := array(select s from unnest(new.report_slots) s order by s);
  return new;
end
$$;

create trigger organizations_validate_settings before insert or update of timezone, report_slots on public.organizations
  for each row execute function private.validate_org_settings();
