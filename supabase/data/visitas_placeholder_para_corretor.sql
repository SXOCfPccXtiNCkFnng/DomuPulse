-- Troca "Cliente da planilha (sem nome)" pelo nome do corretor (display_name).
-- Pode rodar mais de uma vez: na segunda não acha mais o placeholder.

begin;

update public.appointments a
set client_name = left(m.display_name, 120)
from public.members m
where a.member_id = m.id
  and a.client_name = 'Cliente da planilha (sem nome)';

select a.client_name, m.display_name as corretor, count(*) as qtd
from public.appointments a
join public.members m on m.id = a.member_id
where a.notes like '%criado para bater o quadro%'
group by a.client_name, m.display_name
order by m.display_name;

commit;
