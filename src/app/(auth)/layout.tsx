import Link from "next/link";
import { ThemeToggle } from "@/components/theme";
import { Logo } from "@/components/ui/logo";

// Do cadastro ao primeiro relatório: o caminho que a pessoa vai seguir.
const STEPS = [
  { title: "Crie a conta", text: "Nome da imobiliária, seu e-mail e uma senha. Leva um minuto." },
  { title: "Convide a equipe", text: "Um a um ou todos de uma vez com uma planilha." },
  { title: "Receba o primeiro relatório", text: "Seus corretores lançam pelo celular e você acompanha ao vivo." },
];

const NOTES = ["Sem instalar nada", "Pix, boleto ou cartão", "Cancela quando quiser"];

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh">
      <div className="flex w-full flex-col bg-surface px-5 py-6 sm:px-10 lg:w-[52%] lg:px-16">
        <div className="flex items-center justify-between">
          <Link href="/" aria-label="Domu Pulse, página inicial">
            <Logo />
          </Link>
          <ThemeToggle />
        </div>
        <main className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[420px] animate-rise">{children}</div>
        </main>
        <p className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted">
          <span>Domu Pulse, um produto DomuTech</span>
          <Link href="/termos" className="hover:text-ink">Termos de Uso</Link>
          <Link href="/privacidade" className="hover:text-ink">Privacidade</Link>
        </p>
      </div>

      <aside aria-hidden="true" className="relative hidden flex-1 overflow-hidden bg-[#02050b] text-white lg:flex lg:items-center lg:p-14 xl:p-20">
        {/* Um brilho azul discreto, como na chamada final da página inicial. */}
        <div
          className="pointer-events-none absolute -top-1/3 -right-1/4 size-[44rem] rounded-full blur-3xl"
          style={{ background: "radial-gradient(closest-side, rgb(2 89 243 / 0.22), transparent)" }}
        />

        <div className="relative w-full max-w-md">
          <p className="flex items-center gap-3 text-[12px] font-semibold tracking-[0.18em] text-[#7ea5ff] uppercase">
            <span className="h-px w-8 bg-[#7ea5ff]" />
            Como começa
          </p>
          <p className="mt-6 font-display text-[2.5rem] leading-[1.04] font-bold tracking-[-0.03em]">
            Sua equipe usando <span className="text-[#7ea5ff]">no mesmo dia.</span>
          </p>

          <ol className="mt-12 border-t border-white/10">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-5 border-b border-white/10 py-6">
                <span className="font-display text-sm font-semibold text-[#7ea5ff] tabular-nums">0{i + 1}</span>
                <div>
                  <p className="font-display text-lg font-semibold tracking-tight">{step.title}</p>
                  <p className="mt-1 text-[15px] leading-relaxed text-white/60">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>

          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-white/50">
            {NOTES.map((note) => (
              <li key={note} className="flex items-center gap-2">
                <span className="size-1 rounded-full bg-[#7ea5ff]" />
                {note}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
