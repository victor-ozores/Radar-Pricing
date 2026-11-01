import { useMemo, useState } from "react";
import { dataBR, mesAno, num, pct, pp } from "../../js/formato.js";
import { Termo } from "../ui/dicas";
import { Balao, Quadro, useLargura } from "./base";

type Banco = { banco: string; taxa: number };
type Modalidade = {
  data: string;
  n: number;
  bancos: Banco[];
  resumo: { menor: number; p25: number; mediana: number; p75: number; maior: number };
  anterior: { data: string; mediana: number } | null;
};

const ALTURA_LINHA = 116;
const ALTURA_LINHA_COMPACTA = 140; // no celular o nome fica em cima da faixa, não ao lado
const MARGEM = { e: 168, d: 18, t: 30 };

/** Posição vertical (espalhada) de cada banco numa linha, para as bolinhas de taxas parecidas não se esconderem. */
function espalha(bancos: Banco[], x: (v: number) => number) {
  const colocados: { x: number; y: number }[] = [];
  const faixas = [0, -1, 1, -2, 2, -3, 3];
  return bancos.map((b) => {
    const px = x(b.taxa);
    const faixa = faixas.find((f) => colocados.every((c) => Math.abs(c.x - px) > 11 || c.y !== f)) ?? 0;
    colocados.push({ x: px, y: faixa });
    return { ...b, px, py: faixa };
  });
}

function Faixa({ m, nome, y0, largura, maximo, compacto, aoPassar, aoSair }: { m: Modalidade; nome: string; y0: number; largura: number; maximo: number; compacto: boolean; aoPassar: (e: React.PointerEvent | React.FocusEvent, b: Banco | "resumo", m: Modalidade, nome: string) => void; aoSair: () => void }) {
  const margemE = compacto ? 14 : MARGEM.e;
  const x = (v: number) => margemE + (v / maximo) * (largura - margemE - MARGEM.d);
  const meio = compacto ? y0 + 98 : y0 + ALTURA_LINHA / 2 + 4;
  const pontos = useMemo(() => espalha(m.bancos, x), [m.bancos, largura]); // eslint-disable-line react-hooks/exhaustive-deps
  const { menor, p25, mediana, p75, maior } = m.resumo;
  return (
    <g>
      {compacto ? (
        <>
          <text x={0} y={y0 + 12} fontSize="14" fontWeight="700" fill="var(--tinta)">
            {nome}
          </text>
          <text x={0} y={y0 + 31} fontSize="12" fill="var(--tinta-3)">
            {m.n} {m.n === 1 ? "banco" : "bancos"} · {mesAno(m.data)} ·{" "}
            <tspan fontWeight="600" fill="var(--tinta-2)" className="num">
              mediana {pct(mediana)}
            </tspan>
          </text>
        </>
      ) : (
        <>
          <text x={0} y={meio - 12} fontSize="14" fontWeight="700" fill="var(--tinta)">
            {nome}
          </text>
          <text x={0} y={meio + 6} fontSize="12" fill="var(--tinta-3)">
            {m.n} {m.n === 1 ? "banco" : "bancos"} · {mesAno(m.data)}
          </text>
          <text x={0} y={meio + 24} fontSize="12" fontWeight="600" fill="var(--tinta-2)" className="num">
            mediana {pct(mediana)}
          </text>
        </>
      )}
      {/* o miolo: do 1º ao 3º quartil, metade dos bancos */}
      <rect
        x={x(p25)}
        y={meio - 24}
        width={Math.max(2, x(p75) - x(p25))}
        height={48}
        rx={10}
        fill="var(--s1)"
        fillOpacity={0.13}
        stroke="var(--s1)"
        strokeOpacity={0.35}
        tabIndex={0}
        role="img"
        aria-label={`${nome}: metade dos bancos cobra entre ${pct(p25)} e ${pct(p75)}`}
        onPointerEnter={(e) => aoPassar(e, "resumo", m, nome)}
        onPointerLeave={aoSair}
        onFocus={(e) => aoPassar(e, "resumo", m, nome)}
        onBlur={aoSair}
      />
      <line x1={x(menor)} x2={x(maior)} y1={meio} y2={meio} stroke="var(--tinta-3)" strokeWidth={1.5} strokeDasharray="1 4" strokeLinecap="round" />
      {/* a mediana de agora e, se existe, a anterior */}
      <line x1={x(mediana)} x2={x(mediana)} y1={meio - 30} y2={meio + 30} stroke="var(--tinta)" strokeWidth={3} strokeLinecap="round" pointerEvents="none" />
      {m.anterior ? (
        <path d={`M${x(m.anterior.mediana)} ${meio - 33}l6 6-6 6-6-6z`} fill="var(--folha)" stroke="var(--tinta-2)" strokeWidth={1.6} pointerEvents="none">
          <title>{`Mediana anterior (${dataBR(m.anterior.data)}): ${pct(m.anterior.mediana)}`}</title>
        </path>
      ) : null}
      {pontos.map((b) => (
        <circle
          key={b.banco}
          cx={b.px}
          cy={meio + b.py * 9}
          r={5.5}
          fill="var(--s1)"
          stroke="var(--folha)"
          strokeWidth={2}
          tabIndex={0}
          role="img"
          aria-label={`${b.banco}: ${pct(b.taxa)} ao ano`}
          onPointerEnter={(e) => aoPassar(e, b, m, nome)}
          onPointerLeave={aoSair}
          onFocus={(e) => aoPassar(e, b, m, nome)}
          onBlur={aoSair}
          className="cursor-pointer outline-none focus-visible:stroke-tinta"
        />
      ))}
    </g>
  );
}

