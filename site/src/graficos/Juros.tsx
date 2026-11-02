import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { dataBR, mesAno, num, pct, pp, sinal } from "../../js/formato.js";
import { custoDoDinheiro } from "../../js/historico.js";
import { Segmentado } from "../ui/blocos";
import type { Foto } from "../tipos";
import { Balao, COR, EIXO, GRADE, Quadro, marcasDeTaxa } from "./base";

const semMovimento = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/** Um ponto de uma curva do Tesouro, como modelo.curvas() entrega. */
type Ponto = { vencimento: string; ano?: number; taxa: number; ref7: number | null; d7: number | null; d30: number | null };
type Curva = { id: string; nome: string; descricao: string; titulo: string; base: string; pontos: Ponto[] };

const NOMES_DO_PRAZO: Record<string, string> = { hoje: "Hoje", ha7: "Há 7 dias", ha30: "Há 30 dias" };

/** "Hoje" é o azul cheio; "há 7 dias" é laranja e "há 30 dias" é cinza, tracejados: três linhas que não se confundem. */
const COR_HA7 = COR.s2;
const COR_HA30 = "var(--tinta-3)";

/** Faixa de valores com folga, arredondada para meio ponto, para o eixo não colar nas linhas. */
function dominio(valores: number[], passo = 0.5): [number, number] {
  const v = valores.filter((x) => Number.isFinite(x));
  if (v.length === 0) return [0, 1];
  const lo = Math.floor((Math.min(...v) - passo * 0.4) / passo) * passo;
  const hi = Math.ceil((Math.max(...v) + passo * 0.4) / passo) * passo;
  return [lo, hi];
}

