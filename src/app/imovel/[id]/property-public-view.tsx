"use client";

import clsx from "clsx";
import {
  BedDouble,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  MapPin,
  Maximize2,
  MessageCircle,
  Ruler,
  Share2,
  X,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/metrics";
import {
  areaLabel,
  bedroomsLabel,
  DEAL_LABEL,
  formatPct,
  PROPERTY_STATUS,
  propertyLayouts,
  type Property,
  type PropertyPhoto,
} from "@/lib/properties";

export function PropertyPublicView({
  property: p,
  photos,
  orgName,
  whatsappPhone,
}: {
  property: Property;
  photos: PropertyPhoto[];
  orgName: string;
  whatsappPhone: string | null;
}) {
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const layouts = propertyLayouts(p);
  const bedrooms = bedroomsLabel(layouts);
  const area = areaLabel(layouts);
  const place = [p.neighborhood, p.city].filter(Boolean).join(", ");
  const st = PROPERTY_STATUS[p.status];

  // WhatsApp link
  const cleanPhone = whatsappPhone ? whatsappPhone.replace(/\D/g, "") : null;
  const waTarget = cleanPhone ? (cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone) : null;
  const refText = p.code ? ` (Ref. ${p.code})` : "";
  const waMessage = `Olá! Vi o anúncio do imóvel *${p.title}*${refText} e gostaria de saber mais informações.`;
  const waUrl = waTarget ? `https://wa.me/${waTarget}?text=${encodeURIComponent(waMessage)}` : null;

  const prevPhoto = useCallback(() => {
    setActivePhotoIdx((curr) => (curr > 0 ? curr - 1 : photos.length - 1));
  }, [photos.length]);

  const nextPhoto = useCallback(() => {
    setActivePhotoIdx((curr) => (curr < photos.length - 1 ? curr + 1 : 0));
  }, [photos.length]);

  // Teclado na galeria aberta
  useEffect(() => {
    if (!lightboxOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxOpen(false);
      else if (e.key === "ArrowLeft") prevPhoto();
      else if (e.key === "ArrowRight") nextPhoto();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxOpen, prevPhoto, nextPhoto]);

  async function share() {
    const shareData = {
      title: `${p.title} · ${orgName}`,
      text: `Confira este imóvel: ${p.title}`,
      url: window.location.href,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // Ignora se o usuário cancelou
      }
    }
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignora erro de cópia
    }
  }

  const activePhoto = photos[activePhotoIdx];

  return (
    <div className="min-h-dvh bg-bg text-ink">
      {/* Barra superior de navegação / marca */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/85 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-brand-soft text-brand-text">
              <Building2 className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight">{orgName}</p>
              <p className="text-[11px] text-muted">Imóvel para {DEAL_LABEL[p.deal].toLowerCase()}</p>
            </div>
          </div>
          <Button size="sm" variant="secondary" onClick={share} className="gap-1.5 text-xs">
            {copied ? <Check className="size-3.5 text-ok" /> : <Share2 className="size-3.5" />}
            {copied ? "Link copiado!" : "Compartilhar"}
          </Button>
        </div>
      </header>

      {/* Conteúdo principal */}
      <main className="mx-auto max-w-5xl px-4 py-6 pb-28 sm:py-8 sm:pb-12">
        <div className="grid gap-8 lg:grid-cols-12 lg:items-start">
          {/* Coluna da Esquerda: Fotos e Detalhes */}
          <div className="flex flex-col gap-6 lg:col-span-8">
            {/* Galeria de Fotos */}
            {photos.length > 0 ? (
              <div className="flex flex-col gap-3">
                <div className="group relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-line bg-surface-2 shadow-sm sm:aspect-[16/9]">
                  <Image
                    src={activePhoto.url}
                    alt={`${p.title} - Foto ${activePhotoIdx + 1}`}
                    fill
                    priority
                    className="cursor-pointer object-cover transition-transform duration-300 group-hover:scale-[1.01]"
                    sizes="(max-width: 1024px) 100vw, 800px"
                    onClick={() => setLightboxOpen(true)}
                  />

                  {/* Botões de avançar/voltar */}
                  {photos.length > 1 ? (
                    <>
                      <button
                        type="button"
                        onClick={prevPhoto}
                        aria-label="Foto anterior"
                        className="absolute top-1/2 left-3 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-all hover:bg-black/70 sm:size-9"
                      >
                        <ChevronLeft className="size-5" />
                      </button>
                      <button
                        type="button"
                        onClick={nextPhoto}
                        aria-label="Próxima foto"
                        className="absolute top-1/2 right-3 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-all hover:bg-black/70 sm:size-9"
                      >
                        <ChevronRight className="size-5" />
                      </button>
                    </>
                  ) : null}

                  {/* Contador de fotos e botão de expandir */}
                  <div className="absolute right-3 bottom-3 flex items-center gap-2">
                    <span className="rounded-lg bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm tabular-nums">
                      {activePhotoIdx + 1} / {photos.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => setLightboxOpen(true)}
                      aria-label="Ver em tela cheia"
                      className="grid size-8 place-items-center rounded-lg bg-black/60 text-white backdrop-blur-sm hover:bg-black/80"
                    >
                      <Maximize2 className="size-4" />
                    </button>
                  </div>
                </div>

                {/* Miniaturas */}
                {photos.length > 1 ? (
                  <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
                    {photos.map((photo, i) => (
                      <button
                        key={photo.id}
                        type="button"
                        onClick={() => setActivePhotoIdx(i)}
                        className={clsx(
                          "relative aspect-video w-20 shrink-0 overflow-hidden rounded-lg border-2 transition-all sm:w-24",
                          i === activePhotoIdx ? "border-brand ring-2 ring-brand/30" : "border-line opacity-70 hover:opacity-100",
                        )}
                      >
                        <Image src={photo.url} alt={`Miniatura ${i + 1}`} fill className="object-cover" sizes="96px" />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-line bg-surface-2 p-6 text-center">
                <Building2 className="size-12 text-muted" />
                <p className="text-sm font-medium text-muted">Fotos em breve</p>
              </div>
            )}

            {/* Cabeçalho do Imóvel no Mobile */}
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={st.tone}>{st.label}</Badge>
                {p.kind ? <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-ink-2">{p.kind}</span> : null}
                <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-ink-2">{DEAL_LABEL[p.deal]}</span>
                {p.code ? <span className="text-xs text-muted">Ref. {p.code}</span> : null}
              </div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">{p.title}</h1>
              {place ? (
                <p className="flex items-center gap-1.5 text-sm text-ink-2">
                  <MapPin className="size-4 shrink-0 text-muted" />
                  {place}
                </p>
              ) : null}
            </div>

            {/* Destaques (Quartos, Área) */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {bedrooms ? (
                <Card className="flex items-center gap-3 p-3.5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-2">
                    <BedDouble className="size-5" />
                  </span>
                  <div>
                    <p className="text-xs text-muted">Quartos</p>
                    <p className="font-semibold text-ink">{bedrooms}</p>
                  </div>
                </Card>
              ) : null}
              {area ? (
                <Card className="flex items-center gap-3 p-3.5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-2">
                    <Ruler className="size-5" />
                  </span>
                  <div>
                    <p className="text-xs text-muted">Área</p>
                    <p className="font-semibold text-ink">{area}</p>
                  </div>
                </Card>
              ) : null}
              <Card className="col-span-2 flex items-center gap-3 p-3.5 sm:col-span-1">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-2">
                  <Building2 className="size-5" />
                </span>
                <div>
                  <p className="text-xs text-muted">Tipo de negócio</p>
                  <p className="font-semibold text-ink">{DEAL_LABEL[p.deal]}</p>
                </div>
              </Card>
            </div>

            {/* Opções de Planta se houver mais de uma */}
            {layouts.length > 1 ? (
              <Card className="flex flex-col gap-3 p-4">
                <h2 className="font-display text-base font-semibold">Opções de planta disponíveis</h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  {layouts.map((l, i) => (
                    <div key={i} className="flex items-center justify-between rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm">
                      <span className="font-medium text-ink">
                        {l.bedrooms != null ? `${l.bedrooms} ${l.bedrooms === 1 ? "quarto" : "quartos"}` : "Sem quartos informados"}
                      </span>
                      <span className="text-muted">{l.area_m2 != null ? `${l.area_m2} m²` : ""}</span>
                    </div>
                  ))}
                </div>
              </Card>
            ) : null}

            {/* Descrição / Observações */}
            {p.notes ? (
              <Card className="flex flex-col gap-3 p-5">
                <h2 className="font-display text-base font-semibold">Sobre o imóvel</h2>
                <div className="prose prose-sm max-w-none text-ink-2 whitespace-pre-line leading-relaxed">
                  {p.notes}
                </div>
              </Card>
            ) : null}
          </div>

          {/* Coluna da Direita: Card de Ação e Preço (Desktop) */}
          <div className="hidden lg:col-span-4 lg:block">
            <Card className="sticky top-20 flex flex-col gap-5 p-6 shadow-md">
              <div>
                <p className="text-xs font-medium text-muted uppercase tracking-wider">
                  Valor para {DEAL_LABEL[p.deal].toLowerCase()}
                </p>
                {p.price_cents != null ? (
                  <p className="mt-1 font-display text-3xl font-bold tracking-tight text-ink tabular-nums">
                    {formatMoney(p.price_cents)}
                    {p.deal === "locacao" ? <span className="text-base font-normal text-muted">/mês</span> : null}
                  </p>
                ) : (
                  <p className="mt-1 font-display text-2xl font-bold text-ink">Consulte o valor</p>
                )}

                {p.guaranteed_cents != null ? (
                  <p className="mt-1 text-sm text-ink-2 tabular-nums">
                    <span className="text-muted">Valor garantido:</span> {formatMoney(p.guaranteed_cents)}
                  </p>
                ) : null}

                {p.post_keys_pct != null ? (
                  <div className="mt-2">
                    <span className="inline-flex items-center rounded-md bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand-text">
                      Pós chaves: {formatPct(Number(p.post_keys_pct))}
                    </span>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col gap-2.5 border-t border-line pt-4">
                {waUrl ? (
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 font-semibold text-white shadow-sm transition-all hover:bg-[#20bd5a] hover:shadow"
                  >
                    <MessageCircle className="size-5" />
                    Conversar no WhatsApp
                  </a>
                ) : (
                  <div className="rounded-xl bg-surface-2 p-3 text-center text-xs text-muted">
                    Atendimento via WhatsApp indisponível no momento.
                  </div>
                )}
                <Button variant="ghost" onClick={share} className="w-full gap-2 text-xs">
                  <Copy className="size-3.5" />
                  {copied ? "Link copiado!" : "Copiar link deste anúncio"}
                </Button>
              </div>

              <div className="rounded-xl bg-surface-2 p-3.5 text-xs text-muted">
                <p className="font-medium text-ink-2">Anúncio por {orgName}</p>
                <p className="mt-0.5">Fale diretamente com nossa equipe para agendar uma visita ou tirar dúvidas.</p>
              </div>
            </Card>
          </div>
        </div>
      </main>

      {/* Barra Fixa Flutuante no Mobile */}
      <aside aria-label="Ações de contato" className="fixed right-0 bottom-0 left-0 z-20 border-t border-line bg-surface/95 px-4 py-3 shadow-lg backdrop-blur-md lg:hidden">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-muted">Valor {DEAL_LABEL[p.deal].toLowerCase()}</p>
            <p className="truncate font-display text-lg font-bold text-ink tabular-nums">
              {p.price_cents != null ? formatMoney(p.price_cents) : "Sob consulta"}
              {p.deal === "locacao" && p.price_cents != null ? <span className="text-xs font-normal text-muted">/m</span> : null}
            </p>
          </div>
          {waUrl ? (
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-5 font-semibold text-white shadow-sm active:scale-95"
            >
              <MessageCircle className="size-4" />
              WhatsApp
            </a>
          ) : (
            <Button size="sm" variant="secondary" onClick={share}>
              Compartilhar
            </Button>
          )}
        </div>
      </aside>

      {/* Modal Lightbox de Foto em Tela Cheia */}
      {lightboxOpen && photos.length > 0 ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Foto em tela cheia"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4 backdrop-blur-md"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            aria-label="Fechar"
            className="absolute top-4 right-4 z-10 grid size-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <X className="size-6" />
          </button>

          <div
            className="relative max-h-[85vh] max-w-[95vw] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative h-[80vh] w-[90vw]">
              <Image
                src={activePhoto.url}
                alt={`${p.title} - Foto ${activePhotoIdx + 1}`}
                fill
                className="object-contain"
                sizes="100vw"
                priority
              />
            </div>
            {photos.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={prevPhoto}
                  aria-label="Foto anterior"
                  className="absolute top-1/2 left-3 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
                >
                  <ChevronLeft className="size-6" />
                </button>
                <button
                  type="button"
                  onClick={nextPhoto}
                  aria-label="Próxima foto"
                  className="absolute top-1/2 right-3 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
                >
                  <ChevronRight className="size-6" />
                </button>
                <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs font-medium text-white tabular-nums">
                  {activePhotoIdx + 1} de {photos.length}
                </span>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}