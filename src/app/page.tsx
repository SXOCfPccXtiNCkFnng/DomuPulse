import clsx from "clsx";
import {
  ArrowRight,
  BarChart3,
  BellRing,
  Briefcase,
  CalendarCheck,
  CalendarDays,
  ClipboardCheck,
  Contact,
  Flame,
  Headset,
  LineChart,
  ListChecks,
  Radar,
  Rocket,
  ShieldCheck,
  Target,
  UserSearch,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { HowItWorks } from "@/components/how-it-works";
import { Depth, ParallaxScene } from "@/components/parallax";
import { LandingNav } from "@/components/landing-nav";
import { BrandMark } from "@/components/ui/logo";
import heroImage from "../../public/landing/hero.webp";

export const metadata: Metadata = {
  title: { absolute: "Domu Pulse | Gestão de corretores e recrutamento" },
  description:
    "Dois módulos: relatório de corretor em tempo real, pelo celular, e recrutamento pelo WhatsApp com triagem de currículos por IA e agenda de entrevistas.",
};

const MODULES = [
  {
    id: "corretores",
    signup: "/criar-conta?modulo=corretores",
    Icon: LineChart,
    kicker: "Gestão de corretores",
    title: "Relatório da equipe de vendas, ao vivo.",
    text: "Os corretores lançam visitas, propostas e vendas em horários fixos, pelo celular. Você vê quem entregou e quem travou enquanto ainda dá tempo de agir.",
    points: ["Lembrete automático antes de cada horário", "Painel ao vivo, ranking e funil por equipe", "Metas, projeção do mês e carteira de clientes"],
    cta: "Criar conta para corretores",
  },
  {
    id: "recrutamento",
    signup: "/criar-conta?modulo=rh",
    Icon: UserSearch,
    kicker: "Recrutamento (RH)",
    title: "Candidatos chegando pelo WhatsApp, já com nota.",
    text: "O atendimento automático recebe os currículos no WhatsApp da empresa, a IA lê e dá uma nota para a vaga, e você chama os melhores para entrevista.",
    points: ["Triagem de currículos com nota e resumo da IA", "Agenda de entrevistas com confirmação e lembrete", "Retorno ao candidato e checklist de documentos"],
    cta: "Criar conta para RH",
  },
];

const HR_STEPS = [
  {
    title: "O candidato manda o currículo no WhatsApp",
    text: "O atendimento automático conversa, mostra as vagas abertas e recebe o PDF ou a foto do currículo. A qualquer hora, sem ninguém da equipe parado nisso.",
  },
  {
    title: "A IA lê e dá a nota",
    text: "Cada currículo ganha um resumo e uma nota de 0 a 100 para a vaga, com o motivo. Você começa pelos melhores, e quem decide é sempre a sua equipe.",
  },
  {
    title: "Você decide, o Pulse avisa",
    text: "Aprove, recuse ou marque a entrevista. O candidato recebe confirmação, lembrete e retorno sem você digitar a mesma mensagem de novo.",
  },
];

const HR_FEATURES = [
  { Icon: Briefcase, title: "Vagas e funil", text: "Cada vaga com os candidatos por etapa: novo, triagem, entrevista, aprovado e contratado." },
  { Icon: CalendarDays, title: "Agenda de entrevistas", text: "A semana num calendário. Confirmação na hora e lembrete antes, pelo WhatsApp e por e-mail." },
  { Icon: Headset, title: "Atendimento que passa a vez", text: "A equipe assume a conversa quando quiser e devolve ao atendimento automático depois." },
  { Icon: ListChecks, title: "Checklist de documentos", text: "Monte a lista da admissão uma vez e envie ao aprovado com um clique." },
  { Icon: BarChart3, title: "Painel do RH", text: "Candidaturas por dia, funil, tempo até a contratação e nota média, com exportação para planilha." },
  { Icon: Users, title: "Banco de talentos e LGPD", text: "Todo currículo fica na ficha do candidato. Se ele pedir, você apaga os dados de vez." },
];

const CTA = "Começar agora";

const BENEFITS = [
  { Icon: ClipboardCheck, title: "Tudo fica registrado", text: "Cada relatório fica salvo. Compare dias, semanas e equipes sem montar planilha." },
  { Icon: Radar, title: "Visão na hora certa", text: "Você vê quem entregou e quem travou enquanto ainda dá tempo de agir." },
  { Icon: Flame, title: "Equipe engajada", text: "Ranking ao vivo e metas visíveis criam uma competição saudável." },
  { Icon: Rocket, title: "Pronto no mesmo dia", text: "Abre no navegador e instala no celular. Sem treinamento longo." },
];

const FEATURES = [
  { Icon: LineChart, title: "Painel ao vivo", text: "Entregas, funil e ranking de cada equipe atualizando sozinhos. Na sala de vendas ou no celular." },
  { Icon: BellRing, title: "Cobrança automática", text: "Lembrete antes de cada horário e aviso ao gerente quando alguém atrasa." },
  { Icon: Contact, title: "Carteira de clientes", text: "Cada cliente na etapa do funil, com WhatsApp a um toque e visita marcada na ficha." },
  { Icon: Target, title: "Metas e projeção", text: "Meta mensal por corretor. No dia 10 você já sabe se o mês fecha, pelo ritmo de agora." },
  { Icon: CalendarCheck, title: "Agenda de visitas", text: "As visitas da equipe num lugar só: o que foi realizado, desmarcado ou faltou." },
  { Icon: ShieldCheck, title: "Cada um vê o que deve", text: "Corretor vê os próprios números. Gerente vê a equipe. Diretoria vê a empresa." },
];

const FAQ = [
  {
    q: "Precisa instalar alguma coisa?",
    a: "Não. Abre no navegador do celular e do computador. Se quiser, coloca na tela inicial, no Android e no iPhone, e passa a abrir como um aplicativo.",
  },
  {
    q: "Quanto tempo leva para começar?",
    a: "Poucos minutos. Em gestão de corretores, você cria as equipes e convida por e-mail, um a um ou todos de uma vez com uma planilha. Em recrutamento, conecta o WhatsApp da empresa lendo um QR Code e abre a primeira vaga.",
  },
  {
    q: "Como funciona a contratação?",
    a: "Você cria a conta, escolhe o módulo e ativa por Pix, boleto ou cartão. O valor é fixo por mês, sem cobrança por usuário. Cancela quando quiser.",
  },
  {
    q: "A IA decide quem é contratado?",
    a: "Não. A IA lê o currículo e sugere uma nota para a vaga, com o motivo. Quem aprova, recusa ou marca entrevista é sempre a sua equipe.",
  },
  {
    q: "O candidato precisa instalar algo?",
    a: "Não. Ele conversa com o WhatsApp da sua empresa, como faria com qualquer pessoa. Quando quiser, alguém da equipe assume a conversa.",
  },
  {
    q: "Os horários de relatório são fixos?",
    a: "Você escolhe. De 1 a 8 horários por dia, no fuso da empresa. Dez minutos antes, o corretor recebe o aviso. Quem marcou folga não entra na cobrança.",
  },
  {
    q: "Um corretor vê os números dos colegas?",
    a: "Não. Corretor vê o próprio dia. Gerente vê a equipe. Diretoria vê a empresa. Os dados de uma empresa nunca aparecem para outra.",
  },
];

const btnPrimary =
  "inline-flex h-12 items-center justify-center gap-2 bg-brand px-7 text-[13px] font-semibold tracking-[0.1em] text-white uppercase transition-[filter] hover:brightness-125";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-3 text-[12px] font-semibold tracking-[0.18em] text-brand-text uppercase">
      <span className="h-px w-8 bg-brand-text" />
      {children}
    </p>
  );
}

