import { BellRing, CalendarCheck, Radio, ShieldCheck, Trophy, Workflow } from "lucide-react";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme";
import { Logo } from "@/components/ui/logo";

const FEATURES = [
  {
    Icon: Radio,
    title: "Painel ao vivo",
    text: "Cada relatório aparece para a liderança no segundo em que o corretor envia. Sem planilha, sem print no grupo.",
  },
  {
    Icon: BellRing,
    title: "Lembrete no celular",
    text: "Aviso 10 minutos antes de cada horário e alerta para o gerente quando alguém atrasa.",
  },
  {
    Icon: Workflow,
    title: "Funil completo",
    text: "De lead a venda, com a conversão entre cada etapa por corretor, equipe e diretoria.",
  },
  {
    Icon: Trophy,
    title: "Ranking que engaja",
    text: "Quem avançou mais no funil aparece no topo. A competição saudável acontece sozinha.",
  },
  {
    Icon: CalendarCheck,
    title: "Agenda de visitas",
    text: "Visitas marcadas, realizadas e faltas em um só lugar, com o telefone do cliente a um toque.",
  },
  {
    Icon: ShieldCheck,
    title: "Seguro de verdade",
    text: "Cada pessoa vê só o que o cargo permite, regra aplicada direto no banco de dados.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Logo />
        <nav className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/entrar" className={buttonClass("ghost", "md")}>
            Entrar
          </Link>
          <Link href="/criar-conta" className={buttonClass("primary", "md", "hidden sm:inline-flex")}>
            Testar grátis
          </Link>
        </nav>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-5 pt-14 pb-20 sm:px-8 sm:pt-24">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[13px] text-ink-2 animate-rise">
            <span className="size-2 rounded-full bg-brand-text animate-live" />
            Gestão comercial para imobiliárias
          </p>
          <h1
            className="mt-6 max-w-4xl font-display text-[2.75rem] leading-[1.02] font-semibold tracking-tight animate-rise sm:text-7xl"
            style={{ animationDelay: "0.08s" }}
          >
            O pulso da sua equipe de vendas, <span className="bg-brand px-2 text-brand-ink">ao vivo.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted animate-rise" style={{ animationDelay: "0.16s" }}>
            Seus corretores enviam os números em horários definidos. Gerentes e superintendentes acompanham funil,
            ranking e agenda em tempo real, do celular.
          </p>
          <div className="mt-9 flex flex-wrap gap-3 animate-rise" style={{ animationDelay: "0.24s" }}>
            <Link href="/criar-conta" className={buttonClass("primary", "lg")}>
              Começar teste de 14 dias
            </Link>
            <Link href="/entrar" className={buttonClass("secondary", "lg")}>
              Já tenho conta
            </Link>
          </div>
        </section>

        <section className="border-y border-line bg-surface">
          <ul className="mx-auto grid max-w-6xl gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ Icon, title, text }) => (
              <li key={title} className="bg-surface p-7 sm:p-9">
                <span className="grid size-11 place-items-center rounded-xl bg-brand text-brand-ink">
                  <Icon className="size-5" />
                </span>
                <h2 className="mt-5 font-display text-xl font-semibold tracking-tight">{title}</h2>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">{text}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-8 text-sm text-muted sm:px-8">
        <span>Domu Pulse, um produto DomuTech</span>
        <span className="flex gap-5">
          <Link href="/termos" className="hover:text-ink">Termos de Uso</Link>
          <Link href="/privacidade" className="hover:text-ink">Privacidade</Link>
        </span>
      </footer>
    </div>
  );
}
