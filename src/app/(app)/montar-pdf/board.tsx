"use client";

import clsx from "clsx";
import { ArrowDown, ArrowUp, FileText, Image as ImageIcon, Images, Paperclip, RotateCw, ScrollText, Trash2, Upload } from "lucide-react";
import { degrees, PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, FormMessage, Input, Select } from "@/components/ui/field";

const MAX_BYTES = 100 * 1024 * 1024; // 100 MB
const MAX_PAGES = 300;

type Kind = "pdf" | "image" | "both";
const isPdf = (f: File) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
const isImg = (f: File) => f.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(f.name);
const accepts = (f: File, kind: Kind) => (kind === "pdf" ? isPdf(f) : kind === "image" ? isImg(f) : isPdf(f) || isImg(f));
const acceptAttr = (kind: Kind) => (kind === "pdf" ? "application/pdf" : kind === "image" ? "image/jpeg,image/png,image/webp" : "application/pdf,image/jpeg,image/png,image/webp");

function downloadPdf(bytes: Uint8Array, name: string) {
  const file = name.trim().replace(/[\\/:*?"<>|]+/g, "").slice(0, 80) || "documento";
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = file.toLowerCase().endsWith(".pdf") ? file : `${file}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

// Converte qualquer imagem (inclusive WEBP) em JPEG pelo canvas, aplicando a
// qualidade escolhida e um fundo branco (JPEG não tem transparência).
async function imageToJpeg(file: File, quality: number): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
  if (!blob) throw new Error("encode");
  return new Uint8Array(await blob.arrayBuffer());
}

type PageOpts = { size: "a4" | "carta"; orientation: "auto" | "retrato" | "paisagem"; margin: number };
const DEFAULT_OPTS: PageOpts = { size: "a4", orientation: "auto", margin: 24 };

async function addImagePage(out: PDFDocument, jpg: Uint8Array, opts: PageOpts) {
  const img = await out.embedJpg(jpg);
  const base = opts.size === "carta" ? [612, 792] : [595.28, 841.89];
  const landscape = opts.orientation === "paisagem" || (opts.orientation === "auto" && img.width > img.height);
  const pw = landscape ? base[1] : base[0];
  const ph = landscape ? base[0] : base[1];
  const availW = pw - 2 * opts.margin;
  const availH = ph - 2 * opts.margin;
  const scale = Math.min(availW / img.width, availH / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  const page = out.addPage([pw, ph]);
  page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
}

async function copyPdfInto(out: PDFDocument, bytes: ArrayBuffer) {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = await out.copyPages(src, src.getPageIndices());
  pages.forEach((p) => out.addPage(p));
}

function mapError(e: unknown) {
  return e instanceof Error && e.message === "too-many-pages" ? "O PDF final passaria de 300 páginas." : "Não foi possível gerar. Confira se os arquivos não têm senha.";
}
const ensureLimit = (out: PDFDocument) => {
  if (out.getPageCount() > MAX_PAGES) throw new Error("too-many-pages");
};

function Dropzone({ kind, multiple, onPick, label, sub }: { kind: Kind; multiple: boolean; onPick: (files: File[]) => void; label: string; sub: string }) {
  const [over, setOver] = useState(false);
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
      <span className="text-xs text-muted">{sub}</span>
      <input
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

function FileRow({ f, onUp, onDown, onRemove, upDisabled, downDisabled }: { f: File; onUp?: () => void; onDown?: () => void; onRemove: () => void; upDisabled?: boolean; downDisabled?: boolean }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted">{isPdf(f) ? <FileText className="size-4" /> : <ImageIcon className="size-4" />}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{f.name}</span>
        <span className="block text-xs text-muted">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        {onUp ? <IconButton label="Subir" onClick={onUp} disabled={upDisabled}><ArrowUp className="size-4" /></IconButton> : null}
        {onDown ? <IconButton label="Descer" onClick={onDown} disabled={downDisabled}><ArrowDown className="size-4" /></IconButton> : null}
        <IconButton label="Remover" onClick={onRemove}><Trash2 className="size-4" /></IconButton>
      </span>
    </li>
  );
}

/** Juntar PDF: vários PDFs viram um. */
function MergePdf() {
  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState("documentos-juntos");
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
    if (!files.length) return setError("Escolha os PDFs.");
    if (files.reduce((s, f) => s + f.size, 0) > MAX_BYTES) return setError("Os arquivos somam mais de 100 MB.");
    setBusy(true);
    setError(null);
    try {
      const out = await PDFDocument.create();
      for (const f of files) await copyPdfInto(out, await f.arrayBuffer());
      ensureLimit(out);
      downloadPdf(await out.save(), name);
    } catch (e) {
      setError(mapError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <Dropzone kind="pdf" multiple onPick={(p) => setFiles((c) => [...c, ...p])} label="Toque para escolher ou arraste os PDFs" sub="Até 100 MB no total e 300 páginas. Tudo no seu aparelho, nada é enviado." />
      {error ? <FormMessage>{error}</FormMessage> : null}
      {files.length ? (
        <ul className="flex flex-col gap-2">
          {files.map((f, i) => (
            <FileRow key={`${f.name}-${i}`} f={f} onUp={() => move(i, -1)} onDown={() => move(i, 1)} upDisabled={i === 0} downDisabled={i === files.length - 1} onRemove={() => setFiles((c) => c.filter((_, j) => j !== i))} />
          ))}
        </ul>
      ) : null}
      <GenerateBar name={name} setName={setName} onGenerate={generate} busy={busy} disabled={!files.length} onClear={files.length ? () => setFiles([]) : undefined} label="Juntar PDFs" />
    </div>
  );
}

/** Imagens em PDF, com ajuste de página. */
function ImagesToPdf() {
  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState("fotos");
  const [size, setSize] = useState<PageOpts["size"]>("a4");
  const [orientation, setOrientation] = useState<PageOpts["orientation"]>("auto");
  const [margin, setMargin] = useState("24");
  const [quality, setQuality] = useState("0.72");
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
    if (!files.length) return setError("Escolha as imagens.");
    if (files.reduce((s, f) => s + f.size, 0) > MAX_BYTES) return setError("As imagens somam mais de 100 MB.");
    setBusy(true);
    setError(null);
    try {
      const out = await PDFDocument.create();
      const opts: PageOpts = { size, orientation, margin: Number(margin) };
      for (const f of files) await addImagePage(out, await imageToJpeg(f, Number(quality)), opts);
      ensureLimit(out);
      downloadPdf(await out.save(), name);
    } catch (e) {
      setError(mapError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <Dropzone kind="image" multiple onPick={(p) => setFiles((c) => [...c, ...p])} label="Toque para escolher ou arraste as imagens" sub="JPG, PNG ou WEBP. Até 100 MB no total." />
      {error ? <FormMessage>{error}</FormMessage> : null}
      {files.length ? (
        <ul className="flex flex-col gap-2">
          {files.map((f, i) => (
            <FileRow key={`${f.name}-${i}`} f={f} onUp={() => move(i, -1)} onDown={() => move(i, 1)} upDisabled={i === 0} downDisabled={i === files.length - 1} onRemove={() => setFiles((c) => c.filter((_, j) => j !== i))} />
          ))}
        </ul>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Tamanho da página">
          <Select value={size} onChange={(e) => setSize(e.target.value as PageOpts["size"])}>
            <option value="a4">A4</option>
            <option value="carta">Carta</option>
          </Select>
        </Field>
        <Field label="Orientação">
          <Select value={orientation} onChange={(e) => setOrientation(e.target.value as PageOpts["orientation"])}>
            <option value="auto">Automática</option>
            <option value="retrato">Retrato</option>
            <option value="paisagem">Paisagem</option>
          </Select>
        </Field>
        <Field label="Margem">
          <Select value={margin} onChange={(e) => setMargin(e.target.value)}>
            <option value="0">Nenhuma</option>
            <option value="24">Pequena</option>
            <option value="48">Média</option>
          </Select>
        </Field>
        <Field label="Qualidade">
          <Select value={quality} onChange={(e) => setQuality(e.target.value)}>
            <option value="0.72">Compacta (arquivo menor)</option>
            <option value="0.92">Alta</option>
          </Select>
        </Field>
      </div>

      <GenerateBar name={name} setName={setName} onGenerate={generate} busy={busy} disabled={!files.length} onClear={files.length ? () => setFiles([]) : undefined} label="Converter em PDF" />
    </div>
  );
}

/** Organizar páginas de um PDF: girar, apagar e reordenar. */
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
        <Dropzone kind="pdf" multiple={false} onPick={(f) => f[0] && open(f[0])} label="Escolha um PDF para organizar" sub="Tudo no seu aparelho, nada é enviado." />
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
      <GenerateBar name={name} setName={setName} onGenerate={generate} busy={busy} disabled={!pages.length} label="Gerar PDF" />
    </div>
  );
}

const KIT_ITEMS = [
  { id: "identidade", title: "Documento de identidade", hint: "RG ou CNH, frente e verso" },
  { id: "cpf", title: "CPF", hint: "Se o número não estiver no RG ou na CNH" },
  { id: "estado_civil", title: "Estado civil", hint: "Certidão de nascimento ou de casamento" },
  { id: "residencia", title: "Comprovante de residência", hint: "Conta de luz, água ou telefone recente" },
  { id: "renda", title: "Comprovante de renda", hint: "Holerites, extrato bancário ou declaração de IR" },
  { id: "trabalho", title: "Carteira de trabalho / FGTS", hint: "Páginas da carteira ou extrato do FGTS" },
  { id: "outros", title: "Outros documentos", hint: "Qualquer outro documento pedido" },
] as const;

/** Kit do cliente: checklist de documentos (vários arquivos por item) viram um PDF, com capa opcional. */
function ClientKit({ clients }: { clients: { id: string; name: string }[] }) {
  const [client, setClient] = useState("");
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [cover, setCover] = useState(true);
  const [name, setName] = useState("kit-do-cliente");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const addTo = (id: string, list: FileList | null) => {
    if (!list) return;
    const ok = Array.from(list).filter((f) => isPdf(f) || isImg(f));
    if (ok.length) setFiles((cur) => ({ ...cur, [id]: [...(cur[id] ?? []), ...ok] }));
  };
  const removeFrom = (id: string, i: number) => setFiles((cur) => ({ ...cur, [id]: (cur[id] ?? []).filter((_, j) => j !== i) }));

  const generate = async () => {
    const used = KIT_ITEMS.filter((it) => files[it.id]?.length);
    if (!used.length) return setError("Anexe ao menos um documento.");
    const total = Object.values(files).flat().reduce((s, f) => s + f.size, 0);
    if (total > MAX_BYTES) return setError("Os arquivos somam mais de 100 MB.");
    setBusy(true);
    setError(null);
    try {
      const out = await PDFDocument.create();
      if (cover) {
        const font = await out.embedFont(StandardFonts.Helvetica);
        const bold = await out.embedFont(StandardFonts.HelveticaBold);
        const page = out.addPage([595.28, 841.89]);
        const gray = rgb(0.4, 0.45, 0.55);
        let y = 780;
        page.drawText("Documentos do cliente", { x: 48, y, size: 22, font: bold });
        y -= 30;
        if (client.trim()) {
          page.drawText(client.trim().slice(0, 80), { x: 48, y, size: 14, font });
          y -= 22;
        }
        page.drawText(new Date().toLocaleDateString("pt-BR"), { x: 48, y, size: 11, font, color: gray });
        y -= 34;
        page.drawText("Documentos incluidos:", { x: 48, y, size: 12, font: bold });
        y -= 20;
        for (const it of used) {
          page.drawText(`- ${it.title}`, { x: 56, y, size: 12, font });
          y -= 18;
        }
      }
      for (const it of used) {
        for (const f of files[it.id]) {
          if (isPdf(f)) await copyPdfInto(out, await f.arrayBuffer());
          else await addImagePage(out, await imageToJpeg(f, 0.72), DEFAULT_OPTS);
        }
      }
      ensureLimit(out);
      downloadPdf(await out.save(), name || `kit-${client.trim() || "cliente"}`);
    } catch (e) {
      setError(mapError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Field label="Cliente" hint={clients.length ? "Comece a digitar para buscar na sua carteira, ou digite um nome novo." : "Digite o nome do cliente."}>
          <Input list="kit-clients" value={client} onChange={(e) => setClient(e.target.value)} placeholder="Nome do cliente" maxLength={80} />
        </Field>
        <datalist id="kit-clients">
          {clients.map((c) => (
            <option key={c.id} value={c.name} />
          ))}
        </datalist>
      </div>

      {error ? <FormMessage>{error}</FormMessage> : null}

      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted">Anexe cada documento (PDF ou foto). Pode anexar mais de um arquivo por item (frente e verso). Os itens sem arquivo ficam de fora.</p>
        {KIT_ITEMS.map((it) => {
          const list = files[it.id] ?? [];
          return (
            <div key={it.id} className="rounded-xl border border-line p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <span className={clsx("size-2 rounded-full", list.length ? "bg-ok" : "bg-surface-3")} />
                    {it.title}
                  </span>
                  <span className="block text-xs text-muted">{it.hint}</span>
                </span>
                <Button size="sm" variant="secondary" onClick={() => inputs.current[it.id]?.click()}>
                  <Paperclip className="size-3.5" />
                  Anexar
                </Button>
                <input
                  ref={(el) => {
                    inputs.current[it.id] = el;
                  }}
                  type="file"
                  accept={acceptAttr("both")}
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    addTo(it.id, e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>
              {list.length ? (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {list.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-xs text-ink-2">
                      {isPdf(f) ? <FileText className="size-3.5 shrink-0 text-muted" /> : <ImageIcon className="size-3.5 shrink-0 text-muted" />}
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      <button type="button" onClick={() => removeFrom(it.id, i)} aria-label="Remover" className="text-muted hover:text-danger">
                        <Trash2 className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" checked={cover} onChange={(e) => setCover(e.target.checked)} className="size-4 accent-[var(--brand)]" />
        Incluir uma capa com o nome do cliente e a lista de documentos
      </label>

      <GenerateBar name={name} setName={setName} onGenerate={generate} busy={busy} disabled={false} onClear={() => setFiles({})} label="Montar kit" />
    </div>
  );
}

function GenerateBar({ name, setName, onGenerate, busy, disabled, onClear, label }: { name: string; setName: (v: string) => void; onGenerate: () => void; busy: boolean; disabled: boolean; onClear?: () => void; label: string }) {
  return (
    <div className="flex flex-wrap items-end gap-3 border-t border-line pt-4">
      <Field label="Nome do arquivo" className="flex-1">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      </Field>
      <Button onClick={onGenerate} disabled={busy || disabled} className="h-11">
        {busy ? "Gerando..." : label}
      </Button>
      {onClear ? (
        <Button variant="ghost" onClick={onClear} disabled={busy} className="h-11">
          Limpar
        </Button>
      ) : null}
    </div>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-30">
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

export function MontarPdfBoard({ clients }: { clients: { id: string; name: string }[] }) {
  const [tab, setTab] = useState<TabId>("merge");
  const active = TABS.find((t) => t.id === tab)!;

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
          title={active.label}
          description={
            tab === "merge"
              ? "Vários PDFs viram um só, na ordem que você definir."
              : tab === "images"
                ? "Fotos (JPG, PNG ou WEBP) viram páginas de um PDF."
                : tab === "organize"
                  ? "Gire, apague e reordene as páginas de um PDF."
                  : "Junte os documentos do cliente num PDF só, com capa opcional."
          }
        />
        <div className="p-5 sm:p-6">
          {tab === "merge" ? <MergePdf /> : null}
          {tab === "images" ? <ImagesToPdf /> : null}
          {tab === "organize" ? <Organize /> : null}
          {tab === "kit" ? <ClientKit clients={clients} /> : null}
        </div>
      </Card>
    </div>
  );
}
