-- Distinguir "conta excluída pela própria pessoa" de "desativada pela
-- liderança", e permitir tirar da lista da equipe sem perder o histórico de
-- relatórios (a linha do membro continua existindo; só não aparece mais).
alter table public.members
  add column account_deleted_at timestamptz,
  add column hidden_at timestamptz;
