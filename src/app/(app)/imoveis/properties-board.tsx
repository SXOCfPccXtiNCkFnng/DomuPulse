"use client";

import clsx from "clsx";
import { BedDouble, Building2, MapPin, Pencil, Plus, Ruler, Search, Trash2, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Field, FormMessage, Input, Select } from "@/components/ui/field";
import { formatMoney } from "@/lib/metrics";
import { centsToInput, maskMoneyInput } from "@/lib/money";
import {
  areaLabel,
  bedroomsLabel,
  DEAL_LABEL,
  formatPct,
  PROPERTY_KINDS,
  PROPERTY_STATUS,
  propertyLayouts,
  type Property,
  type PropertyLayout,
  type PropertyStatus,
} from "@/lib/properties";
import type { FormState } from "@/lib/validation";
import { createProperty, deleteProperty, updateProperty } from "./actions";

const STATUS_KEYS = Object.keys(PROPERTY_STATUS) as PropertyStatus[];
const textarea =
  "w-full resize-y rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[15px] hover:border-line-strong focus:border-ink focus:outline-none";

export function PropertiesBoard({
  properties,
  clientCounts,
  canManage,
  missingTable,
  missingDetails = false,
}: {
  properties: Property[];
  clientCounts: Record<string, number>;
  canManage: boolean;
  missingTable: boolean;
  missingDetails?: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Property | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | PropertyStatus>("all");

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      properties.filter(
        (p) =>
          (status === "all" || p.status === status) &&
          (!q || [p.title, p.code, p.neighborhood, p.city, p.kind].some((v) => v?.toLowerCase().includes(q))),
      ),
    [properties, status, q],
  );
  const counts = useMemo(() => {
    const c: Partial<Record<"all" | PropertyStatus, number>> = { all: properties.length };
    for (const p of properties) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [properties]);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4 animate-rise">
        <div>
          <p className="text-sm text-muted">Carteira da imobiliária</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Imóveis</h1>
        </div>
        {canManage ? (
          <Button onClick={() => setCreating(true)} disabled={missingTable} className="w-full sm:w-auto">
            <Plus className="size-4" />
            Novo imóvel
          </Button>
        ) : null}
      </header>

      {missingTable ? (
        <p className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">
          O cadastro de imóveis ainda não foi ativado no banco de dados. Rode a atualização <code>20261106000000_properties.sql</code> no Supabase.
        </p>
      ) : missingDetails && canManage ? (
        <p className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">
          Para usar opções de quartos, valor garantido e % pós-chaves, rode a atualização <code>20261112000000_property_details.sql</code> no Supabase.
        </p>
      ) : !canManage ? (
        <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-ink-2">
          Estes são os imóveis cadastrados pela liderança. Ao cadastrar um cliente, você escolhe um deles no campo &quot;Imóvel de interesse&quot;.
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative w-full sm:max-w-xs">
          <span className="sr-only">Buscar imóvel</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome, código ou bairro"
            className="h-10 w-full rounded-xl border border-line bg-surface pr-3 pl-9 text-sm outline-none focus:border-ink"
          />
        </label>
        <div role="tablist" aria-label="Situação" className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1 [scrollbar-width:none]">
          {(["all", ...STATUS_KEYS] as const).map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={status === s}
              onClick={() => setStatus(s)}
              className={clsx(
                "flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors",
                status === s ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
              )}
            >
              {s === "all" ? "Todos" : PROPERTY_STATUS[s].label}
              <span className="text-xs tabular-nums text-muted">{counts[s] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 px-6 py-14 text-center">
          <Building2 className="size-8 text-muted" />
          <p className="font-medium">{properties.length === 0 ? "Nenhum imóvel cadastrado" : "Nenhum imóvel com esses filtros"}</p>
          <p className="max-w-sm text-sm text-muted">
            {canManage ? "Cadastre os imóveis da carteira. Os corretores escolhem um deles ao adicionar um cliente." : "Quando a liderança cadastrar imóveis, eles aparecem aqui."}
          </p>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((p) => (
            <PropertyCard key={p.id} property={p} clients={clientCounts[p.id] ?? 0} canManage={canManage} onEdit={() => setEditing(p)} />
          ))}
        </ul>
      )}

      {creating ? <PropertyDialog onClose={() => setCreating(false)} /> : null}
      {editing ? <PropertyDialog property={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function PropertyCard({ property: p, clients, canManage, onEdit }: { property: Property; clients: number; canManage: boolean; onEdit: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmDel, setConfirmDel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const st = PROPERTY_STATUS[p.status];
  const place = [p.neighborhood, p.city].filter(Boolean).join(", ");
  const layouts = propertyLayouts(p);
  const bedrooms = bedroomsLabel(layouts);
  const area = areaLabel(layouts);

  const remove = () =>
    start(async () => {
      const r = await deleteProperty(p.id);
      if ("error" in r) {
        setError(r.error ?? null);
        setConfirmDel(false);
      } else router.refresh();
    });

  return (
    <li>
      <Card className="flex h-full flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted">
              {[p.kind, DEAL_LABEL[p.deal], p.code ? `Ref. ${p.code}` : null].filter(Boolean).join(" · ")}
            </p>
            <h2 className="mt-0.5 truncate font-display text-lg font-semibold">{p.title}</h2>
          </div>
          <Badge tone={st.tone}>{st.label}</Badge>
        </div>

        {p.price_cents != null || p.guaranteed_cents != null || p.post_keys_pct != null ? (
          <div>
            {p.price_cents != null ? (
              <p className="font-display text-xl font-semibold tabular-nums">
                {formatMoney(p.price_cents)}
                {p.deal === "locacao" ? <span className="text-sm font-normal text-muted">/mês</span> : null}
              </p>
            ) : null}
            {p.guaranteed_cents != null ? (
              <p className="text-sm text-ink-2 tabular-nums">
                <span className="text-muted">Garantido:</span> {formatMoney(p.guaranteed_cents)}
              </p>
            ) : null}
            {p.post_keys_pct != null ? (
              <p className="mt-1.5">
                <span className="inline-flex items-center rounded-md bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand-text">
                  Pós chaves: {formatPct(Number(p.post_keys_pct))}
                </span>
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2">
          {place ? (
            <span className="flex items-center gap-1.5">
              <MapPin className="size-3.5 text-muted" />
              {place}
            </span>
          ) : null}
          {bedrooms ? (
            <span className="flex items-center gap-1.5">
              <BedDouble className="size-3.5 text-muted" />
              {bedrooms}
            </span>
          ) : null}
          {area ? (
            <span className="flex items-center gap-1.5">
              <Ruler className="size-3.5 text-muted" />
              {area}
            </span>
          ) : null}
        </div>
        {layouts.length > 1 ? (
          <ul className="flex flex-wrap gap-1.5">
            {layouts.map((l, i) => (
              <li key={i} className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-ink-2">
                {[l.bedrooms != null ? `${l.bedrooms} ${l.bedrooms === 1 ? "quarto" : "quartos"}` : null, l.area_m2 != null ? `${l.area_m2} m²` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </li>
            ))}
          </ul>
        ) : null}

        {p.notes ? <p className="line-clamp-2 text-sm text-muted">{p.notes}</p> : null}

        <p className="flex items-center gap-1.5 text-sm text-muted">
          <Users className="size-3.5" />
          {clients} {clients === 1 ? "cliente interessado" : "clientes interessados"}
        </p>

        {error ? <p className="text-xs text-danger">{error}</p> : null}

        {canManage ? (
          <div className="mt-auto flex flex-wrap gap-1.5 border-t border-line pt-3">
            <Button size="sm" variant="ghost" onClick={onEdit} disabled={pending}>
              <Pencil className="size-3.5" />
              Editar
            </Button>
            {confirmDel ? (
              <span className="flex items-center gap-1.5">
                <Button size="sm" variant="danger" onClick={remove} disabled={pending}>
                  Confirmar exclusão
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDel(false)}>
                  Cancelar
                </Button>
              </span>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirmDel(true)} disabled={pending} aria-label="Apagar imóvel">
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
        ) : null}
      </Card>
    </li>
  );
}

type LayoutRow = { key: number; bedrooms: string; area: string };

/** Opções de quartos: cada linha é uma planta (quartos + área). */
function LayoutsField({ initial, error }: { initial: PropertyLayout[]; error?: string }) {
  const nextKey = useRef(initial.length + 1);
  const [rows, setRows] = useState<LayoutRow[]>(() =>
    initial.length
      ? initial.map((l, i) => ({ key: i, bedrooms: l.bedrooms != null ? String(l.bedrooms) : "", area: l.area_m2 != null ? String(l.area_m2) : "" }))
      : [{ key: 0, bedrooms: "", area: "" }],
  );
  const update = (key: number, patch: Partial<LayoutRow>) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <fieldset className="flex flex-col gap-2 sm:col-span-2">
      <legend className="mb-1.5 text-[13px] font-medium text-ink-2">Quartos e área</legend>
      {rows.map((r, i) => (
        <div key={r.key} className="flex items-end gap-2">
          <Field label={rows.length > 1 ? `Opção ${i + 1}: quartos` : "Quartos"} className="flex-1">
            <Input
              name="layoutBedrooms"
              value={r.bedrooms}
              onChange={(e) => update(r.key, { bedrooms: e.target.value.replace(/\D/g, "").slice(0, 2) })}
              inputMode="numeric"
              placeholder="2"
            />
          </Field>
          <Field label="Área (m²)" className="flex-1">
            <Input
              name="layoutArea"
              value={r.area}
              onChange={(e) => update(r.key, { area: e.target.value.replace(/\D/g, "").slice(0, 7) })}
              inputMode="numeric"
              placeholder="45"
            />
          </Field>
          {rows.length > 1 ? (
            <button
              type="button"
              onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))}
              aria-label={`Remover opção ${i + 1}`}
              className="mb-0.5 grid size-10 shrink-0 place-items-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger"
            >
              <Trash2 className="size-4" />
            </button>
          ) : null}
        </div>
      ))}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      {rows.length < 10 ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="self-start"
          onClick={() => setRows((list) => [...list, { key: nextKey.current++, bedrooms: "", area: "" }])}
        >
          <Plus className="size-3.5" />
          Adicionar outra opção de quartos
        </Button>
      ) : null}
    </fieldset>
  );
}

function PropertyDialog({ property: p, onClose }: { property?: Property; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [price, setPrice] = useState(centsToInput(p?.price_cents ?? null));
  const [guaranteed, setGuaranteed] = useState(centsToInput(p?.guaranteed_cents ?? null));
  const action = p ? updateProperty.bind(null, p.id) : createProperty;
  const [state, formAction, pending] = useActionState(async (prev: FormState, data: FormData) => {
    const r = await action(prev, data);
    if (r.success) {
      router.refresh();
      onClose();
    }
    return r;
  }, {} as FormState);

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && onClose()}
      className="mx-auto mt-auto mb-0 w-full max-w-none max-h-[92dvh] overflow-y-auto rounded-t-card border border-line bg-surface p-0 text-ink shadow-card backdrop:bg-black/50 sm:m-auto sm:max-h-[calc(100dvh-2rem)] sm:w-[min(38rem,calc(100vw-2rem))] sm:rounded-card"
    >
      <form action={formAction} className="flex flex-col gap-4 p-5 sm:p-6" noValidate>
        <header className="flex items-start justify-between gap-4">
          <h2 className="font-display text-xl font-semibold tracking-tight">{p ? "Editar imóvel" : "Novo imóvel"}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="grid size-10 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 sm:size-8">
            <X className="size-4" />
          </button>
        </header>
        {state.error ? <FormMessage>{state.error}</FormMessage> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome do imóvel" error={state.fieldErrors?.title} className="sm:col-span-2">
            <Input name="title" defaultValue={p?.title} maxLength={120} placeholder="Ex.: Apartamento Residencial Jardins" required autoFocus />
          </Field>
          <Field label="Tipo" error={state.fieldErrors?.kind}>
            <Select name="kind" defaultValue={p?.kind ?? ""}>
              <option value="">Não informado</option>
              {PROPERTY_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Negócio" error={state.fieldErrors?.deal}>
            <Select name="deal" defaultValue={p?.deal ?? "venda"}>
              <option value="venda">Venda</option>
              <option value="locacao">Locação</option>
            </Select>
          </Field>
          <Field label="Código de referência" hint="Opcional" error={state.fieldErrors?.code}>
            <Input name="code" defaultValue={p?.code ?? ""} maxLength={30} placeholder="Ex.: AP-102" />
          </Field>
          <Field label="Situação" error={state.fieldErrors?.status}>
            <Select name="status" defaultValue={p?.status ?? "available"}>
              {STATUS_KEYS.map((s) => (
                <option key={s} value={s}>
                  {PROPERTY_STATUS[s].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Bairro" error={state.fieldErrors?.neighborhood}>
            <Input name="neighborhood" defaultValue={p?.neighborhood ?? ""} maxLength={120} />
          </Field>
          <Field label="Cidade" error={state.fieldErrors?.city}>
            <Input name="city" defaultValue={p?.city ?? ""} maxLength={80} />
          </Field>
          <div className="flex flex-col gap-2">
            <Field label="Valor do imóvel" error={state.fieldErrors?.price}>
              <span className="relative block">
                <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[15px] text-muted">R$</span>
                <Input name="price" value={price} onChange={(e) => setPrice(maskMoneyInput(e.target.value))} inputMode="decimal" placeholder="450.000" className="pl-11" />
              </span>
            </Field>
            <Field label="Valor garantido" hint="Opcional" error={state.fieldErrors?.guaranteed}>
              <span className="relative block">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted">R$</span>
                <Input
                  name="guaranteed"
                  value={guaranteed}
                  onChange={(e) => setGuaranteed(maskMoneyInput(e.target.value))}
                  inputMode="decimal"
                  placeholder="400.000"
                  className="h-9 pl-10 text-sm"
                />
              </span>
            </Field>
          </div>
          <Field label="% Pós Chaves" hint="Opcional" error={state.fieldErrors?.postKeys}>
            <span className="relative block">
              <Input
                name="postKeys"
                defaultValue={p?.post_keys_pct != null ? String(p.post_keys_pct).replace(".", ",") : ""}
                inputMode="decimal"
                maxLength={6}
                placeholder="30"
                className="pr-9"
              />
              <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-[15px] text-muted">%</span>
            </span>
          </Field>
          <LayoutsField initial={p ? propertyLayouts(p) : []} error={state.fieldErrors?.layouts} />
          <Field label="Observações" hint="Opcional" error={state.fieldErrors?.notes} className="sm:col-span-2">
            <textarea name="notes" defaultValue={p?.notes ?? ""} rows={3} maxLength={2000} placeholder="Vagas de garagem, condomínio, diferenciais..." className={textarea} />
          </Field>
        </div>

        <footer className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Salvando..." : p ? "Salvar" : "Cadastrar imóvel"}
          </Button>
        </footer>
      </form>
    </dialog>
  );
}
