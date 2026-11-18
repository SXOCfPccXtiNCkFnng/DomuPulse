import "server-only";
import { siteUrl } from "@/lib/email";
import { googleOAuthEnv } from "@/lib/env.server";

// Escopo mínimo: só os arquivos que o app criar ou que a pessoa escolher no
// Picker. O app nunca enxerga o resto do Drive dela.
export const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/drive.file"];

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export function googleRedirectUri() {
  return siteUrl("/api/google/callback");
}

/** URL para onde mandamos a pessoa autorizar o acesso. */
export function googleAuthUrl(state: string) {
  const { clientId } = googleOAuthEnv();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    // offline + consent garante que venha o refresh token para sincronizar sem a pessoa presente.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
};

/** Troca o código recebido no retorno por tokens (inclui o refresh na 1ª vez). */
export async function exchangeCode(code: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = googleOAuthEnv();
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Falha ao trocar o código do Google (${res.status}).`);
  return (await res.json()) as TokenResponse;
}

/** Usa o refresh token para obter um access token novo na hora de sincronizar. */
export async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const { clientId, clientSecret } = googleOAuthEnv();
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Falha ao renovar o acesso ao Google (${res.status}).`);
  return (await res.json()) as { access_token: string; expires_in: number };
}
