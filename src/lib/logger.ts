import "server-only";
import { after } from "next/server";

type Fields = Record<string, unknown> & { message?: string; orgId?: string | null };

// O mesmo evento repetido em sequência é gravado no máximo a cada 30 s,
// somando as ocorrências: um erro em laço não vira milhares de escritas.
const THROTTLE_MS = 30_000;
const pending = new Map<string, { count: number; lastWrite: number }>();

function persist(level: "warn" | "error", event: string, fields?: Fields) {
  const key = `${level}|${event}`;
  const now = Date.now();
  const state = pending.get(key) ?? { count: 0, lastWrite: 0 };
  state.count++;
  if (now - state.lastWrite < THROTTLE_MS) {
    pending.set(key, state);
    return;
  }
  const count = state.count;
  pending.set(key, { count: 0, lastWrite: now });

  // Import dinâmico: ops usa e-mail, que usa o logger.
  const write = () =>
    import("@/lib/ops")
      .then((m) =>
        m.recordOpsEvent({
          source: event,
          level,
          message: String(fields?.message ?? event),
          orgId: fields?.orgId ?? null,
          meta: fields,
          count,
        }),
      )
      .catch(() => {});

  // Na Vercel, after() garante que a gravação termine depois da resposta.
  try {
    after(write);
  } catch {
    void write();
  }
}

function emit(level: "info" | "warn" | "error", event: string, fields?: Fields) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
  if (level !== "info") persist(level, event, fields);
}

/** Avisos e erros também vão para o painel interno, agrupados. */
export const logger = {
  info: (event: string, fields?: Fields) => emit("info", event, fields),
  warn: (event: string, fields?: Fields) => emit("warn", event, fields),
  error: (event: string, fields?: Fields) => emit("error", event, fields),
};

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const o = error as Record<string, unknown>;
    const parts = [o.message, o.details, o.hint, o.code].filter((v) => typeof v === "string" && v).join(" | ");
    if (parts) return parts;
  }
  return String(error);
}
