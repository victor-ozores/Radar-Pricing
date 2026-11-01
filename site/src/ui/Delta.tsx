import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { pp, sinal } from "../../js/formato.js";

type Props = {
  valor: number | null | undefined;
  /** "pp": pontos percentuais; "pct": variação em %; "num": número com sinal na unidade que a pessoa escolher */
  tipo?: "pp" | "pct" | "num";
  casas?: number;
  sufixo?: string;
  /** "7 dias", "no trimestre"... aparece depois do valor, em cinza */
  periodo?: string;
  tamanho?: "p" | "m";
  /** texto já formatado (com a unidade da série); sem isso, o texto sai de `tipo` */
  texto?: string;
};

/**
 * A variação de um número. A seta e o sinal carregam o sentido (nunca só a cor): laranja é "subiu", azul é "caiu".
 * Subir não é bom nem ruim: depende de quem olha, então a cor não julga.
 */
export function Delta({ valor, tipo = "pp", casas = 2, sufixo = "", periodo, tamanho = "m", texto: pronto }: Props) {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return <span className="text-tinta3">—</span>;
  const zero = Math.round(Math.abs(valor) * 10 ** casas) === 0;
  const Seta = zero ? Minus : valor > 0 ? ArrowUpRight : ArrowDownRight;
  const cor = zero ? "bg-folha2 text-tinta2" : valor > 0 ? "bg-sobe2 text-sobe" : "bg-cai2 text-cai";
  const texto = pronto ?? (tipo === "pp" ? pp(valor, casas) : tipo === "pct" ? `${sinal(valor, casas)}%` : `${sinal(valor, casas)}${sufixo ? ` ${sufixo}` : ""}`);
  const sentido = zero ? "sem mudança" : valor > 0 ? "subiu" : "caiu";
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        className={`num inline-flex items-center gap-0.5 rounded-full font-semibold ${cor} ${tamanho === "p" ? "px-1.5 py-px text-[0.72rem]" : "px-2 py-0.5 text-[0.8rem]"}`}
        aria-label={`${sentido} ${texto}`}
      >
        <Seta size={tamanho === "p" ? 12 : 14} strokeWidth={2.4} aria-hidden />
        {texto.replace(/^[+−]/, "")}
      </span>
      {periodo ? <span className="text-xs text-tinta3">{periodo}</span> : null}
    </span>
  );
}

