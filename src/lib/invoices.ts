// Notas fiscais: situações, rótulos e regras de arquivo, usados no servidor e na tela.

export const INVOICE_STATUSES = ["processing", "error", "sent", "checked", "paid", "rejected", "canceled"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS: Record<InvoiceStatus, { label: string; tone: "neutral" | "brand" | "warn" | "danger" }> = {
  processing: { label: "Emitindo", tone: "neutral" },
  error: { label: "Erro na emissão", tone: "danger" },
  canceled: { label: "Cancelada", tone: "neutral" },
  sent: { label: "Enviada", tone: "warn" },
  checked: { label: "Conferida", tone: "neutral" },
  paid: { label: "Paga", tone: "brand" },
  rejected: { label: "Recusada", tone: "danger" },
};

/** Próximo passo que a liderança pode dar a partir de cada situação. */
export const NEXT_STATUS: Partial<Record<InvoiceStatus, InvoiceStatus>> = { sent: "checked", checked: "paid" };

export const INVOICE_FILE_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/xml": "xml",
  "text/xml": "xml",
  "image/jpeg": "jpg",
  "image/png": "png",
};
export const INVOICE_MAX_BYTES = 5 * 1024 * 1024;

export type Invoice = {
  id: string;
  member_id: string;
  commission_id: string | null;
  number: string;
  amount_cents: number;
  issued_on: string;
  description: string;
  notes: string | null;
  file_name: string | null;
  source: "upload" | "focus" | "national";
  nfse_number: string | null;
  nfse_pdf_url: string | null;
  nfse_portal_url: string | null;
  issue_error: string | null;
  status: InvoiceStatus;
  review_note: string | null;
  status_changed_at: string;
  paid_at: string | null;
  created_at: string;
};

export const INVOICE_COLUMNS =
  "id, member_id, commission_id, number, amount_cents, issued_on, description, notes, file_name, source, nfse_number, nfse_pdf_url, nfse_portal_url, issue_error, status, review_note, status_changed_at, paid_at, created_at";
