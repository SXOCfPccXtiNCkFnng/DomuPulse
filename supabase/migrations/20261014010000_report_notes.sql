-- Observação opcional do corretor junto com o relatório do horário.
alter table public.reports add column notes text check (char_length(notes) <= 500);