// ------------------------------------------------------------------------------------------------ curva do Tesouro
export function CurvaDeJuros({ curvas }: { curvas: Curva[] }) {
  const [id, setId] = useState(curvas[0]?.id ?? "nominal");
  const curva = curvas.find((c) => c.id === id) ?? curvas[0];
  const linhas = useMemo(
    () =>
      curva
        ? curva.pontos.map((p) => ({
            rotulo: p.vencimento.slice(0, 4),
            vencimento: p.vencimento,
            hoje: p.taxa,
            ha7: p.ref7,
            ha30: p.d30 === null ? null : p.taxa - p.d30,
            d7: p.d7,
            d30: p.d30,
          }))
        : [],
    [curva],
  );
  if (!curva) return null;
  const tem7 = linhas.some((l) => l.ha7 !== null);
  const tem30 = linhas.some((l) => l.ha30 !== null);
  const [lo, hi] = dominio(linhas.flatMap((l) => [l.hoje, l.ha7 ?? l.hoje, l.ha30 ?? l.hoje]), 1);
  const animar = !semMovimento();
  const legenda = [
    { cor: COR.s1, nome: "Hoje" },
    ...(tem7 ? [{ cor: COR_HA7, nome: "Há 7 dias", tracejado: true }] : []),
    ...(tem30 ? [{ cor: COR_HA30, nome: "Há 30 dias", tracejado: true }] : []),
  ];
  return (
    <Quadro
      titulo={`Taxa do Tesouro ${curva.nome} por vencimento`}
      subtitulo={`${curva.descricao}. Em % ao ano, taxa de compra de ${dataBR(curva.base)}.`}
      legenda={legenda}
      acoes={curvas.length > 1 ? <Segmentado valor={id} aoMudar={setId} rotulo="Qual curva" opcoes={curvas.map((c) => ({ id: c.id, nome: c.nome }))} /> : null}
      tabela={{
        colunas: ["Vencimento", "Hoje (% a.a.)", "Há 7 dias", "Há 30 dias", "Δ 7 dias (p.p.)"],
        linhas: linhas.map((l) => [dataBR(l.vencimento), num(l.hoje), l.ha7 === null ? "—" : num(l.ha7), l.ha30 === null ? "—" : num(l.ha30), l.d7 === null ? "—" : sinal(l.d7)]),
      }}
    >
      <div className="h-[19rem] w-full" role="img" aria-label={`Curva ${curva.nome}: de ${pct(linhas[0].hoje)} no vencimento ${linhas[0].rotulo} a ${pct(linhas.at(-1)!.hoje)} em ${linhas.at(-1)!.rotulo}. Os números estão na tabela abaixo.`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={linhas} margin={{ top: 14, right: 18, bottom: 4, left: 0 }}>
            <CartesianGrid {...GRADE} />
            <XAxis dataKey="rotulo" {...EIXO} padding={{ left: 18, right: 18 }} />
            <YAxis {...EIXO} axisLine={false} width={48} domain={[lo, hi]} ticks={marcasDeTaxa(lo, hi).ticks} tickFormatter={marcasDeTaxa(lo, hi).formato} />
            <Tooltip
              cursor={{ stroke: "var(--linha-2)", strokeWidth: 1 }}
              content={({ active, payload }) => {
                const d = active && payload?.[0]?.payload;
                if (!d) return null;
                return (
                  <Balao
                    titulo={`Vencimento em ${mesAno(d.vencimento)}`}
                    linhas={[
                      { cor: COR.s1, nome: NOMES_DO_PRAZO.hoje, valor: pct(d.hoje), destaque: true },
                      ...(d.ha7 === null ? [] : [{ cor: COR_HA7, nome: NOMES_DO_PRAZO.ha7, valor: pct(d.ha7), tracejado: true }]),
                      ...(d.ha30 === null ? [] : [{ cor: COR_HA30, nome: NOMES_DO_PRAZO.ha30, valor: pct(d.ha30), tracejado: true }]),
                    ]}
                    nota={d.d7 === null ? undefined : `Em 7 dias: ${pp(d.d7)}${d.d30 === null ? "" : ` · em 30 dias: ${pp(d.d30)}`}`}
                  />
                );
              }}
            />
            {tem30 ? <Line dataKey="ha30" name="Há 30 dias" stroke={COR_HA30} strokeWidth={2.2} strokeDasharray="2 5" strokeLinecap="round" dot={false} activeDot={false} isAnimationActive={animar} connectNulls /> : null}
            {tem7 ? <Line dataKey="ha7" name="Há 7 dias" stroke={COR_HA7} strokeWidth={2.2} strokeDasharray="6 5" dot={false} activeDot={false} isAnimationActive={animar} connectNulls /> : null}
            <Line
              dataKey="hoje"
              name="Hoje"
              stroke={COR.s1}
              strokeWidth={3}
              dot={{ r: 5, fill: COR.s1, stroke: "var(--folha)", strokeWidth: 2 }}
              activeDot={{ r: 7, fill: COR.s1, stroke: "var(--folha)", strokeWidth: 2.5 }}
              isAnimationActive={animar}
              animationDuration={900}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Quadro>
  );
}

// ------------------------------------------------------------------------------------------------ Selic e CDI nos últimos dias
export function SelicEmDias({ foto }: { foto: Foto }) {
  const [janela, setJanela] = useState<"30" | "60">("60");
  const todas = useMemo(() => custoDoDinheiro(foto) as { data: string; meta?: number; cdi?: number }[], [foto]);
  const linhas = useMemo(() => {
    if (!todas.length) return [];
    const fim = todas.at(-1)!.data;
    const corte = new Date(new Date(`${fim}T12:00:00Z`).getTime() - Number(janela) * 86_400_000).toISOString().slice(0, 10);
    return todas.filter((l) => l.data >= corte);
  }, [todas, janela]);
  if (linhas.length < 2) return null;
  const valores = linhas.flatMap((l) => [l.meta, l.cdi]).filter((v): v is number => typeof v === "number");
  const [lo, hi] = dominio(valores, 0.25);
  const animar = !semMovimento();
  const mudou = linhas.find((l, i) => i > 0 && l.meta !== undefined && linhas[i - 1].meta !== undefined && l.meta !== linhas[i - 1].meta);
  return (
    <Quadro
      titulo="Meta Selic e CDI"
      subtitulo="% ao ano. A meta é a decisão do Copom; o CDI é a taxa do dia a dia entre bancos, anualizada."
      legenda={[
        { cor: COR.s1, nome: "Meta Selic" },
        { cor: COR.s2, nome: "CDI anualizado", tracejado: true },
      ]}
      acoes={<Segmentado valor={janela} aoMudar={setJanela} rotulo="Período" opcoes={[{ id: "30", nome: "30 dias" }, { id: "60", nome: "60 dias" }]} />}
      rodape={mudou ? `A meta mudou em ${dataBR(mudou.data)}.` : "A meta não mudou no período."}
      tabela={{
        colunas: ["Data", "Meta Selic (% a.a.)", "CDI anualizado (% a.a.)"],
        linhas: [...linhas].reverse().map((l) => [dataBR(l.data), l.meta === undefined ? "—" : num(l.meta), l.cdi === undefined ? "—" : num(l.cdi)]),
      }}
    >
      <div className="h-[16rem] w-full" role="img" aria-label={`Meta Selic e CDI nos últimos ${janela} dias. Valores na tabela abaixo.`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={linhas} margin={{ top: 10, right: 14, bottom: 0, left: 0 }}>
            <CartesianGrid {...GRADE} />
            <XAxis dataKey="data" {...EIXO} minTickGap={36} tickFormatter={(d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`} />
            <YAxis {...EIXO} axisLine={false} width={48} domain={[lo, hi]} ticks={marcasDeTaxa(lo, hi).ticks} tickFormatter={marcasDeTaxa(lo, hi).formato} />
            <Tooltip
              cursor={{ stroke: "var(--linha-2)" }}
              content={({ active, payload }) => {
                const d = active && payload?.[0]?.payload;
                if (!d) return null;
                return (
                  <Balao
                    titulo={dataBR(d.data)}
                    linhas={[
                      ...(d.meta === undefined ? [] : [{ cor: COR.s1, nome: "Meta Selic", valor: pct(d.meta), destaque: true }]),
                      ...(d.cdi === undefined ? [] : [{ cor: COR.s2, nome: "CDI anualizado", valor: pct(d.cdi), tracejado: true }]),
                    ]}
                  />
                );
              }}
            />
            <Line dataKey="meta" type="stepAfter" stroke={COR.s1} strokeWidth={3} dot={false} activeDot={{ r: 6, stroke: "var(--folha)", strokeWidth: 2 }} isAnimationActive={animar} connectNulls />
            <Line dataKey="cdi" stroke={COR.s2} strokeWidth={2} strokeDasharray="6 4" dot={false} activeDot={{ r: 5, stroke: "var(--folha)", strokeWidth: 2 }} isAnimationActive={animar} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Quadro>
  );
}

// ------------------------------------------------------------------------------------------------ o que o Focus espera
type Esperado = { ano: number; valor: number; d7: { delta: number; valor_ref: number } | null; d30: { delta: number; valor_ref: number } | null };

/** A Selic que o mercado espera no fim de cada ano, hoje contra 30 dias atrás. Parte da meta de hoje. */
export function SelicEsperada({ selic, metaHoje, data }: { selic: Esperado[]; metaHoje: number | null; data: string | null }) {
  const linhas = useMemo(() => {
    const base = metaHoje === null ? [] : [{ rotulo: "Hoje", valor: metaHoje, ref30: null as number | null, ano: 0 }];
    return [...base, ...selic.map((s) => ({ rotulo: `Fim de ${s.ano}`, valor: s.valor, ref30: s.d30?.valor_ref ?? null, ano: s.ano }))];
  }, [selic, metaHoje]);
  if (linhas.length < 2) return null;
  const tem30 = linhas.some((l) => l.ref30 !== null);
  const [lo, hi] = dominio(linhas.flatMap((l) => [l.valor, l.ref30 ?? l.valor]), 1);
  const animar = !semMovimento();
  return (
    <Quadro
      titulo="A Selic que o mercado espera"
      subtitulo={`Mediana das projeções do Boletim Focus${data ? ` de ${dataBR(data)}` : ""}, no fim de cada ano. % ao ano.`}
      legenda={[
        { cor: COR.s1, nome: "Focus de hoje" },
        ...(tem30 ? [{ cor: COR_HA30, nome: "Focus 30 dias atrás", tracejado: true }] : []),
      ]}
      tabela={{ colunas: ["Quando", "Focus de hoje (% a.a.)", "Há 30 dias (% a.a.)"], linhas: linhas.map((l) => [l.rotulo, num(l.valor), l.ref30 === null ? "—" : num(l.ref30)]) }}
    >
      <div className="h-[16rem] w-full" role="img" aria-label={`Selic esperada: ${linhas.map((l) => `${l.rotulo} ${pct(l.valor)}`).join(", ")}.`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={linhas} margin={{ top: 14, right: 18, bottom: 0, left: 0 }}>
            <CartesianGrid {...GRADE} />
            <XAxis dataKey="rotulo" {...EIXO} padding={{ left: 22, right: 22 }} />
            <YAxis {...EIXO} axisLine={false} width={48} domain={[lo, hi]} ticks={marcasDeTaxa(lo, hi).ticks} tickFormatter={marcasDeTaxa(lo, hi).formato} />
            {metaHoje !== null ? <ReferenceLine y={metaHoje} stroke="var(--linha-2)" strokeDasharray="3 4" /> : null}
            <Tooltip
              cursor={{ stroke: "var(--linha-2)" }}
              content={({ active, payload }) => {
                const d = active && payload?.[0]?.payload;
                if (!d) return null;
                return (
                  <Balao
                    titulo={d.rotulo}
                    linhas={[
                      { cor: COR.s1, nome: d.ano ? "Focus de hoje" : "Meta Selic", valor: pct(d.valor), destaque: true },
                      ...(d.ref30 === null ? [] : [{ cor: COR_HA30, nome: "Focus há 30 dias", valor: pct(d.ref30), tracejado: true }]),
                    ]}
                    nota={d.ref30 === null ? undefined : `Mudou ${pp(d.valor - d.ref30)} em 30 dias`}
                  />
                );
              }}
            />
            {tem30 ? <Line dataKey="ref30" stroke={COR_HA30} strokeWidth={2.2} strokeDasharray="6 5" dot={false} activeDot={false} isAnimationActive={animar} connectNulls /> : null}
            <Line dataKey="valor" stroke={COR.s1} strokeWidth={3} dot={{ r: 5, fill: COR.s1, stroke: "var(--folha)", strokeWidth: 2 }} activeDot={{ r: 7, stroke: "var(--folha)", strokeWidth: 2.5 }} isAnimationActive={animar} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Quadro>
  );
}
