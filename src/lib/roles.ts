// Compartilhado entre servidor e cliente (lib/auth é só do servidor).

export type Role = "owner" | "director" | "manager" | "broker";

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Administrador",
  director: "Superintendente",
  manager: "Gerente",
  broker: "Corretor",
};

// Rótulo do papel conforme o segmento: no RH, "corretor" vira "recrutador".
export function roleLabel(role: Role, segment: "brokers" | "hr") {
  if (segment === "hr" && role === "broker") return "Recrutador";
  return ROLE_LABEL[role];
}

// Quanto maior, mais baixo na hierarquia. Mesma ordem do enum no banco.
export const ROLE_RANK: Record<Role, number> = { owner: 0, director: 1, manager: 2, broker: 3 };
