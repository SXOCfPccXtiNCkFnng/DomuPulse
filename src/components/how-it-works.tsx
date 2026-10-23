"use client";

import clsx from "clsx";
import { Bell, CalendarOff, Clock, Layers, Pencil, ShieldCheck, Smartphone, Target, Timer } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

const STEPS = [
  {
    n: "01",
    title: "Você marca os horários",
    lead: "O dia da equipe passa a ter hora para prestar conta. Você escolhe de 1 a 8 horários, no fuso da empresa, do jeito que a sala já funciona.",
    text: "Dez minutos antes de cada um, o Pulse avisa o corretor no celular. Quem marcou folga não recebe lembrete e não aparece como pendente. O gerente deixa de cobrar no grupo.",
    points: [
      { Icon: Clock, text: "12h, 15h, 18h e 21h, ou qualquer outro horário" },
      { Icon: Bell, text: "Aviso no celular, 10 minutos antes" },
      { Icon: CalendarOff, text: "Folga do dia tira a pessoa da cobrança" },
    ],
  },
  {
    n: "02",
    title: "Ele lança em 30 segundos",
    lead: "O relatório é o que ele fez desde o horário anterior. Leads, conversas, negociações, agendamentos, visitas, propostas, pré-vendas e vendas.",
    text: "Botões grandes, no navegador do celular. Sem baixar loja e sem planilha. Se errou um número, corrige e reenvia. A liderança já está vendo.",
    points: [
      { Icon: Layers, text: "Oito números do funil, do lead à venda" },
      { Icon: Smartphone, text: "Cabe numa mão, sem treinamento" },
      { Icon: Pencil, text: "Dá para corrigir e mandar de novo" },
    ],
  },
  {
    n: "03",
    title: "Você vê na hora",
    lead: "Quem entregou, quem atrasou, o funil de cada equipe e o ranking do dia. O painel muda sozinho, no segundo em que o corretor lança.",
    text: "Pelo ritmo de visitas e vendas, no dia 10 você já sabe se a meta do mês fecha. Corretor vê os próprios números. Gerente vê a equipe. Diretoria vê a empresa inteira.",
    points: [
      { Icon: Timer, text: "O atraso aparece enquanto ainda dá tempo de agir" },
      { Icon: Target, text: "Meta e projeção no ritmo de agora" },
      { Icon: ShieldCheck, text: "Cada cargo vê só o que deve ver" },
    ],
  },
];

const REPORT = [
  ["Leads", "6"],
  ["Interações", "11"],
  ["Negociações", "4"],
  ["Agendamentos", "3"],
  ["Visitas", "4"],
  ["Propostas", "1"],
  ["Pré-vendas", "1"],
  ["Vendas", "1"],
];

function Note({ kicker, title, children, foot }: { kicker: string; title: string; children: ReactNode; foot: string }) {
  return (
    <div className="w-full text-ink">
      <p className="text-[12px] font-semibold tracking-[0.16em] text-brand-text uppercase">{kicker}</p>
      <p className="mt-3 font-display text-3xl font-semibold tracking-tight">{title}</p>
      <div className="mt-8 border-t border-line">{children}</div>
      <p className="mt-6 text-[15px] leading-relaxed text-muted">{foot}</p>
    </div>
  );
}

function Line({ left, right, quiet = false }: { left: string; right: string; quiet?: boolean }) {
  return (
    <li className="flex items-baseline justify-between gap-6 border-b border-line py-3.5">
      <span className={clsx("font-display text-2xl font-semibold tabular-nums", quiet && "text-muted")}>{left}</span>
      <span className={clsx("text-sm", quiet ? "text-muted" : "text-ink-2")}>{right}</span>
    </li>
  );
}

