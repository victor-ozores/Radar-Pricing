import * as Popover from "@radix-ui/react-popover";
import * as Tooltip from "@radix-ui/react-tooltip";
import { BookOpen } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { GLOSSARIO } from "../../js/glossario.js";
import { irPara } from "../rota";

export const ProvedorDeDicas = ({ children }: { children: ReactNode }) => (
  <Tooltip.Provider delayDuration={120} skipDelayDuration={300}>
    {children}
  </Tooltip.Provider>
);

/**
 * Um balão curto ao passar o mouse, focar com o teclado ou tocar. O Radix não abre o balão por toque, então no celular o
 * toque abre por alguns segundos (e o toque fora ou em outro balão fecha).
 */
export function Dica({ texto, children, lado = "top" }: { texto: ReactNode; children: ReactNode; lado?: "top" | "bottom" | "left" | "right" }) {
  const [aberto, setAberto] = useState(false);
  const fecha = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tocou = useRef(false);
  useEffect(() => () => clearTimeout(fecha.current), []);
  const aoApertar = (e: PointerEvent) => {
    tocou.current = e.pointerType === "touch";
  };
  const aoClicar = () => {
    if (!tocou.current) return;
    clearTimeout(fecha.current);
    setTimeout(() => setAberto(true), 0); // o Radix fecha o balão no pointerdown e no clique; abro logo depois
    fecha.current = setTimeout(() => setAberto(false), 3500);
  };
  return (
    <Tooltip.Root open={aberto} onOpenChange={setAberto}>
      <Tooltip.Trigger asChild onPointerDown={aoApertar} onClick={aoClicar}>
        {children}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="balao" side={lado} sideOffset={8} collisionPadding={12}>
          {texto}
          <Tooltip.Arrow className="fill-tinta" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export type TermoDoGlossario = keyof typeof GLOSSARIO;

/**
 * Uma palavra técnica com a explicação a um toque: abre com o mouse, com o foco e com o clique (no celular, o toque).
 * A definição vem do glossário, a mesma do dicionário da aba Bastidores.
 */
export function Termo({ id, children }: { id: TermoDoGlossario; children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const fecha = useRef<number | undefined>(undefined);
  const abre = () => {
    window.clearTimeout(fecha.current);
    setAberto(true);
  };
  const fechaLogo = () => {
    window.clearTimeout(fecha.current);
    fecha.current = window.setTimeout(() => setAberto(false), 120);
  };
  return (
    <Popover.Root open={aberto} onOpenChange={setAberto}>
      <Popover.Trigger asChild>
        <button
          type="button"
          onPointerEnter={(e) => e.pointerType === "mouse" && abre()}
          onPointerLeave={(e) => e.pointerType === "mouse" && fechaLogo()}
          className="cursor-help rounded-sm border-0 bg-transparent p-0 font-[inherit] text-inherit underline decoration-tinta3 decoration-dotted decoration-1 underline-offset-[5px] hover:decoration-marca"
        >
          {children}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          sideOffset={8}
          collisionPadding={12}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onPointerEnter={abre}
          onPointerLeave={fechaLogo}
          className="balao balao-claro"
        >
          <p className="m-0 text-[0.8125rem] leading-snug">{GLOSSARIO[id]}</p>
          <button
            type="button"
            onClick={() => {
              setAberto(false);
              irPara("bastidores", "dicionario");
            }}
            className="mt-2 inline-flex items-center gap-1 border-0 bg-transparent p-0 text-xs font-semibold text-marca hover:underline"
          >
            <BookOpen size={12} aria-hidden /> Ver o dicionário
          </button>
          <Popover.Arrow className="fill-folha stroke-linha2" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** O "i" pequeno ao lado de um título: explica de onde vem o número ou como foi calculado. */
export function Info({ children, rotulo = "Como ler" }: { children: ReactNode; rotulo?: string }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={rotulo}
          className="inline-grid size-[1.15rem] place-items-center rounded-full border border-linha2 bg-transparent p-0 text-[0.68rem] font-bold leading-none text-tinta3 hover:border-marca hover:text-marca"
        >
          i
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="top" sideOffset={8} collisionPadding={12} className="balao balao-claro">
          <div className="text-[0.8125rem] leading-snug">{children}</div>
          <Popover.Arrow className="fill-folha stroke-linha2" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
