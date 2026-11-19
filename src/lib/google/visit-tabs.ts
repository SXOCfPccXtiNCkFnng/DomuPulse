import "server-only";
import { addDays, todayIn } from "@/lib/time";
import { startOfVisitWeek } from "@/lib/visits";

// Descobre o mês e a semana de cada aba da planilha, para calcular a data das
// visitas (ex.: aba "AGENDAMENTOS SETEMBRO" + "SEMANA 4" + SÁBADO -> um sábado
// da 4ª semana de setembro). É aproximado (a planilha não tem a data exata).

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const PT_MONTHS: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};
const PT_ABBR: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

/** Mês a partir do nome da aba (nome completo ou abreviado: SETEMBRO/SET/ABR). Null se não achar. */
export function monthFromTitle(title: string): number | null {
  const n = norm(title);
  for (const [name, m] of Object.entries(PT_MONTHS)) if (n.includes(name)) return m;
  const abbr = n.match(/\b(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\b/);
  return abbr ? PT_ABBR[abbr[1]] : null;
}

/** Abas de arquivo (ex.: "AGENDAMENTOS QUE NÃO VIERAM ABR") não são sincronizadas. */
export function isArchiveTitle(title: string): boolean {
  const n = norm(title);
  return n.includes("nao vieram") || n.includes("que nao v");
}

/** A aba deve ser sincronizada? Precisa ter um mês reconhecível e não ser arquivo. */
export function syncableMonth(title: string): number | null {
  if (isArchiveTitle(title)) return null;
  return monthFromTitle(title);
}

/** Número da semana a partir do rótulo "SEMANA N" no topo da aba (padrão 1). */
export function weekFromGrid(grid: string[][]): number {
  for (let i = 0; i < Math.min(grid.length, 25); i++) {
    for (const c of grid[i] ?? []) {
      const m = norm(String(c ?? "")).match(/semana\s*(\d+)/);
      if (m) return Math.max(1, Number(m[1]));
    }
  }
  return 1;
}

/**
 * Início (quinta) da N-ésima semana de visitas do mês. O ano é o mais recente
 * que não cai no futuro (ex.: em novembro, "SETEMBRO" = setembro deste ano).
 */
export function tabWeekStart(month: number, week: number, tz: string): string {
  const today = todayIn(tz);
  const curYear = Number(today.slice(0, 4));
  const curMonth = Number(today.slice(5, 7));
  const year = month > curMonth ? curYear - 1 : curYear;
  const firstDay = `${year}-${String(month).padStart(2, "0")}-01`;
  return addDays(startOfVisitWeek(firstDay), (Math.max(1, week) - 1) * 7);
}
