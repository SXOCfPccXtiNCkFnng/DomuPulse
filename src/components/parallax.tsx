"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

/**
 * Cena que acompanha o mouse em qualquer lugar da tela (não só em cima dela).
 * Guarda a posição do ponteiro em duas variáveis CSS (--px e --py, de -1 a
 * 1, centro da tela = 0) e cada <Depth> dentro dela se desloca
 * proporcionalmente à própria profundidade.
 *
 * Para brincar: mude o `depth` de cada <Depth>. Positivo segue o mouse,
 * negativo vai na direção contrária; quanto maior, mais anda (em px).
 */
export function ParallaxScene({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;

    // mousemove no documento: vale para mouse e touchpad, em qualquer ponto
    // da tela. Em toque não dispara, então no celular nada se mexe.
    const move = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 2;
      const y = (e.clientY / window.innerHeight - 0.5) * 2;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        el.style.setProperty("--px", x.toFixed(3));
        el.style.setProperty("--py", y.toFixed(3));
      });
    };

    document.addEventListener("mousemove", move, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("mousemove", move);
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/** Camada que se move com o mouse. `depth` em px no limite da tela. */
export function Depth({
  depth,
  className,
  style,
  duration = 0.6,
  children,
}: {
  depth: number;
  className?: string;
  style?: CSSProperties;
  /** Tempo, em segundos, para a camada alcançar o mouse. */
  duration?: number;
  children: ReactNode;
}) {
  return (
    <div
      data-depth={depth}
      className={className}
      style={{
        ...style,
        transform: `translate3d(calc(var(--px, 0) * ${depth}px), calc(var(--py, 0) * ${depth}px), 0)`,
        transition: `transform ${duration}s cubic-bezier(0.2, 0.8, 0.2, 1)`,
        willChange: "transform",
      }}
    >
      {children}
    </div>
  );
}
