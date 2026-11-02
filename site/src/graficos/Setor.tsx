import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { comUnidade, dataBR, deltaComUnidade, mesAno, num, pct } from "../../js/formato.js";
import { Delta } from "../ui/Delta";
import { Spark } from "../ui/Spark";
import { Contagem } from "../ui/blocos";
import { Termo } from "../ui/dicas";
import { Balao, COR, EIXO, GRADE, Quadro } from "./base";

const semMovimento = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

type Resumo = { valor: number; anterior: number | null; delta: number | null; data: string; dataAnterior: string | null; unidade: string };
type Cotas = { ativas: Resumo | null; excluidas: Resumo | null; porSegmento: { segmento: string; valor: number; delta: number; unidade: string }[]; indice: Resumo | null; calculado: number | null };

// ------------------------------------------------------------------------------------------------ índice de exclusão (rosca)
export function IndiceDeExclusao({ cotas }: { cotas: Cotas }) {
  const valor = cotas.indice?.valor ?? cotas.calculado;
  if (valor === null || valor === undefined) return null;
  const R = 52;
  const C = 2 * Math.PI * R;
  const delta = cotas.indice?.delta ?? null;
  const data = cotas.indice?.data ?? cotas.ativas?.data ?? null;
  return (
    <div className="folha flex flex-col items-center gap-3 p-5 text-center sm:flex-row sm:text-left">
      <svg width="132" height="132" viewBox="0 0 132 132" role="img" aria-label={`Índice de exclusão: ${pct(valor, 1)} das cotas já saíram do grupo`} className="shrink-0">
        <circle cx="66" cy="66" r={R} fill="none" stroke="var(--linha)" strokeWidth="14" />
        <circle cx="66" cy="66" r={R} fill="none" stroke="var(--s2)" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${(valor / 100) * C} ${C}`} transform="rotate(-90 66 66)" className="rosca-enche" />
        <text x="66" y="64" textAnchor="middle" className="display" fontSize="26" fontWeight="600" fill="var(--tinta)">
          <tspan className="num">{num(valor, 1)}%</tspan>
        </text>
        <text x="66" y="84" textAnchor="middle" fontSize="11" fill="var(--tinta-3)">
          excluídas
        </text>
      </svg>
      <div>
        <p className="rotulo m-0 mb-1">
          <Termo id="exclusao">Índice de exclusão</Termo>
        </p>
        <p className="m-0 text-[0.97rem] leading-snug text-tinta">
          De cada 100 cotas (ativas e excluídas), {num(valor, 0)} já saíram do grupo antes do fim.
        </p>
        <p className="m-0 mt-2 text-[0.8125rem] text-tinta3">
          {data ? `Banco Central, ${mesAno(data)}.` : null}
          {delta !== null ? (
            <>
              {" "}
              <Delta valor={delta} tipo="pp" casas={2} periodo="no trimestre" tamanho="p" />
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ ativas e excluídas
export function CotasAtivasEExcluidas({ cotas }: { cotas: Cotas }) {
  const { ativas, excluidas } = cotas;
  if (!ativas || !excluidas || ativas.anterior === null || excluidas.anterior === null) return null;
  const dados = [
    { periodo: mesAno(ativas.dataAnterior), ativas: ativas.anterior, excluidas: excluidas.anterior },
    { periodo: mesAno(ativas.data), ativas: ativas.valor, excluidas: excluidas.valor },
  ];
  const animar = !semMovimento();
  return (
    <Quadro
      titulo="Cotas ativas e excluídas"
      subtitulo="Em milhares de cotas, no fim de cada trimestre (Panorama de Consórcios, Banco Central)."
      legenda={[
        { cor: COR.s1, nome: "Ativas" },
        { cor: COR.s2, nome: "Excluídas" },
      ]}
      tabela={{ colunas: ["Fim do trimestre", "Ativas (mil)", "Excluídas (mil)"], linhas: dados.map((d) => [d.periodo, num(d.ativas, 0), num(d.excluidas, 0)]) }}
    >
      <div className="h-[15rem] w-full" role="img" aria-label={`Cotas ativas: ${num(dados[0].ativas, 0)} mil em ${dados[0].periodo} e ${num(dados[1].ativas, 0)} mil em ${dados[1].periodo}. Excluídas: ${num(dados[0].excluidas, 0)} mil e ${num(dados[1].excluidas, 0)} mil.`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dados} margin={{ top: 22, right: 8, bottom: 0, left: 0 }} barGap={4} barCategoryGap="30%">
            <CartesianGrid {...GRADE} />
            <XAxis dataKey="periodo" {...EIXO} />
            <YAxis {...EIXO} axisLine={false} width={56} tickFormatter={(v: number) => num(v / 1000, 0) + " mi"} />
            <Tooltip
              cursor={{ fill: "var(--folha-2)" }}
              content={({ active, payload }) => {
                const d = active && payload?.[0]?.payload;
                if (!d) return null;
                return (
                  <Balao
                    titulo={`Fim de ${d.periodo}`}
                    linhas={[
                      { cor: COR.s1, nome: "Ativas", valor: `${num(d.ativas, 0)} mil`, destaque: true },
                      { cor: COR.s2, nome: "Excluídas", valor: `${num(d.excluidas, 0)} mil`, destaque: true },
                    ]}
                    nota={`Excluídas são ${num((d.excluidas / (d.ativas + d.excluidas)) * 100, 1)}% do total de cotas`}
                  />
                );
              }}
            />
            <Bar dataKey="ativas" fill={COR.s1} radius={[5, 5, 0, 0]} maxBarSize={56} isAnimationActive={animar}>
              <LabelList dataKey="ativas" position="top" formatter={(v: unknown) => `${num(Number(v) / 1000, 1)} mi`} fill="var(--tinta)" fontSize={12} fontWeight={700} />
            </Bar>
            <Bar dataKey="excluidas" fill={COR.s2} radius={[5, 5, 0, 0]} maxBarSize={56} isAnimationActive={animar}>
              <LabelList dataKey="excluidas" position="top" formatter={(v: unknown) => `${num(Number(v) / 1000, 1)} mi`} fill="var(--tinta)" fontSize={12} fontWeight={700} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Quadro>
  );
}

// ------------------------------------------------------------------------------------------------ onde saíram mais cotas
export function ExcluidasPorSegmento({ cotas }: { cotas: Cotas }) {
  const itens = cotas.porSegmento;
  if (itens.length === 0) return null;
  const animar = !semMovimento();
  return (
    <Quadro
      titulo="Onde mais cotas foram excluídas no trimestre"
      subtitulo="Cotas excluídas a mais do que no trimestre anterior, em milhares, por tipo de bem."
      tabela={{ colunas: ["Segmento", "Excluídas no trimestre (mil)"], linhas: itens.map((i) => [i.segmento, num(i.delta, 1)]) }}
    >
      <div className="w-full" style={{ height: 52 + itens.length * 44 }} role="img" aria-label={`Excluídas no trimestre por segmento: ${itens.map((i) => `${i.segmento} ${num(i.delta, 0)} mil`).join(", ")}.`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={itens} layout="vertical" margin={{ top: 4, right: 56, bottom: 0, left: 0 }} barCategoryGap="26%">
            <CartesianGrid {...GRADE} horizontal={false} vertical />
            <XAxis type="number" {...EIXO} axisLine={false} tickFormatter={(v: number) => num(v, 0)} />
            <YAxis type="category" dataKey="segmento" {...EIXO} axisLine={false} width={132} tick={{ fill: "var(--tinta-2)", fontSize: 13 }} />
            <Tooltip
              cursor={{ fill: "var(--folha-2)" }}
              content={({ active, payload }) => {
                const d = active && payload?.[0]?.payload;
                if (!d) return null;
                return <Balao titulo={d.segmento} linhas={[{ cor: COR.s2, nome: "Excluídas no trimestre", valor: `${num(d.delta, 1)} mil`, destaque: true }, { cor: COR.s2, nome: "No total do segmento", valor: `${num(d.valor, 0)} mil` }]} />;
              }}
            />
            <Bar dataKey="delta" radius={[0, 5, 5, 0]} maxBarSize={24} isAnimationActive={animar}>
              {itens.map((i, k) => (
                <Cell key={i.segmento} fill={COR.s2} fillOpacity={k === 0 ? 1 : 0.62} />
              ))}
              <LabelList dataKey="delta" position="right" formatter={(v: unknown) => `${num(Number(v), 0)} mil`} fill="var(--tinta)" fontSize={12} fontWeight={700} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Quadro>
  );
}

// ------------------------------------------------------------------------------------------------ destaques do Panorama
type LinhaPanorama = { serie: string; descricao: string; unidade: string; data: string; valor: number; delta: number | null; anterior: number | null };

/** As métricas de risco e de custo do Panorama, uma por cartão, com o que mudou no trimestre. */
export function DestaquesDoSetor({ destaques }: { destaques: { grupo: string; linhas: LinhaPanorama[] }[] }) {
  const itens = destaques.map((g) => ({ ...(g.linhas.find((l) => /total/i.test(l.descricao)) ?? g.linhas[0]), grupo: g.grupo }));
  if (itens.length === 0) return null;
  return (
    <ul className="m-0 grid grid-cols-1 list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
      {itens.map((l) => (
        <li key={l.serie} className="folha p-4">
          <p className="rotulo m-0">{l.grupo === "Inadimplência" ? <Termo id="inadimplencia">{l.grupo}</Termo> : l.grupo}</p>
          <p className="display num m-0 mt-1 text-[1.7rem] font-semibold leading-tight text-tinta">{comUnidade(l.valor, l.unidade)}</p>
          <p className="m-0 mt-1 line-clamp-2 text-[0.8rem] text-tinta3" title={l.descricao}>
            {l.descricao}
          </p>
          <p className="m-0 mt-2 flex flex-wrap items-center gap-x-2 text-xs text-tinta3">
            {l.delta === null ? null : <Delta valor={l.delta} texto={deltaComUnidade(l.delta, l.unidade)} periodo="no trimestre" tamanho="p" />}
            <span>{dataBR(l.data).slice(3)}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------------------------------------ ABAC
type SerieAbac = { serie: string; rotulo: string; unidade: string; acumulado: boolean; pontos: { data: string; valor: number }[]; ultimo: { data: string; valor: number }; delta: number | null };

export function PainelDaAbac({ itens }: { itens: SerieAbac[] }) {
  if (itens.length === 0) return null;
  return (
    <ul className="m-0 grid grid-cols-1 list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
      {itens.map((s) => (
        <li key={s.serie} className="folha flex items-end justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="rotulo m-0">{s.rotulo}</p>
            <p className="display num m-0 mt-1 text-[1.5rem] font-semibold leading-tight text-tinta">
              <Contagem valor={s.ultimo.valor} casas={Number.isInteger(s.ultimo.valor) ? 0 : 2} />
              <span className="ml-1 font-sans text-xs font-medium text-tinta3">{s.unidade}</span>
            </p>
            <p className="m-0 mt-1 text-xs text-tinta3">
              {s.acumulado ? "acumulado até" : "em"} {mesAno(s.ultimo.data)}
              {s.delta !== null ? (
                <>
                  {" "}
                  <Delta valor={s.delta} tipo="num" casas={2} periodo="no mês" tamanho="p" />
                </>
              ) : null}
            </p>
          </div>
          <Spark valores={s.pontos.map((p) => p.valor)} largura={72} altura={36} cor={COR.s1} rotulo={`${s.rotulo}: ${s.pontos.map((p) => `${mesAno(p.data)} ${num(p.valor, 2)}`).join(", ")}`} />
        </li>
      ))}
    </ul>
  );
}

