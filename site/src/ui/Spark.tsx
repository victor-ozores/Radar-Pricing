import { useId } from "react";

type Props = {
  valores: number[];
  largura?: number;
  altura?: number;
  /** cor da linha e do ponto final (uma variável de cor do tema) */
  cor?: string;
  rotulo?: string;
};

/**
 * Mini-gráfico de linha, sem eixos: só a forma do último período. O ponto marca o valor de hoje.
 * Com menos de 2 valores não desenha nada (uma linha de um ponto só enganaria).
 */
export function Spark({ valores, largura = 96, altura = 32, cor = "var(--s1)", rotulo }: Props) {
  const id = useId();
  const v = valores.filter((x) => Number.isFinite(x));
  if (v.length < 2) return <span className="inline-block text-xs text-tinta3" style={{ width: largura }} aria-hidden />;
  const min = Math.min(...v);
  const max = Math.max(...v);
  const folga = max === min ? 1 : (max - min) * 0.12;
  const [lo, hi] = [min - folga, max + folga];
  const x = (i: number) => 3 + (i / (v.length - 1)) * (largura - 6);
  const y = (n: number) => altura - 3 - ((n - lo) / (hi - lo)) * (altura - 6);
  const linha = v.map((n, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(n).toFixed(1)}`).join("");
  const area = `${linha}L${x(v.length - 1).toFixed(1)} ${altura}L${x(0).toFixed(1)} ${altura}Z`;
  return (
    <svg width={largura} height={altura} viewBox={`0 0 ${largura} ${altura}`} role={rotulo ? "img" : undefined} aria-label={rotulo} aria-hidden={rotulo ? undefined : true} className="overflow-visible">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={cor} stopOpacity="0.22" />
          <stop offset="1" stopColor={cor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={linha} fill="none" stroke={cor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="spark-desenha" />
      <circle cx={x(v.length - 1)} cy={y(v.at(-1)!)} r="3.2" fill={cor} stroke="var(--folha)" strokeWidth="2" />
    </svg>
  );
}
