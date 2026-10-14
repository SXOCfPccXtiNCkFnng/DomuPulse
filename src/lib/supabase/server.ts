import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { publicEnv } from "@/lib/env";

// Cliente com a sessão do usuário: todas as consultas passam pelo RLS.
// Sessão é sempre do pedido atual: connection() tira o login do pré-carregamento
// parcial, onde o Date.now() que o Supabase usa para validar o token é proibido.
export async function createClient() {
  await connection();
  const { supabaseUrl, supabaseKey } = publicEnv();
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components não podem gravar cookies. O proxy renova a sessão.
        }
      },
    },
  });
}
