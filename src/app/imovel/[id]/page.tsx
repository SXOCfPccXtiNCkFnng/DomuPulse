import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatMoney } from "@/lib/metrics";
import {
  areaLabel,
  bedroomsLabel,
  DEAL_LABEL,
  PHOTO_BUCKET,
  PROPERTY_COLUMNS,
  PROPERTY_PRICING_COLUMNS,
  propertyLayouts,
  type Property,
  type PropertyPhoto,
} from "@/lib/properties";
import { createAdminClient } from "@/lib/supabase/admin";
import { PropertyPublicView } from "./property-public-view";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

async function getPropertyData(id: string) {
  // Validação básica de uuid
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return null;
  }

  const admin = createAdminClient();

  // Tenta buscar o imóvel completo com colunas novas
  let property: Record<string, unknown> | null = null;
  const initial = await admin
    .from("properties")
    .select(`${PROPERTY_PRICING_COLUMNS}, org_id`)
    .eq("id", id)
    .maybeSingle();

  property = initial.data;
  let error = initial.error;

  // Se o banco ainda não tiver as colunas novas, tenta com as padrão
  if (error?.code === "42703") {
    const fallback = await admin
      .from("properties")
      .select(`${PROPERTY_COLUMNS}, org_id`)
      .eq("id", id)
      .maybeSingle();
    property = fallback.data;
    error = fallback.error;
  }

  if (error || !property || property.status === "inactive") {
    return null;
  }

  // Busca fotos ordenadas
  const { data: photosData } = await admin
    .from("property_photos")
    .select("id, path, sort")
    .eq("property_id", id)
    .order("sort");

  const photos: PropertyPhoto[] = (photosData ?? []).map((p) => ({
    id: p.id,
    url: admin.storage.from(PHOTO_BUCKET).getPublicUrl(p.path).data.publicUrl,
  }));

  // Busca nome da imobiliária e telefone do WhatsApp conectado
  const [{ data: org }, { data: waConn }] = await Promise.all([
    admin.from("organizations").select("name").eq("id", property.org_id).maybeSingle(),
    admin.from("wa_connections").select("phone, status").eq("org_id", property.org_id).maybeSingle(),
  ]);

  return {
    property: property as unknown as Property,
    photos,
    orgName: org?.name ?? "Imobiliária",
    companyPhone: waConn?.status === "connected" && waConn.phone ? waConn.phone : null,
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const data = await getPropertyData(id);

  if (!data) {
    return {
      title: "Imóvel não encontrado",
      robots: { index: false, follow: false },
    };
  }

  const { property: p, photos, orgName } = data;
  const deal = DEAL_LABEL[p.deal] ?? "Imóvel";
  const price = p.price_cents != null ? formatMoney(p.price_cents) : "";
  const place = [p.neighborhood, p.city].filter(Boolean).join(", ");
  const layouts = propertyLayouts(p);
  const beds = bedroomsLabel(layouts);
  const area = areaLabel(layouts);
  const specs = [deal, price, beds, area, place].filter(Boolean).join(" · ");

  const title = `${p.title} | ${orgName}`;
  const description = specs || p.notes?.slice(0, 160) || "Confira os detalhes e fotos deste imóvel.";
  const coverUrl = photos[0]?.url;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: coverUrl
        ? [
            {
              url: coverUrl,
              width: 1200,
              height: 630,
              alt: p.title,
            },
          ]
        : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: coverUrl ? [coverUrl] : [],
    },
  };
}

export default function PropertyPublicPage({ params, searchParams }: PageProps) {
  return (
    <Suspense fallback={<div className="min-h-dvh animate-pulse bg-surface-2" />}>
      <PropertyPublic params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function PropertyPublic({ params, searchParams }: PageProps) {
  const { id } = await params;
  const search = await searchParams;

  const data = await getPropertyData(id);
  if (!data) notFound();

  // Permite passar telefone customizado via query (?w=5511... ou ?contato=...)
  const directPhone =
    typeof search.w === "string"
      ? search.w
      : typeof search.contato === "string"
        ? search.contato
        : typeof search.tel === "string"
          ? search.tel
          : null;

  const whatsappPhone = directPhone || data.companyPhone;

  return (
    <PropertyPublicView
      property={data.property}
      photos={data.photos}
      orgName={data.orgName}
      whatsappPhone={whatsappPhone}
    />
  );
}