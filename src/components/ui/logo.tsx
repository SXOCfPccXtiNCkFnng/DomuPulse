import clsx from "clsx";
import Image from "next/image";
import mark from "../../../public/brand/mark.png";
import markWhite from "../../../public/brand/mark-white.png";

/** O "D" da DomuTech. `white` para usar sobre fundo azul-marinho. */
export function BrandMark({ className, white = false }: { className?: string; white?: boolean }) {
  return <Image src={white ? markWhite : mark} alt="" aria-hidden="true" className={clsx("shrink-0 object-contain", className)} priority />;
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-2.5", className)}>
      <BrandMark className="size-7" />
      <span className="font-display text-[1.15rem] font-semibold tracking-tight leading-none">
        <span className="font-medium text-muted">Domu</span> Pulse
      </span>
    </span>
  );
}
