import { Table2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { num } from "../../js/formato.js";

/** Aparência comum dos eixos: grade quase invisível, números pequenos e cinzas. */
export const GRADE = { stroke: "var(--linha)", strokeDasharray: "2 4", vertical: false } as const;
export const EIXO = { stroke: "var(--linha-2)", tickLine: false, tick: { fill: "var(--tinta-3)", fontSize: 12 } } as const;
export const COR = { s1: "var(--s1)", s2: "var(--s2)", s3: "var(--s3)", s4: "var(--s4)" } as const;

/**
 * O rótulo de um número no eixo, em %: sem casa decimal se o número é redondo, com uma se não é. Antes o eixo escrevia sempre
 * zero casas, e uma marca em 8,5% saía como "8%" ao lado de outra "8%".
 */
export const rotuloPct = (v: number) => {
  const redondo = Math.abs(v - Math.round(v)) < 1e-6;
  return `${num(redondo ? Math.round(v) : v, redondo ? 0 : 1)}%`;
};

/**
 * As marcas de um eixo de taxa (%): de passo "redondo" (0,05, 0,1, 0,25, 0,5, 1, 2, 5, 10 ou 20), no máximo `maximo` delas, e o
 * rótulo com as casas que o passo pede. Antes o gráfico espaçava 5 marcas iguais entre o menor e o maior valor e eu arredondava o
 * rótulo: 6,75% saía como "6,8%".
 */
export function marcasDeTaxa(lo: number, hi: number, maximo = 6) {
  const passos = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20];
  const quantas = (p: number) => Math.floor(hi / p + 1e-9) - Math.ceil(lo / p - 1e-9) + 1;
  const passo = passos.find((p) => quantas(p) <= maximo) ?? 50;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / passo - 1e-9) * passo; v <= hi + 1e-9; v += passo) ticks.push(Math.round(v * 1e6) / 1e6 + 0); // + 0 troca um "-0" (de ceil(-1e-9) * passo) por 0
  const casas = passo >= 1 ? 0 : passo >= 0.5 ? 1 : passo >= 0.25 ? 2 : passo >= 0.1 ? 1 : 2;
  return { ticks, formato: (v: number) => `${num(v, casas)}%` };
}

/** Largura atual de um elemento (para os gráficos que eu mesmo desenho em SVG). */
export function useLargura<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [largura, setLargura] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setLargura(el.clientWidth);
    const obs = new ResizeObserver(([e]) => setLargura(Math.round(e.contentRect.width)));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, largura];
}

/** A moldura de um gráfico: título que diz o que ele mostra, legenda, o gráfico e a tabela com os mesmos números. */
export function Quadro({
  titulo,
  subtitulo,
  legenda,
  children,
  tabela,
  rodape,
  acoes,
}: {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  legenda?: { cor: string; nome: string; tracejado?: boolean }[];
  children: ReactNode;
  tabela?: { colunas: string[]; linhas: (string | number)[][] };
  rodape?: ReactNode;
  acoes?: ReactNode;
}) {
  return (
    <figure className="folha m-0 min-w-0 p-4 md:p-5">
      <figcaption className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="m-0 font-sans text-[0.95rem] font-semibold tracking-normal text-tinta">{titulo}</h3>
          {subtitulo ? <p className="m-0 mt-0.5 text-[0.8125rem] text-tinta3">{subtitulo}</p> : null}
        </div>
        {acoes ? <div className="nao-imprime min-w-0 max-w-full">{acoes}</div> : null}
      </figcaption>
      {legenda && legenda.length > 1 ? (
        <ul className="m-0 mb-2 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[0.8rem] text-tinta2">
          {legenda.map((l) => (
            <li key={l.nome} className="inline-flex items-center gap-1.5">
              <svg width="22" height="8" aria-hidden>
                <line x1="1" x2="21" y1="4" y2="4" stroke={l.cor} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={l.tracejado ? "5 4" : undefined} />
              </svg>
              {l.nome}
            </li>
          ))}
        </ul>
      ) : null}
      {children}
      {rodape ? <div className="mt-3 text-[0.8125rem] text-tinta2">{rodape}</div> : null}
      {tabela ? <Gemea {...tabela} /> : null}
    </figure>
  );
}

/** A "tabela gêmea": os mesmos números do gráfico em texto, para leitor de tela, cópia e conferência. */
function Gemea({ colunas, linhas }: { colunas: string[]; linhas: (string | number)[][] }) {
  return (
    <details className="nao-imprime group mt-3 border-t border-linha pt-2.5">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-tinta3 hover:text-marca [&::-webkit-details-marker]:hidden">
        <Table2 size={13} aria-hidden /> Ver os números do gráfico
      </summary>
      <div className="rolagem mt-2 max-h-64 overflow-auto rounded-lg border border-linha">
        <table className="w-full min-w-max text-left text-[0.8rem]">
          <thead>
            <tr>
              {colunas.map((c, i) => (
                <th key={c} scope="col" className={`sticky top-0 border-b border-linha2 bg-folha2 px-2.5 py-1.5 text-[0.68rem] font-bold uppercase tracking-wider text-tinta3 ${i ? "text-right" : ""}`}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={i}>
                {l.map((c, j) => (
                  <td key={j} className={`num border-b border-linha/60 px-2.5 py-1 ${j ? "text-right" : ""}`}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

type LinhaDoBalao = { cor: string; nome: string; valor: string; tracejado?: boolean; destaque?: boolean };

/** O balão que aparece ao passar o mouse num gráfico: um título e uma linha por série, cada uma com a sua cor. */
export function Balao({ titulo, linhas, nota }: { titulo: ReactNode; linhas: LinhaDoBalao[]; nota?: ReactNode }) {
  return (
    <div className="min-w-[10rem] max-w-[17rem] rounded-xl border border-linha2 bg-folha px-3 py-2.5 text-[0.8125rem] shadow-[var(--sombra-balao)]">
      <p className="m-0 mb-1.5 text-xs font-semibold text-tinta2">{titulo}</p>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {linhas.map((l) => (
          <li key={l.nome} className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-tinta2">
              <svg width="14" height="8" aria-hidden>
                <line x1="1" x2="13" y1="4" y2="4" stroke={l.cor} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={l.tracejado ? "3 2.5" : undefined} />
              </svg>
              {l.nome}
            </span>
            <span className={`num ${l.destaque ? "font-bold text-tinta" : "font-semibold text-tinta"}`}>{l.valor}</span>
          </li>
        ))}
      </ul>
      {nota ? <p className="m-0 mt-1.5 border-t border-linha pt-1.5 text-xs text-tinta3">{nota}</p> : null}
    </div>
  );
}
