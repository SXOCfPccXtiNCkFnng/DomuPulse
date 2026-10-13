import { Check, Clock, Timer } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme";
import { Logo } from "@/components/ui/logo";

// Prévia do que a liderança vê: os horários do dia e quem já entregou.
const SLOTS = [
  { time: "12h", label: "Entregue", Icon: Check, tone: "bg-[#8fb2ff] text-[#071633]" },
  { time: "15h", label: "Aberto", Icon: Timer, tone: "bg-white/15 text-white" },
  { time: "18h", label: "Em breve", Icon: Clock, tone: "bg-white/[0.06] text-[#9fb0cf]" },
  { time: "21h", label: "Em breve", Icon: Clock, tone: "bg-white/[0.06] text-[#9fb0cf]" },
];

const FEED = [
  { name: "Marina", action: "entregou o relatório das 15h", value: "4 visitas" },
  { name: "Rafael", action: "registrou uma venda", value: "R$ 780 mil" },
  { name: "Equipe Norte", action: "bateu a meta da semana", value: "112%" },
];

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh">
      <div className="flex w-full flex-col px-5 py-6 sm:px-10 lg:w-[46%] lg:px-16">
        <div className="flex items-center justify-between">
          <Link href="/" aria-label="Domu Pulse, página inicial">
            <Logo />
          </Link>
          <ThemeToggle />
        </div>
        <main className="flex flex-1 items-center py-10">
          <div className="w-full max-w-[400px] animate-rise">{children}</div>
        </main>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span>Domu Pulse, um produto DomuTech</span>
          <Link href="/termos" className="hover:text-ink">Termos de Uso</Link>
          <Link href="/privacidade" className="hover:text-ink">Privacidade</Link>
        </p>
      </div>

      <aside
        aria-hidden="true"
        className="relative hidden flex-1 overflow-hidden bg-[linear-gradient(160deg,#0f2a5f_0%,#071633_55%,#02050b_100%)] text-[#eef2fa] lg:flex lg:flex-col lg:justify-between lg:p-14"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(#8fb2ff 1px, transparent 1px), linear-gradient(90deg, #8fb2ff 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        <div className="relative">
          <p className="font-display text-[2.6rem] font-semibold leading-[1.05] tracking-tight">
            Cada relatório
            <br />
            da equipe, no seu
            <br />
            painel, <span className="text-[#8fb2ff]">na hora.</span>
          </p>
          <p className="mt-5 max-w-sm text-[15px] text-[#9fb0cf]">
            Cada relatório, visita e venda aparece no painel da liderança no momento em que acontece.
          </p>
        </div>

        <div className="relative rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5 backdrop-blur">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-sm text-[#9fb0cf]">Relatório das 15h</p>
            <p className="font-display text-sm font-semibold tabular-nums">14 de 18 entregues</p>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-[78%] rounded-full bg-[#8fb2ff]" />
          </div>
          <ul className="mt-4 grid grid-cols-4 gap-2">
            {SLOTS.map(({ time, label, Icon, tone }) => (
              <li key={time} className="flex flex-col items-start gap-2 rounded-xl bg-white/[0.03] p-3">
                <span className="font-display text-lg font-semibold">{time}</span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>
                  <Icon className="size-3" strokeWidth={2.5} />
                  {label}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <ul className="relative space-y-3">
          {FEED.map((item, i) => (
            <li
              key={item.name}
              className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 backdrop-blur animate-rise"
              style={{ animationDelay: `${0.4 + i * 0.15}s` }}
            >
              <span className="flex items-center gap-3 text-sm">
                <span className="size-2 rounded-full bg-[#8fb2ff] animate-live" />
                <span>
                  <span className="font-medium">{item.name}</span>{" "}
                  <span className="text-[#9fb0cf]">{item.action}</span>
                </span>
              </span>
              <span className="font-display text-sm font-semibold tabular-nums">{item.value}</span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
