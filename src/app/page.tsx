import clsx from "clsx";
import { ArrowRight, BellRing, CalendarCheck, Contact, LineChart, ShieldCheck, Target } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ThemeToggle } from "@/components/theme";
import { BrandMark } from "@/components/ui/logo";

export const metadata: Metadata = {
  title: { absolute: "Domu Pulse | Relatório de corretor em tempo real" },
  description:
    "Seus corretores lançam visitas, propostas e vendas em horários fixos, pelo celular. Você acompanha cada equipe ao vivo e sabe na hora quem precisa de ajuda.",
};

const CTA = "Começar agora";

// A foto do corretor entra aqui quando o arquivo existir em public/landing.
// Sem ela, a chamada principal mostra a prévia do painel.
function heroPhoto() {
  for (const ext of ["png", "webp", "jpg"]) {
    if (existsSync(join(process.cwd(), "public", "landing", `corretor.${ext}`))) return `/landing/corretor.${ext}`;
  }
  return null;
}

const NAV = [
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#recursos", label: "Recursos" },
  { href: "#duvidas", label: "Dúvidas" },
];

const STEPS = [
  {
    n: "01",
    title: "Você define os horários",
    text: "Por exemplo 12h, 15h, 18h e 21h. O Pulse avisa cada corretor no celular 10 minutos antes.",
  },
  {
    n: "02",
    title: "O corretor lança em 30 segundos",
    text: "Leads, conversas, agendamentos, visitas, propostas e vendas. Botões grandes, direto do celular, sem planilha.",
  },
  {
    n: "03",
    title: "Você acompanha ao vivo",
    text: "Quem entregou, quem atrasou, o funil de cada equipe e o ranking do dia. Atualiza sozinho, no segundo em que acontece.",
  },
];

const FEATURES = [
  { Icon: LineChart, title: "Painel ao vivo", text: "Entregas, funil e ranking de cada equipe atualizando sozinhos. Abra no computador da sala de vendas ou no celular." },
  { Icon: BellRing, title: "Cobrança automática", text: "Lembrete antes de cada horário e aviso ao gerente quando alguém atrasa. Ninguém precisa cobrar no grupo." },
  { Icon: Contact, title: "Carteira de clientes", text: "Cada cliente na etapa certa do funil, com WhatsApp a um toque e visita agendada direto da ficha." },
  { Icon: Target, title: "Metas e projeção", text: "Meta mensal por corretor com a projeção pelo ritmo atual. Você sabe no dia 10 se o mês vai fechar." },
  { Icon: CalendarCheck, title: "Agenda de visitas", text: "Visitas da equipe em um só lugar, com o que foi realizado, desmarcado ou faltou." },
  { Icon: ShieldCheck, title: "Cada um vê o que deve", text: "Corretor vê os próprios números, gerente vê a equipe, diretoria vê tudo. Regra aplicada no banco de dados." },
];

const FAQ = [
  {
    q: "Precisa instalar alguma coisa?",
    a: "Não. O Pulse abre no navegador e pode ser instalado na tela inicial do celular como um aplicativo, em Android e iPhone.",
  },
  {
    q: "Quanto tempo leva para colocar a equipe?",
    a: "Poucos minutos. Você cria as equipes e convida as pessoas por e-mail, uma a uma ou todas de uma vez com uma planilha.",
  },
  {
    q: "Como funciona a contratação?",
    a: "Você cria a conta, escolhe quantas pessoas vão usar e ativa por Pix, boleto ou cartão. A cobrança é mensal, por pessoa ativa, e dá para cancelar quando quiser.",
  },
  {
    q: "Os horários de relatório são fixos?",
    a: "Você escolhe. De 1 a 8 horários por dia, do jeito que sua operação funciona.",
  },
  {
    q: "Um corretor consegue ver os números dos colegas?",
    a: "Não. Cada pessoa vê só o que o cargo permite, e os dados de uma imobiliária nunca aparecem para outra.",
  },
];

const btnPrimary =
  "inline-flex h-12 items-center justify-center gap-2 bg-brand px-7 text-[13px] font-semibold tracking-[0.1em] text-white uppercase transition-[filter] hover:brightness-125";
