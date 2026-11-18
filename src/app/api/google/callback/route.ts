import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentMember, isLeader } from "@/lib/auth";
import { storeGoogleRefreshToken } from "@/lib/google/connection";
import { exchangeCode } from "@/lib/google/oauth";
import { describeError, logger } from "@/lib/logger";

// Retorno do Google: confere o state, troca o código e guarda o refresh token.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const back = (q: string) => NextResponse.redirect(new URL(`/integracoes?${q}`, request.url));

  const jar = await cookies();
  const saved = jar.get("g_oauth_state")?.value;
  jar.delete("g_oauth_state");

  if (params.get("error")) return back("erro=cancelado");
  if (!code || !state || !saved || state !== saved) return back("erro=state");

  let member;
  try {
    member = await getCurrentMember();
  } catch {
    return NextResponse.redirect(new URL("/entrar", request.url));
  }
  if (member.org.segment !== "brokers" || !isLeader(member.role)) return back("erro=sem-permissao");

  try {
    const tokens = await exchangeCode(code);
    // Sem refresh token não dá para sincronizar sozinho depois. Peça para reconectar.
    if (!tokens.refresh_token) return back("erro=sem-refresh");
    await storeGoogleRefreshToken(member.org.id, tokens.refresh_token, member.id);
  } catch (error) {
    logger.error("google.callback", { message: describeError(error), orgId: member.org.id });
    return back("erro=conexao");
  }

  return back("ok=conectado");
}