export default function Home() {
  return (
    <div className="landing flex min-h-dvh flex-col">
      <LandingNav />

      <main className="flex-1">
        {/* Chamada principal: foto de fundo, texto sempre claro sobre ela. Os
            cartões ao lado do corretor se movem com o mouse (ParallaxScene). */}
        <section className="relative isolate overflow-hidden bg-[#02050b] text-white">
          <ParallaxScene className="relative">
            <Depth depth={-10} className="absolute -inset-6 -z-10">
              <Image
                src={heroImage}
                alt=""
                fill
                priority
                placeholder="blur"
                sizes="100vw"
                className="object-cover object-[72%_center] opacity-60 lg:opacity-100"
              />
            </Depth>
            {/* Escurece a esquerda para o texto ler bem sobre qualquer parte da foto. */}
            <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-r from-[#02050b] via-[#02050b]/80 to-[#02050b]/0 lg:via-[#02050b]/50" />
            <div aria-hidden="true" className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-[#02050b]/80 to-transparent" />

            {/* Cartões flutuantes ao lado do corretor (só em telas grandes). */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden lg:block">
              <div className="relative mx-auto h-full max-w-[1440px]">
                <Depth depth={26} duration={2.2} className="absolute top-[15%] right-8 w-60">
                  <div className="border border-white/15 bg-[#0a1428]/55 text-white shadow-[0_24px_60px_-20px_rgb(0_0_0/0.6)] backdrop-blur-md p-4 animate-rise" style={{ animationDelay: "0.35s" }}>
                    <p className="text-[10px] font-semibold tracking-[0.16em] text-white/60 uppercase">Novo candidato, pelo WhatsApp</p>
                    <p className="mt-1 flex items-baseline justify-between gap-3">
                      <span className="font-display text-2xl font-semibold">Ana Souza</span>
                      <span className="font-display text-2xl font-semibold text-[#6ee7b7] tabular-nums">92</span>
                    </p>
                    <p className="mt-1 text-[13px] leading-snug text-white/70">Nota da IA para a vaga de corretor. Entrevista amanhã, 10h.</p>
                  </div>
                </Depth>

                <Depth depth={12} duration={0.7} className="absolute top-[63%] left-[74%] w-72">
                  <div className="border border-white/15 bg-[#0a1428]/55 text-white shadow-[0_24px_60px_-20px_rgb(0_0_0/0.6)] backdrop-blur-md p-4 animate-rise" style={{ animationDelay: "0.5s" }}>
                    <p className="text-[10px] font-semibold tracking-[0.16em] text-white/60 uppercase">Equipe Norte, agora</p>
                    <ul className="mt-3 space-y-2.5 text-sm">
                      <li className="flex items-center justify-between gap-3">
                        <span>Marina Alves</span>
                        <span className="text-[12px] font-medium text-[#6ee7b7]">Entregue</span>
                      </li>
                      <li className="flex items-center justify-between gap-3">
                        <span>Rafael Costa</span>
                        <span className="text-[12px] font-medium text-[#f5c16c]">Atrasado</span>
                      </li>
                    </ul>
                  </div>
                </Depth>

                <Depth depth={8} duration={0.7} className="absolute top-[48%] left-[82%] w-56">
                  <div className="border border-white/15 bg-[#0a1428]/55 text-white shadow-[0_24px_60px_-20px_rgb(0_0_0/0.6)] backdrop-blur-md p-4 animate-rise" style={{ animationDelay: "0.65s" }}>
                    <p className="text-[10px] font-semibold tracking-[0.16em] text-white/60 uppercase">Marina, relatório das 15h</p>
                    <p className="mt-2 flex items-baseline justify-between gap-3">
                      <span className="text-[13px] text-white/70">Visitas</span>
                      <span className="font-display text-2xl font-semibold tabular-nums">4</span>
                    </p>
                    <p className="mt-1 flex items-baseline justify-between gap-3">
                      <span className="text-[13px] text-white/70">Propostas</span>
                      <span className="font-display text-2xl font-semibold tabular-nums">1</span>
                    </p>
                  </div>
                </Depth>
              </div>
            </div>

            <div className="mx-auto flex min-h-dvh max-w-[1440px] items-center px-5 pt-32 pb-20 sm:px-8 lg:min-h-[64rem]">
              <div className="max-w-[40rem] animate-rise">
                <p className="flex items-center gap-3 text-[12px] font-semibold tracking-[0.18em] text-[#7ea5ff] uppercase">
                  <span className="h-px w-8 bg-[#7ea5ff]" />
                  Gestão de corretores e recrutamento
                </p>
                <h1 className="mt-6 font-display text-[2.5rem] leading-[1.02] font-bold tracking-[-0.03em] sm:text-6xl xl:text-[4.1rem]">
                  Sua equipe e suas contratações, <span className="text-[#7ea5ff]">ao vivo.</span>
                </h1>
                <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/75">
                  Acompanhe o relatório dos seus corretores no momento em que eles lançam pelo celular. Ou receba currículos pelo
                  WhatsApp, com nota da IA, e marque as entrevistas sem planilha. Você escolhe o módulo.
                </p>
                <div className="mt-10 flex flex-wrap gap-3">
                  <Link href="/criar-conta" className={clsx(btnPrimary, "bg-[#0259f3]")}>
                    {CTA}
                    <ArrowRight className="size-4" />
                  </Link>
                  <a
                    href="#modulos"
                    className="inline-flex h-12 items-center justify-center gap-2 border border-white/30 px-7 text-[13px] font-semibold tracking-[0.1em] text-white uppercase transition-colors hover:border-white"
                  >
                    Conhecer os módulos
                  </a>
                </div>
                <p className="mt-5 text-sm text-white/55">Sua equipe usando no mesmo dia.</p>
              </div>
            </div>
          </ParallaxScene>
        </section>

        {/* Os dois módulos lado a lado, cada um com o próprio atalho de cadastro. */}
        <section id="modulos" className="scroll-mt-28">
          <div className="mx-auto max-w-[1440px] px-5 py-20 sm:px-8 lg:py-28">
            <Eyebrow>Dois módulos</Eyebrow>
            <h2 className="mt-5 max-w-3xl font-display text-4xl font-bold tracking-[-0.02em] sm:text-5xl">Escolha por onde começar.</h2>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-2">
              Mesma conta simples, mesmo painel ao vivo. Um módulo para quem gerencia a equipe de vendas, outro para quem contrata.
            </p>
            <div className="mt-14 grid gap-5 lg:grid-cols-2">
              {MODULES.map((m) => (
                <article key={m.id} className="flex flex-col border border-line bg-surface p-7 sm:p-9">
                  <m.Icon className="size-7 text-brand-text" strokeWidth={1.6} />
                  <p className="mt-6 text-[12px] font-semibold tracking-[0.16em] text-brand-text uppercase">{m.kicker}</p>
                  <h3 className="mt-3 font-display text-3xl font-semibold tracking-tight">{m.title}</h3>
                  <p className="mt-4 leading-relaxed text-ink-2">{m.text}</p>
                  <ul className="mt-6 flex-1 space-y-2.5 border-t border-line pt-6">
                    {m.points.map((p) => (
                      <li key={p} className="flex items-start gap-3 text-[15px] text-ink-2">
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-text" />
                        {p}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
                    <Link href={m.signup} className={btnPrimary}>
                      {m.cta}
                      <ArrowRight className="size-4" />
                    </Link>
                    <a href={`#${m.id}`} className="text-sm font-medium text-ink-2 underline-offset-4 hover:text-ink hover:underline">
                      Ver como funciona
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Gestão de corretores: a frase primeiro, os quatro pontos no mesmo cartão. */}
        <section id="corretores" className="scroll-mt-28 bg-surface">
          <div className="mx-auto max-w-[1440px] px-5 py-20 sm:px-8 lg:py-28">
            <Eyebrow>Gestão de corretores</Eyebrow>
            <p className="mt-6 max-w-5xl font-display text-4xl leading-[1.05] font-bold tracking-[-0.03em] sm:text-6xl">
              Gestão que acontece <span className="text-brand-text">enquanto a venda acontece.</span>
            </p>
            <p className="mt-8 max-w-2xl text-lg leading-relaxed text-ink-2">
              Planilha no fim do dia mostra o que já passou. Com o Pulse, você vê a operação enquanto ainda dá tempo de agir:
              puxar quem travou, reconhecer quem está indo bem e redistribuir leads antes de perder a semana.
            </p>
            <ul className="mt-16 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
              {BENEFITS.map(({ Icon, title, text }) => (
                <li key={title}>
                  <Icon className="size-6 text-brand-text" strokeWidth={1.6} />
                  <h3 className="mt-5 font-display text-xl font-semibold tracking-tight">{title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted">{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <HowItWorks />

        <section id="recursos" className="scroll-mt-28 bg-surface">
          <div className="mx-auto grid max-w-[1440px] gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_1.4fr] lg:py-28">
            <div>
              <Eyebrow>Recursos</Eyebrow>
              <h2 className="mt-5 font-display text-4xl font-bold tracking-[-0.02em] sm:text-5xl">Tudo que o gestor comercial precisa.</h2>
              <p className="mt-5 max-w-md text-lg leading-relaxed text-ink-2">
                Do lembrete no celular do corretor ao ranking da reunião de segunda. Feito para a rotina de empresa.
              </p>
            </div>
            <ul className="border-t border-line">
              {FEATURES.map(({ Icon, title, text }) => (
                <li key={title} className="flex gap-4 border-b border-line py-6">
                  <Icon className="mt-1 size-5 shrink-0 text-brand-text" strokeWidth={1.6} />
                  <div>
                    <h3 className="font-display text-xl font-semibold tracking-tight">{title}</h3>
                    <p className="mt-1.5 leading-relaxed text-muted">{text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Recrutamento: passos à esquerda, a vaga de exemplo à direita. */}
        <section id="recrutamento" className="scroll-mt-28 bg-[#02050b] text-white">
          <div className="mx-auto max-w-[1440px] px-5 py-20 sm:px-8 lg:py-28">
            <p className="flex items-center gap-3 text-[12px] font-semibold tracking-[0.18em] text-[#7ea5ff] uppercase">
              <span className="h-px w-8 bg-[#7ea5ff]" />
              Recrutamento (RH)
            </p>
            <h2 className="mt-5 max-w-4xl font-display text-4xl leading-[1.05] font-bold tracking-[-0.03em] sm:text-6xl">
              Contrate mais rápido, <span className="text-[#7ea5ff]">sem garimpar currículo.</span>
            </h2>
            <p className="mt-8 max-w-2xl text-lg leading-relaxed text-white/70">
              O candidato fala com o WhatsApp da empresa, a IA faz a primeira leitura e a sua equipe gasta tempo só com quem tem a
              ver com a vaga.
            </p>

            <div className="mt-16 grid gap-14 lg:grid-cols-[1.15fr_0.85fr] lg:gap-20">
              <ol className="border-t border-white/10">
                {HR_STEPS.map((s, i) => (
                  <li key={s.title} className="flex gap-6 border-b border-white/10 py-8">
                    <span className="font-display text-4xl font-bold text-[#7ea5ff] tabular-nums">0{i + 1}</span>
                    <div>
                      <h3 className="font-display text-2xl font-semibold tracking-tight">{s.title}</h3>
                      <p className="mt-2 max-w-xl leading-relaxed text-white/65">{s.text}</p>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="self-center border border-white/15 bg-white/[0.04] p-7">
                <p className="text-[12px] font-semibold tracking-[0.16em] text-[#7ea5ff] uppercase">Vaga aberta</p>
                <p className="mt-3 font-display text-3xl font-semibold tracking-tight">Corretor de imóveis</p>
                <ul className="mt-8 border-t border-white/10">
                  {[
                    { name: "Ana Souza", score: 92, status: "Entrevista amanhã, 10h", tone: "text-[#6ee7b7]" },
                    { name: "Bruno Lima", score: 78, status: "Triagem", tone: "text-white/60" },
                    { name: "Carla Dias", score: 41, status: "Retorno enviado", tone: "text-white/40" },
                  ].map((c) => (
                    <li key={c.name} className="flex items-center justify-between gap-6 border-b border-white/10 py-4">
                      <span>
                        <span className="block font-display text-xl font-semibold">{c.name}</span>
                        <span className={clsx("text-sm", c.tone)}>{c.status}</span>
                      </span>
                      <span className="font-display text-3xl font-semibold tabular-nums">{c.score}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-6 text-[15px] leading-relaxed text-white/55">Nota da IA de 0 a 100, com o motivo. A decisão é da equipe.</p>
              </div>
            </div>

            <ul className="mt-20 grid gap-x-10 gap-y-10 border-t border-white/10 pt-14 sm:grid-cols-2 lg:grid-cols-3">
              {HR_FEATURES.map(({ Icon, title, text }) => (
                <li key={title}>
                  <Icon className="size-6 text-[#7ea5ff]" strokeWidth={1.6} />
                  <h3 className="mt-5 font-display text-xl font-semibold tracking-tight">{title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-white/60">{text}</p>
                </li>
              ))}
            </ul>

            <Link href="/criar-conta?modulo=rh" className={clsx(btnPrimary, "mt-16 bg-[#0259f3]")}>
              Criar conta para RH
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>

        <section id="duvidas" className="scroll-mt-28">
          <div className="mx-auto grid max-w-[1440px] gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_1.4fr] lg:py-28">
            <div>
              <Eyebrow>Dúvidas</Eyebrow>
              <h2 className="mt-5 font-display text-4xl font-bold tracking-[-0.02em] sm:text-5xl">Perguntas frequentes.</h2>
              <p className="mt-5 max-w-md text-lg leading-relaxed text-ink-2">
                Instalação, cobrança, a IA do recrutamento e o que cada pessoa consegue ver.
              </p>
            </div>
            <div className="border-t border-line">
              {FAQ.map((f) => (
                <details key={f.q} className="group border-b border-line py-6">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 font-display text-xl font-semibold tracking-tight">
                    {f.q}
                    <span className="text-2xl leading-none text-brand-text transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 max-w-xl leading-relaxed text-ink-2">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Chamada final */}
        <section className="relative overflow-hidden bg-surface">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-[-60%] mx-auto h-[36rem] max-w-4xl rounded-full blur-3xl"
            style={{ background: "radial-gradient(closest-side, rgb(2 89 243 / 0.28), transparent)" }}
          />
          <div className="relative mx-auto max-w-[1440px] px-5 py-24 text-center sm:px-8 lg:py-32">
            <h2 className="mx-auto max-w-4xl font-display text-4xl leading-[1.02] font-bold tracking-[-0.03em] sm:text-6xl">
              Comece hoje. <span className="text-brand-text">Veja resultado amanhã.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-lg text-ink-2">
              Crie a conta, escolha o módulo e veja o primeiro relatório ou o primeiro currículo chegar ainda hoje.
            </p>
            <Link href="/criar-conta" className={clsx(btnPrimary, "mt-10")}>
              {CTA}
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-5 py-10 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8">
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