const btnGhost =
  "inline-flex h-12 items-center justify-center gap-2 border border-line-strong px-7 text-[13px] font-semibold tracking-[0.1em] text-ink uppercase transition-colors hover:border-ink";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-3 text-[12px] font-semibold tracking-[0.18em] text-brand-text uppercase">
      <span className="h-px w-8 bg-brand-text" />
      {children}
    </p>
  );
}

export default function Home() {
  const photo = heroPhoto();

  return (
    <div className="landing flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Domu Pulse, início">
            <BrandMark className="size-7" />
            <span className="font-display text-lg font-semibold tracking-tight">
              <span className="font-medium text-muted">Domu</span> Pulse
            </span>
          </Link>
          <nav aria-label="Seções" className="hidden items-center gap-9 lg:flex">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="text-[12px] font-semibold tracking-[0.14em] text-ink-2 uppercase hover:text-ink">
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link href="/entrar" className="text-[12px] font-semibold tracking-[0.14em] text-ink-2 uppercase hover:text-ink">
              Entrar
            </Link>
            <Link href="/criar-conta" className={clsx(btnPrimary, "hidden h-10 px-5 sm:inline-flex")}>
              Criar conta
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Chamada principal */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-[-10%] h-[42rem] w-[42rem] -translate-y-1/2 rounded-full opacity-60 blur-3xl"
            style={{ background: "radial-gradient(closest-side, rgb(2 89 243 / 0.35), transparent)" }}
          />
          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 pt-16 pb-20 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pt-24 lg:pb-28">
            <div className="animate-rise">
              <Eyebrow>Relatório de corretor em tempo real</Eyebrow>
              <h1 className="mt-6 font-display text-[2.9rem] leading-[0.98] font-bold tracking-[-0.03em] sm:text-7xl xl:text-[5.4rem]">
                Chega de cobrar relatório <span className="text-brand-text">no grupo.</span>
              </h1>
              <p className="mt-7 max-w-xl text-lg leading-relaxed text-ink-2">
                Seus corretores lançam visitas, propostas e vendas em horários fixos, direto do celular. Você acompanha cada
                equipe no momento em que acontece e sabe na hora quem está vendendo e quem precisa de ajuda.
              </p>
              <div className="mt-10 flex flex-wrap gap-3">
                <Link href="/criar-conta" className={btnPrimary}>
                  {CTA}
                  <ArrowRight className="size-4" />
                </Link>
                <a href="#como-funciona" className={btnGhost}>
                  Como funciona
                </a>
              </div>
              <p className="mt-5 text-sm text-muted">Sua equipe usando no mesmo dia.</p>
            </div>

            <div className="relative animate-rise" style={{ animationDelay: "0.12s" }}>
              {photo ? (
                <div className="relative mx-auto aspect-[4/5] w-full max-w-[520px]">
                  <Image
                    src={photo}
                    alt="Corretor de imóveis"
                    fill
                    priority
                    sizes="(min-width: 1024px) 520px, 90vw"
                    className="object-contain object-bottom"
                  />
                  <div className="absolute bottom-10 left-0 border border-line-strong bg-bg/85 px-5 py-4 backdrop-blur sm:-left-8">
                    <p className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">Relatório das 15h</p>
                    <p className="mt-1 font-display text-2xl font-semibold tabular-nums">14 de 18 entregues</p>
                  </div>
                </div>
              ) : (
                <BoardPreview />
              )}
            </div>
          </div>
        </section>

        {/* Números do produto */}
        <section className="border-y border-line bg-surface">
          <dl className="mx-auto grid max-w-7xl grid-cols-2 px-5 sm:px-8 lg:grid-cols-4">
            {[
              ["30 s", "para o corretor lançar o relatório"],
              ["8 etapas", "do funil, de lead a venda"],
              ["Ao vivo", "sem atualizar a página"],
              ["1 a 8", "horários de relatório por dia"],
            ].map(([value, label], i) => (
              <div key={label} className={clsx("py-8 lg:px-8", i > 0 && "lg:border-l lg:border-line", i % 2 === 1 && "pl-5 lg:pl-8")}>
                <dt className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{value}</dt>
                <dd className="mt-1 text-sm text-muted">{label}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Frase de impacto */}
        <section className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:py-32">
          <p className="max-w-5xl font-display text-4xl leading-[1.05] font-bold tracking-[-0.03em] sm:text-6xl">
            Gestão que acontece <span className="text-brand-text">enquanto a venda acontece.</span>
          </p>
          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-ink-2">
            Planilha no fim do dia mostra o que já passou. Com o Pulse, você vê a operação enquanto ainda dá tempo de agir:
            puxar quem travou, reconhecer quem está indo bem e redistribuir leads antes de perder a semana.
          </p>
        </section>

        {/* Como funciona */}
        <section id="como-funciona" className="scroll-mt-16 border-t border-line">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28">
            <Eyebrow>Como funciona</Eyebrow>
            <h2 className="mt-5 max-w-3xl font-display text-4xl font-bold tracking-[-0.02em] sm:text-5xl">Três passos. Nenhuma planilha.</h2>
            <ol className="mt-14 grid border-t border-line lg:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.n} className={clsx("py-10 lg:pr-10", i > 0 && "border-t border-line lg:border-t-0 lg:border-l lg:pl-10")}>
                  <span className="font-display text-6xl font-bold text-brand-text/40 tabular-nums">{s.n}</span>
                  <h3 className="mt-6 font-display text-2xl font-semibold tracking-tight">{s.title}</h3>
                  <p className="mt-3 leading-relaxed text-ink-2">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Recursos */}
        <section id="recursos" className="scroll-mt-16 border-t border-line bg-surface">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28">
            <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-end">
              <div>
                <Eyebrow>Recursos</Eyebrow>
                <h2 className="mt-5 font-display text-4xl font-bold tracking-[-0.02em] sm:text-5xl">Tudo que o gestor comercial precisa.</h2>
              </div>
              <p className="text-lg leading-relaxed text-ink-2 lg:pb-2">
                Do lembrete que chega no celular do corretor ao ranking que você mostra na reunião de segunda. Feito para a
                rotina de imobiliária, não adaptado de outro setor.
              </p>
            </div>
            <ul className="mt-14 grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ Icon, title, text }) => (
                <li key={title} className="bg-surface p-8 lg:p-10">
                  <Icon className="size-6 text-brand-text" strokeWidth={1.6} />
                  <h3 className="mt-6 font-display text-xl font-semibold tracking-tight">{title}</h3>
                  <p className="mt-2.5 leading-relaxed text-muted">{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Prévia do painel, quando a foto ocupa a chamada principal */}
        {photo ? (
          <section className="border-t border-line">
            <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_1.1fr] lg:py-28">
              <div>
                <Eyebrow>O painel</Eyebrow>
                <h2 className="mt-5 font-display text-4xl font-bold tracking-[-0.02em] sm:text-5xl">Sua operação como ela é, agora.</h2>
                <p className="mt-6 text-lg leading-relaxed text-ink-2">
                  Cada linha é um corretor, cada coluna um horário. Verde entregou, vermelho atrasou. Em cinco segundos você sabe
                  onde agir.
                </p>
              </div>
              <BoardPreview />
            </div>
          </section>
        ) : null}

        {/* Dúvidas */}
        <section id="duvidas" className="scroll-mt-16 border-t border-line bg-surface">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_1.4fr] lg:py-28">
            <div>
              <Eyebrow>Dúvidas</Eyebrow>
              <h2 className="mt-5 font-display text-4xl font-bold tracking-[-0.02em] sm:text-5xl">Perguntas frequentes.</h2>
            </div>
            <div className="border-t border-line">
              {FAQ.map((f) => (
                <details key={f.q} className="group border-b border-line py-6">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 font-display text-lg font-semibold">
                    {f.q}
                    <span className="text-2xl leading-none text-brand-text transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-4 max-w-2xl leading-relaxed text-ink-2">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Chamada final */}
        <section className="relative overflow-hidden border-t border-line">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-[-60%] mx-auto h-[36rem] max-w-4xl rounded-full blur-3xl"
            style={{ background: "radial-gradient(closest-side, rgb(2 89 243 / 0.28), transparent)" }}
          />
          <div className="relative mx-auto max-w-7xl px-5 py-24 text-center sm:px-8 lg:py-32">
            <h2 className="mx-auto max-w-4xl font-display text-4xl leading-[1.02] font-bold tracking-[-0.03em] sm:text-6xl">
              Amanhã você já vai saber <span className="text-brand-text">quem está vendendo.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-lg text-ink-2">Crie a conta, convide a equipe e veja o primeiro relatório chegar ainda hoje.</p>
            <Link href="/criar-conta" className={clsx(btnPrimary, "mt-10")}>
              {CTA}
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-10 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span className="flex items-center gap-2.5">
            <BrandMark className="size-5" />
            Domu Pulse, um produto DomuTech
          </span>
          <span className="flex flex-wrap gap-6">
            <Link href="/termos" className="hover:text-ink">
              Termos de Uso
            </Link>
            <Link href="/privacidade" className="hover:text-ink">
              Privacidade
            </Link>
            <Link href="/entrar" className="hover:text-ink">
              Entrar
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

// Ilustração do painel ao vivo. Dados de exemplo, só para mostrar o produto.
const SAMPLE = [
  { name: "Marina Alves", slots: ["ok", "ok", "ok", "wait"], visits: 4, sales: 1 },
  { name: "Rafael Costa", slots: ["ok", "ok", "late", "wait"], visits: 3, sales: 1 },
  { name: "Juliana Prado", slots: ["ok", "ok", "ok", "wait"], visits: 5, sales: 0 },
  { name: "Bruno Lima", slots: ["ok", "late", "late", "wait"], visits: 1, sales: 0 },
  { name: "Carla Mendes", slots: ["ok", "ok", "open", "wait"], visits: 2, sales: 2 },
] as const;

const SLOT_STYLE = {
  ok: "bg-[#12b76a]",
  late: "bg-[#f04438]",
  open: "bg-[#f79009]",
  wait: "bg-line-strong",
} as const;

function BoardPreview() {
  return (
    <figure className="border border-line-strong bg-surface shadow-[0_40px_120px_-40px_rgb(2_89_243/0.45)]">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <span className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.14em] uppercase">
          <span className="size-2 bg-[#12b76a]" />
          Ao vivo
        </span>
        <span className="text-[12px] text-muted">Relatório das 18h, 3 de 5 entregues</span>
      </div>
      <div className="overflow-x-auto">
      <table className="w-full min-w-[440px] text-sm">
        <thead>
          <tr className="text-left text-[11px] tracking-[0.12em] text-muted uppercase">
            <th className="px-5 py-3 font-semibold">Corretor</th>
            {["12h", "15h", "18h", "21h"].map((h) => (
              <th key={h} className="px-1 py-3 text-center font-semibold">
                {h}
              </th>
            ))}
            <th className="px-3 py-3 text-right font-semibold">Visitas</th>
            <th className="px-5 py-3 text-right font-semibold">Vendas</th>
          </tr>
        </thead>
        <tbody>
          {SAMPLE.map((r) => (
            <tr key={r.name} className="border-t border-line">
              <td className="px-5 py-3 font-medium whitespace-nowrap">{r.name}</td>
              {r.slots.map((s, i) => (
                <td key={i} className="px-1 py-3">
                  <span className={clsx("mx-auto block h-2 w-7", SLOT_STYLE[s])} />
                </td>
              ))}
              <td className="px-3 py-3 text-right tabular-nums text-ink-2">{r.visits}</td>
              <td className="px-5 py-3 text-right font-semibold tabular-nums">{r.sales}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <figcaption className="flex flex-wrap gap-x-5 gap-y-2 border-t border-line px-5 py-3 text-[11px] text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2 w-4 bg-[#12b76a]" />Entregue</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-4 bg-[#f79009]" />Aberto</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-4 bg-[#f04438]" />Atrasado</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-4 bg-line-strong" />Em breve</span>
      </figcaption>
    </figure>
  );
}
