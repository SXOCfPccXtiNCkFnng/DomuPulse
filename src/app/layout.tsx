import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import { THEME_BOOT_SCRIPT } from "@/lib/theme-script";
import { ServiceWorkerRegister } from "@/components/sw-register";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Domu Pulse", template: "%s | Domu Pulse" },
  description:
    "O pulso da sua operação empresa em tempo real. Relatórios por horário, funil, ranking e agenda da equipe em um só lugar.",
  applicationName: "Domu Pulse",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Pulse", statusBarStyle: "black-translucent" },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0f2a5f",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // O script do tema altera data-theme antes da hidratação.
    <html
      lang="pt-BR"
      className={`${inter.variable} ${bricolage.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
