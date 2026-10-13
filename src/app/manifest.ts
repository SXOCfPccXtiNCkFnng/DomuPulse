import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/painel",
    name: "Domu Pulse",
    short_name: "Pulse",
    description: "O pulso da sua operação imobiliária em tempo real.",
    lang: "pt-BR",
    start_url: "/painel",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f2a5f",
    theme_color: "#0f2a5f",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Enviar relatório", url: "/painel" },
      { name: "Agenda", url: "/agenda" },
    ],
  };
}