/** O lado parado. Só tipo, na mesma voz do resto da página. */
function StepPreview({ step }: { step: number }) {
  if (step === 0) {
    return (
      <Note kicker="Equipe Norte" title="Horários de hoje" foot="O lembrete sai sozinho, dez minutos antes de cada horário.">
        <ul>
          <Line left="12h" right="18 de 18" />
          <Line left="15h" right="14 de 18, aberto" />
          <Line left="18h" right="aviso às 17h50" quiet />
          <Line left="21h" right="aviso às 20h50" quiet />
        </ul>
      </Note>
    );
  }

  if (step === 1) {
    return (
      <Note kicker="Marina Alves, 15h" title="O que ela lançou" foot="Oito números. Meio minuto no celular.">
        <ul className="grid grid-cols-2 gap-x-10">
          {REPORT.map(([label, value], i) => (
            <li key={label} className={clsx("border-b border-line py-3.5", i >= REPORT.length - 2 && "sm:border-b-0")}>
              <span className="block font-display text-3xl font-semibold tabular-nums">{value}</span>
              <span className="text-sm text-muted">{label}</span>
            </li>
          ))}
        </ul>
      </Note>
    );
  }

  return (
    <Note kicker="Agora" title="14 de 18 entregues" foot="Corretor vê o próprio dia. Gerente vê a equipe. Diretoria vê a empresa.">
      <ul>
        <Line left="Marina" right="entregue, 4 visitas" />
        <Line left="Rafael" right="ainda não lançou" />
      </ul>
      <p className="pt-6 font-display text-2xl font-semibold tracking-tight">
        22 visitas, 6 propostas, 2 vendas.
      </p>
    </Note>
  );
}

export function HowItWorks() {
  const [active, setActive] = useState(0);
  const items = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const nodes = items.current.filter((node): node is HTMLLIElement => Boolean(node));
    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!hit) return;
        setActive(Number((hit.target as HTMLLIElement).dataset.step));
      },
      { rootMargin: "-30% 0px -30% 0px", threshold: [0.2, 0.5, 0.8] },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return (
    <section id="como-funciona" className="scroll-mt-28">
      <div className="mx-auto max-w-[1440px] px-5 sm:px-8">
        <div className="max-w-3xl pt-20 lg:pt-28">
          <p className="flex items-center gap-3 text-[12px] font-semibold tracking-[0.18em] text-brand-text uppercase">
            <span className="h-px w-8 bg-brand-text" />
            Corretores, como funciona
          </p>
          <h2 className="mt-5 font-display text-4xl font-bold tracking-[-0.02em] sm:text-5xl">Três passos. Nenhuma planilha.</h2>
          <p className="mt-5 text-lg leading-relaxed text-ink-2">
            Você define quando a equipe presta conta. O corretor lança pelo celular. Você acompanha a sala enquanto a venda ainda está acontecendo.
          </p>
        </div>

        <div className="mt-6 grid lg:mt-0 lg:grid-cols-[1.15fr_0.85fr] lg:gap-20">
          <ol>
            {STEPS.map((step, i) => (
              <li
                key={step.n}
                data-step={i}
                ref={(node) => {
                  items.current[i] = node;
                }}
                className={clsx(
                  "flex flex-col justify-center py-14 transition-opacity duration-300 lg:min-h-[75vh] lg:py-24",
                  i > 0 && "border-t border-line",
                  i !== active && "lg:opacity-40",
                )}
              >
                <span className="font-display text-6xl font-bold text-brand-text tabular-nums">{step.n}</span>
                <h3 className="mt-6 max-w-xl font-display text-3xl font-semibold tracking-tight">{step.title}</h3>
                <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink">{step.lead}</p>
                <p className="mt-3 max-w-xl leading-relaxed text-ink-2">{step.text}</p>
                <ul className="mt-6 max-w-xl space-y-2.5">
                  {step.points.map((point) => (
                    <li key={point.text} className="flex items-start gap-3 text-[15px] leading-relaxed text-ink-2">
                      <point.Icon className="mt-0.5 size-4 shrink-0 text-brand-text" strokeWidth={1.8} />
                      {point.text}
                    </li>
                  ))}
                </ul>
                <div className="mt-8 lg:hidden">
                  <StepPreview step={i} />
                </div>
              </li>
            ))}
          </ol>

          <div className="hidden lg:block">
            <div className="sticky top-28 flex min-h-[75vh] items-center">
              <div key={active} className="w-full animate-rise">
                <StepPreview step={active} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
