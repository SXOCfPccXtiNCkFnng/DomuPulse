"use client";

import clsx from "clsx";
import { ArrowDown, ArrowUp, FileText, Image as ImageIcon, Images, RotateCw, ScrollText, Trash2, Upload } from "lucide-react";
import { degrees, PDFDocument } from "pdf-lib";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, FormMessage, Input } from "@/components/ui/field";

const MAX_BYTES = 100 * 1024 * 1024; // 100 MB
const MAX_PAGES = 300;

type Kind = "pdf" | "image" | "both";
const isPdf = (f: File) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
const isImg = (f: File) => f.type.startsWith("image/") || /\.(jpe?g|png)$/i.test(f.name);
const accepts = (f: File, kind: Kind) => (kind === "pdf" ? isPdf(f) : kind === "image" ? isImg(f) : isPdf(f) || isImg(f));
const acceptAttr = (kind: Kind) => (kind === "pdf" ? "application/pdf" : kind === "image" ? "image/jpeg,image/png" : "application/pdf,image/jpeg,image/png");

function downloadPdf(bytes: Uint8Array, name: string) {
  const file = name.trim().replace(/[\\/:*?"<>|]+/g, "").slice(0, 80) || "documento";
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.toLowerCase().endsWith(".pdf") ? file : `${file}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Junta PDFs e imagens (na ordem) em um único PDF. */
async function combineFiles(files: File[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const f of files) {
    const bytes = await f.arrayBuffer();
    if (isPdf(f)) {
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach((p) => out.addPage(p));
    } else {
      const img = f.type.includes("png") || /\.png$/i.test(f.name) ? await out.embedPng(bytes) : await out.embedJpg(bytes);
      const A4W = 595.28;
      const A4H = 841.89;
      const scale = Math.min((A4W - 48) / img.width, (A4H - 48) / img.height, 1);
      const w = img.width * scale;
      const h = img.height * scale;
      const page = out.addPage([A4W, A4H]);
      page.drawImage(img, { x: (A4W - w) / 2, y: (A4H - h) / 2, width: w, height: h });
    }
  }
  if (out.getPageCount() > MAX_PAGES) throw new Error("too-many-pages");
  return out.save();
}

function Dropzone({ kind, multiple, onPick, label }: { kind: Kind; multiple: boolean; onPick: (files: File[]) => void; label: string }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const take = (list: FileList | null) => {
    if (!list) return;
    const ok = Array.from(list).filter((f) => accepts(f, kind));
    if (ok.length) onPick(ok);
  };
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer.files);
      }}
      className={clsx(
        "flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed p-8 text-center transition-colors",
        over ? "border-brand-text bg-brand-soft" : "border-line-strong bg-surface-2 hover:border-ink",
      )}
    >
      <Upload className="size-6 text-muted" />
      <span className="text-sm font-medium">{label}</span>
      <span className="text-xs text-muted">Até 100 MB no total e 300 páginas. Tudo no seu aparelho, nada é enviado.</span>
      <input
        ref={input}
        type="file"
        accept={acceptAttr(kind)}
        multiple={multiple}
        className="sr-only"
        onChange={(e) => {
          take(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );
}

/** Juntar PDF, Imagens em PDF e Kit do cliente usam o mesmo motor (combinar). */
function Combine({ kind, title, pickLabel, defaultName }: { kind: Kind; title: string; pickLabel: string; defaultName: string }) {
  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const move = (i: number, dir: -1 | 1) =>
    setFiles((cur) => {
      const a = [...cur];
      const j = i + dir;
      if (j < 0 || j >= a.length) return cur;
      [a[i], a[j]] = [a[j], a[i]];
      return a;
    });

  const generate = async () => {
    if (!files.length) return setError("Escolha os arquivos.");
    if (files.reduce((s, f) => s + f.size, 0) > MAX_BYTES) return setError("Os arquivos somam mais de 100 MB.");
    setBusy(true);
    setError(null);
    try {
      downloadPdf(await combineFiles(files), name);
    } catch (e) {
      setError(e instanceof Error && e.message === "too-many-pages" ? "O PDF final passaria de 300 páginas." : "Não foi possível gerar. Confira se os arquivos não têm senha.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <Dropzone kind={kind} multiple onPick={(picked) => setFiles((cur) => [...cur, ...picked])} label={pickLabel} />
      {error ? <FormMessage>{error}</FormMessage> : null}
      {files.length ? (
        <ul className="flex flex-col gap-2">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted">{isPdf(f) ? <FileText className="size-4" /> : <ImageIcon className="size-4" />}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{f.name}</span>
                <span className="block text-xs text-muted">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <IconButton label="Subir" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp className="size-4" /></IconButton>
                <IconButton label="Descer" onClick={() => move(i, 1)} disabled={i === files.length - 1}><ArrowDown className="size-4" /></IconButton>
                <IconButton label="Remover" onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}><Trash2 className="size-4" /></IconButton>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Nome do arquivo" className="flex-1">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </Field>
        <Button onClick={generate} disabled={busy || !files.length} className="h-11">
          {busy ? "Gerando..." : title}
        </Button>
        {files.length ? (
          <Button variant="ghost" onClick={() => setFiles([])} disabled={busy} className="h-11">
            Limpar
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Organizar páginas: girar, apagar e reordenar as páginas de um PDF. */
function Organize() {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<{ src: number; rot: number }[]>([]);
  const [name, setName] = useState("documento-organizado");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async (f: File) => {
    setError(null);
    try {
      const doc = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
      setFile(f);
      setName(f.name.replace(/\.pdf$/i, "") || "documento-organizado");
      setPages(Array.from({ length: doc.getPageCount() }, (_, i) => ({ src: i, rot: 0 })));
    } catch {
      setError("Não consegui abrir esse PDF (pode estar protegido por senha).");
    }
  };

  const move = (i: number, dir: -1 | 1) =>
    setPages((cur) => {
      const a = [...cur];
      const j = i + dir;
      if (j < 0 || j >= a.length) return cur;
      [a[i], a[j]] = [a[j], a[i]];
      return a;
    });

  const generate = async () => {
    if (!file || !pages.length) return setError("Deixe ao menos uma página.");
    setBusy(true);
    setError(null);
    try {
      const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      const out = await PDFDocument.create();
      const copied = await out.copyPages(src, pages.map((p) => p.src));
      copied.forEach((pg, idx) => {
        const rot = pages[idx].rot;
        if (rot) pg.setRotation(degrees((pg.getRotation().angle + rot) % 360));
        out.addPage(pg);
      });
      downloadPdf(await out.save(), name);
    } catch {
      setError("Não foi possível gerar o PDF.");
    } finally {
      setBusy(false);
    }
  };

  if (!file) {
    return (
      <div className="flex flex-col gap-4">
        <Dropzone kind="pdf" multiple={false} onPick={(f) => f[0] && open(f[0])} label="Escolha um PDF para organizar" />
        {error ? <FormMessage>{error}</FormMessage> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="truncate text-sm text-muted">{file.name} · {pages.length} {pages.length === 1 ? "página" : "páginas"}</p>
        <Button size="sm" variant="ghost" onClick={() => { setFile(null); setPages([]); }}>
          Trocar arquivo
        </Button>
      </div>
      {error ? <FormMessage>{error}</FormMessage> : null}
      <ul className="flex flex-col gap-2">
        {pages.map((p, i) => (
          <li key={`${p.src}-${i}`} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-xs font-semibold tabular-nums text-muted">{p.src + 1}</span>
            <span className="min-w-0 flex-1 text-sm">
              Página {p.src + 1}
              {p.rot ? <span className="ml-2 text-xs text-muted">girada {p.rot}°</span> : null}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <IconButton label="Girar" onClick={() => setPages((cur) => cur.map((pg, j) => (j === i ? { ...pg, rot: (pg.rot + 90) % 360 } : pg)))}><RotateCw className="size-4" /></IconButton>
              <IconButton label="Subir" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp className="size-4" /></IconButton>
              <IconButton label="Descer" onClick={() => move(i, 1)} disabled={i === pages.length - 1}><ArrowDown className="size-4" /></IconButton>
              <IconButton label="Apagar" onClick={() => setPages((cur) => cur.filter((_, j) => j !== i))}><Trash2 className="size-4" /></IconButton>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Nome do arquivo" className="flex-1">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </Field>
        <Button onClick={generate} disabled={busy || !pages.length} className="h-11">
          {busy ? "Gerando..." : "Gerar PDF"}
        </Button>
      </div>
    </div>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-30"
    >
      {children}
    </button>
  );
}

const TABS = [
  { id: "merge", label: "Juntar PDF", Icon: FileText },
  { id: "images", label: "Imagens em PDF", Icon: ImageIcon },
  { id: "organize", label: "Organizar páginas", Icon: Images },
  { id: "kit", label: "Kit do cliente", Icon: ScrollText },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function MontarPdfBoard() {
  const [tab, setTab] = useState<TabId>("merge");

  return (
    <div className="flex flex-col gap-5">
      <header className="animate-rise">
        <p className="text-sm text-muted">Documentos</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Montar PDF</h1>
        <p className="mt-1 text-xs text-muted">Junte PDFs, transforme fotos em PDF, organize páginas e monte o documento do cliente. Tudo no seu aparelho: nenhum arquivo é enviado nem fica guardado.</p>
      </header>

      <div role="tablist" aria-label="Ferramenta" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={clsx(
              "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors",
              tab === id ? "border-brand-text bg-brand-soft text-brand-text" : "border-line bg-surface text-ink-2 hover:border-line-strong",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader
          title={TABS.find((t) => t.id === tab)!.label}
          description={
            tab === "merge"
              ? "Vários PDFs viram um só, na ordem que você definir."
              : tab === "images"
                ? "Fotos (JPG ou PNG) viram páginas de um PDF."
                : tab === "organize"
                  ? "Gire, apague e reordene as páginas de um PDF."
                  : "Junte PDFs e fotos do cliente num documento só."
          }
        />
        <div className="p-5 sm:p-6">
          {tab === "merge" ? <Combine kind="pdf" title="Juntar PDFs" pickLabel="Toque para escolher ou arraste os PDFs" defaultName="documentos-juntos" /> : null}
          {tab === "images" ? <Combine kind="image" title="Gerar PDF" pickLabel="Toque para escolher ou arraste as imagens" defaultName="imagens" /> : null}
          {tab === "organize" ? <Organize /> : null}
          {tab === "kit" ? <Combine kind="both" title="Montar kit" pickLabel="Toque para escolher ou arraste PDFs e fotos" defaultName="kit-do-cliente" /> : null}
        </div>
      </Card>
    </div>
  );
}
