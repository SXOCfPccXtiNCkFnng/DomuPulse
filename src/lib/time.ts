// Datas sempre no fuso da organização. O sistema antigo usava UTC e, depois
// das 21h no Brasil, gravava o relatório no dia seguinte.

export const DEFAULT_TIMEZONE = "America/Sao_Paulo";

export function todayIn(timezone: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

export function minutesNowIn(timezone: string, at: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

// O Postgres devolve "12:00:00"; a interface usa "12:00".
export function normalizeSlot(slot: string): string {
  return slot.slice(0, 5);
}

export function slotMinutes(slot: string): number {
  const [h, m] = slot.split(":").map(Number);
  return h * 60 + m;
}

export function slotLabel(slot: string): string {
  const [h, m] = normalizeSlot(slot).split(":");
  return m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}`;
}

export function addDays(date: string, amount: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0, 10);
}

export function startOfWeek(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const weekday = (d.getUTCDay() + 6) % 7; // segunda = 0
  return addDays(date, -weekday);
}

export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function formatDate(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

export function formatLongDate(date: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

// Diferença entre o fuso informado e UTC, em milissegundos, no instante dado.
function zoneOffset(at: Date, timezone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - at.getTime();
}

// "2026-10-13" + "14:30" no fuso da organização, como instante ISO.
export function zonedToIso(date: string, time: string, timezone: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, min);
  return new Date(guess - zoneOffset(new Date(guess), timezone)).toISOString();
}

export function formatTimeIn(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function dateIn(iso: string, timezone: string): string {
  return todayIn(timezone, new Date(iso));
}

export type SlotState ="upcoming" | "open" | "late";

// Janela abre 10 minutos antes do horário e é considerada atrasada 15 minutos depois.
export const SLOT_OPENS_BEFORE = 10;
export const SLOT_LATE_AFTER = 15;

export function slotState(slot: string, nowMinutes: number): SlotState {
  const at = slotMinutes(normalizeSlot(slot));
  if (nowMinutes < at - SLOT_OPENS_BEFORE) return "upcoming";
  if (nowMinutes < at + SLOT_LATE_AFTER) return "open";
  return "late";
}
