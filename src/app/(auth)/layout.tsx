import Link from "next/link";
import { ThemeToggle } from "@/components/theme";
import { Logo } from "@/components/ui/logo";

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
        <p className="text-xs text-muted">Domu Pulse, um produto DomuTech</p>
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
            Sua operação
            <br />
            batendo em
            <br />
            <span className="text-[#8fb2ff]">tempo real.</span>
          </p>
          <p className="mt-5 max-w-sm text-[15px] text-[#9fb0cf]">
            Cada relatório, visita e venda aparece no painel da liderança no momento em que acontece.
          </p>
        </div>

        <svg viewBox="0 0 600 120" className="relative w-full" fill="none">
          <path
            d="M0 70 H150 L175 70 L195 30 L220 105 L245 15 L268 85 L285 70 H420 L440 70 L455 48 L472 92 L490 70 H600"
            stroke="#8fb2ff"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ strokeDasharray: 120, animation: "pulse-trace 2.4s cubic-bezier(.65,0,.35,1) both" }}
            pathLength={120}
          />
        </svg>

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