/**
 * Cada bolinha é um banco. A faixa colorida é o miolo (metade dos bancos), o traço grosso é a mediana e o losango
 * vazio, a mediana da data anterior. Todas as modalidades usam o mesmo eixo, então dá para comparar o tamanho.
 */
export function FaixasDeCredito({ imobiliario, veiculos }: { imobiliario: Modalidade | null; veiculos: Modalidade | null }) {
  const [ref, largura] = useLargura<HTMLDivElement>();
  const [dica, setDica] = useState<{ x: number; y: number; alvo: Banco | "resumo"; m: Modalidade; nome: string } | null>(null);
  const linhas = [imobiliario && { m: imobiliario, nome: "Financiamento imobiliário" }, veiculos && { m: veiculos, nome: "Financiamento de veículos" }].filter(Boolean) as { m: Modalidade; nome: string }[];
  if (linhas.length === 0) return null;
  const maximo = Math.ceil(Math.max(...linhas.map((l) => l.m.resumo.maior)) / 10) * 10;
  const w = Math.max(320, largura);
  const compacto = w < 560;
  const alturaLinha = compacto ? ALTURA_LINHA_COMPACTA : ALTURA_LINHA;
  const margemE = compacto ? 14 : MARGEM.e;
  const alturaTotal = MARGEM.t + linhas.length * alturaLinha + 28;
  const passo = compacto ? 20 : 10;
  const marcas = Array.from({ length: Math.floor(maximo / passo) + 1 }, (_, i) => i * passo);

  const passa = (e: React.PointerEvent | React.FocusEvent, alvo: Banco | "resumo", m: Modalidade, nome: string) => {
    const caixa = ref.current?.getBoundingClientRect();
    const alvoEl = (e.currentTarget as SVGElement).getBoundingClientRect();
    if (!caixa) return;
    setDica({ x: alvoEl.left - caixa.left + alvoEl.width / 2, y: alvoEl.top - caixa.top, alvo, m, nome });
  };

  return (
    <Quadro
      titulo="O crédito que concorre com o consórcio: taxa de cada banco"
      subtitulo={<>Juros do financiamento, em % ao ano, informados ao Banco Central. Cada bolinha é um banco; o traço grosso é a <Termo id="mediana">mediana</Termo> e a faixa, o miolo entre o 1º e o 3º <Termo id="quartil">quartil</Termo>.</>}
      rodape={
        <span className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-tinta3">
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-3 w-5 rounded-md border border-[color:var(--s1)]/40 bg-[color:var(--s1)]/15" /> metade dos bancos (1º ao 3º quartil)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-4 w-[3px] rounded bg-tinta" /> mediana
          </span>
          {linhas.some((l) => l.m.anterior) ? (
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block size-2.5 rotate-45 border-[1.6px] border-tinta2 bg-folha" /> mediana anterior
            </span>
          ) : null}
        </span>
      }
      tabela={{
        colunas: ["Modalidade", "Banco", "Taxa (% a.a.)"],
        linhas: linhas.flatMap((l) => [...l.m.bancos].sort((a, b) => a.taxa - b.taxa).map((b) => [l.nome, b.banco, num(b.taxa)])),
      }}
    >
      <div ref={ref} className="relative w-full">
        <svg width={w} height={alturaTotal} viewBox={`0 0 ${w} ${alturaTotal}`} role="group" aria-label="Taxas de financiamento por banco" className="block overflow-visible">
          {marcas.map((t) => {
            const px = margemE + (t / maximo) * (w - margemE - MARGEM.d);
            return (
              <g key={t}>
                <line x1={px} x2={px} y1={MARGEM.t - 10} y2={alturaTotal - 24} stroke="var(--linha)" strokeDasharray="2 4" />
                <text x={px} y={alturaTotal - 6} textAnchor="middle" fontSize="12" fill="var(--tinta-3)">
                  {t}%
                </text>
              </g>
            );
          })}
          {linhas.map((l, i) => (
            <Faixa key={l.nome} m={l.m} nome={l.nome} y0={MARGEM.t + i * alturaLinha - 10} largura={w} maximo={maximo} compacto={compacto} aoPassar={passa} aoSair={() => setDica(null)} />
          ))}
        </svg>
        {dica ? (
          <div className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full pb-2" style={{ left: Math.min(Math.max(dica.x, 120), w - 120), top: dica.y }}>
            {dica.alvo === "resumo" ? (
              <Balao
                titulo={`${dica.nome} · ${dataBR(dica.m.data)}`}
                linhas={[
                  { cor: "var(--s1)", nome: "Mais barato", valor: pct(dica.m.resumo.menor) },
                  { cor: "var(--s1)", nome: "1º quartil", valor: pct(dica.m.resumo.p25) },
                  { cor: "var(--tinta)", nome: "Mediana", valor: pct(dica.m.resumo.mediana), destaque: true },
                  { cor: "var(--s1)", nome: "3º quartil", valor: pct(dica.m.resumo.p75) },
                  { cor: "var(--s1)", nome: "Mais caro", valor: pct(dica.m.resumo.maior) },
                ]}
                nota={dica.m.anterior ? `Mediana anterior (${dataBR(dica.m.anterior.data)}): ${pct(dica.m.anterior.mediana)} (${pp(dica.m.resumo.mediana - dica.m.anterior.mediana)})` : undefined}
              />
            ) : (
              <Balao titulo={dica.alvo.banco} linhas={[{ cor: "var(--s1)", nome: "Taxa", valor: `${pct(dica.alvo.taxa)} a.a.`, destaque: true }]} nota={`${pp(dica.alvo.taxa - dica.m.resumo.mediana)} contra a mediana (${pct(dica.m.resumo.mediana)})`} />
            )}
          </div>
        ) : null}
      </div>
    </Quadro>
  );
}
