import type { CurrentMember } from "@/lib/auth";

// O que o servidor entrega para os componentes de cliente. Só dados de
// exibição: nada aqui concede acesso, quem decide é o RLS.
export type ClientMember = CurrentMember;
