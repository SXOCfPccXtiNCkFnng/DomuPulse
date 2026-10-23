// Plano único: valor fixo por conta, por mês, sem limite de pessoas. O valor
// vigente fica no banco (platform_settings) e muda pelo painel interno; este
// é só o padrão enquanto a migração não rodou.
export const DEFAULT_MONTHLY_PRICE_CENTS = 50000;

// Valor mensal com o desconto do cupom, quando houver.
export function monthlyPriceCents(baseCents: number, percentOff = 0) {
  return Math.round(baseCents * (1 - percentOff / 100));
}

// O que está incluído na assinatura, mostrado na ativação e na conta.
export const PLAN_FEATURES = [
  "Corretores e equipes sem limite",
  "Painel ao vivo e ranking",
  "Lembretes no celular",
  "Carteira de clientes e agenda",
  "Metas, comissões e relatórios",
  "Resumo semanal por e-mail",
];

// Versão para contas de RH (recrutamento).
export const HR_PLAN_FEATURES = [
  "Equipe de RH sem limite",
  "Recepção dos candidatos automatizada",
  "Currículos organizados e pontuados",
  "Ranking de candidatos por vaga",
  "Aprovar ou recusar com um clique",
  "Banco de talentos e agenda de entrevistas",
];

export function planFeatures(segment: "brokers" | "hr") {
  return segment === "hr" ? HR_PLAN_FEATURES : PLAN_FEATURES;
}
