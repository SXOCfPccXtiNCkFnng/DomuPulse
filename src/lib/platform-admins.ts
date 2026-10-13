// Lista de e-mails com acesso ao painel interno (PLATFORM_ADMIN_EMAILS).
// Separado do restante para o proxy também poder usar.
export function platformAdminEmails(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
}

export function isPlatformAdminEmail(email: unknown): boolean {
  return typeof email === "string" && platformAdminEmails().includes(email.toLowerCase());
}
