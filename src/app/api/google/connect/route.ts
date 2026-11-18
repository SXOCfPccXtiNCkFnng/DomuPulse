import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentMember, isLeader } from "@/lib/auth";
import { googleAuthUrl } from "@/lib/google/oauth";

// Início da conexão: confere quem é e manda para a tela de autorização do Google.
// /api não passa pelo proxy, então a checagem de acesso é feita aqui.
export async function GET(request: NextRequest) {
  let member;
  try {
    member = await getCurrentMember();
  } catch {
    return NextResponse.redirect(new URL("/entrar", request.url));
  }
  if (member.org.segment !== "brokers" || !isLeader(member.role)) {
    return NextResponse.redirect(new URL("/integracoes?erro=sem-permissao", request.url));
  }

  const state = randomBytes(16).toString("hex");
  const jar = await cookies();
  jar.set("g_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return NextResponse.redirect(googleAuthUrl(state));
}
