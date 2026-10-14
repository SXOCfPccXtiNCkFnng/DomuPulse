import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPlatformAdminEmail } from "@/lib/platform-admins";

const APP_ROUTES = ["/painel", "/ativar", "/clientes", "/relatorios", "/metas", "/agenda", "/equipe", "/conta"];
const AUTH_ROUTES = ["/entrar", "/criar-conta"];

function matches(path: string, routes: string[]) {
  return routes.some((r) => path === r || path.startsWith(`${r}/`));
}

// Renova a sessão do Supabase a cada navegação e faz o redirecionamento
// otimista. A verificação de verdade acontece no banco (RLS) e na camada
// de dados (getCurrentMember); o proxy só evita renderizar telas à toa.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const path = request.nextUrl.pathname;

  const redirectTo = (target: string) => {
    const url = request.nextUrl.clone();
    url.pathname = target;
    url.search = "";
    if (target === "/entrar" || target === "/verificacao") url.searchParams.set("proximo", path);
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  };

  // Painel interno: sem login vai para o login; logado fora da lista
  // (PLATFORM_ADMIN_EMAILS) vê "sem acesso", antes de qualquer dado sair.
  if (matches(path, ["/interno"]) && !isPlatformAdminEmail(data?.claims?.email)) {
    if (!signedIn) return redirectTo("/entrar");
    return NextResponse.rewrite(new URL("/sem-acesso", request.url), { status: 403 });
  }

  if (!signedIn && matches(path, [...APP_ROUTES, "/verificacao"])) return redirectTo("/entrar");

  // Quem ativou a verificação em duas etapas digita o código antes de entrar.
  // O nível vem da sessão local, sem ir à rede. O banco também exige (RLS).
  if (signedIn && matches(path, [...APP_ROUTES, "/interno"])) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") return redirectTo("/verificacao");
  }

  if (signedIn && matches(path, AUTH_ROUTES)) return redirectTo("/painel");

  return response;
}

export const config = {
  matcher: [
    {
      source:
        "/((?!_next/static|_next/image|api/|favicon.ico|sw.js|manifest.webmanifest|icons/|.*\\.(?:png|svg|ico|webp)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
