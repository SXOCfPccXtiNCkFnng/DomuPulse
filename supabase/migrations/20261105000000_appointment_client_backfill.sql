-- Liga as visitas antigas (criadas antes do vínculo) ao cliente que já estava
-- cadastrado, quando batem empresa, corretor e telefone (só dígitos). É seguro:
-- casa só por telefone igual, nunca por nome. Visita sem telefone fica sem
-- vínculo e continua funcionando como antes.
update public.appointments a
set client_id = c.id
from public.clients c
where a.client_id is null
  and a.org_id = c.org_id
  and a.member_id = c.member_id
  and a.client_phone is not null
  and length(regexp_replace(a.client_phone, '\D', '', 'g')) >= 8
  and regexp_replace(a.client_phone, '\D', '', 'g') = regexp_replace(coalesce(c.phone, ''), '\D', '', 'g');
