import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { comUnidade, dataBR, deltaComUnidade, mesAno, num, pct } from "../../../js/formato.js";
import { creditoNoTempo } from "../../../js/historico.js";
import * as modelo from "../../../js/modelo.js";
import { Balao, COR, EIXO, GRADE, Quadro, marcasDeTaxa } from "../../graficos/base";
import type { Foto } from "../../tipos";
import { Delta } from "../../ui/Delta";
import { Spark } from "../../ui/Spark";
import { Segmentado } from "../../ui/blocos";
import { Tabela } from "../../ui/Tabela";

// ------------------------------------------------------------------------------------------------ crédito por banco
type Modalidade = { data: string; n: number; bancos: { banco: string; taxa: number }[]; resumo: { menor: number; p25: number; mediana: number; p75: number; maior: number } };
type LinhaDeBanco = { modalidade: string; banco: string; taxa: number; contraMediana: number; posicao: string; rank: number };

const NOME_DA_MODALIDADE = { veiculos: "Veículos", imobiliario: "Imóveis" } as const;

function linhasDosBancos(m: Modalidade | null, nome: string): LinhaDeBanco[] {
  if (!m) return [];
  const { p25, mediana, p75 } = m.resumo;
  return [...m.bancos]
    .sort((a, b) => a.taxa - b.taxa)
    .map((b, i) => ({
      modalidade: nome,
      banco: b.banco,
      taxa: b.taxa,
      contraMediana: b.taxa - mediana,
      posicao: b.taxa <= p25 ? "Entre os 25% mais baratos" : b.taxa <= mediana ? "Abaixo da mediana" : b.taxa <= p75 ? "Acima da mediana" : "Entre os 25% mais caros",
      rank: i + 1,
    }));
}

function MedianaNoTempo({ foto, serie, titulo, subtitulo }: { foto: Foto; serie: string; titulo: string; subtitulo: string }) {
  const linhas = useMemo(() => creditoNoTempo(foto, serie) as { data: string; n: number; mediana: number; p25: number; p75: number }[], [foto, serie]);
  if (linhas.length < 2) return null;
  const todos = linhas.flatMap((l) => [l.p25, l.p75]);
  const lo = Math.floor(Math.min(...todos) - 1);
  const hi = Math.ceil(Math.max(...todos) + 1);
  const animar = !(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  return (
    <Quadro
      titulo={titulo}
      subtitulo={subtitulo}
      tabela={{ colunas: ["Início do período", "Bancos", "1º quartil", "Mediana", "3º quartil"], linhas: [...linhas].reverse().map((l) => [dataBR(l.data), l.n, num(l.p25), num(l.mediana), num(l.p75)]) }}
    >
      <div className="h-[15rem] w-full" role="img" aria-label={`${titulo}: de ${pct(linhas[0].mediana)} em ${dataBR(linhas[0].data)} a ${pct(linhas.at(-1)!.mediana)} em ${dataBR(linhas.at(-1)!.data)}.`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={linhas.map((l) => ({ ...l, miolo: [l.p25, l.p75] }))} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid {...GRADE} />
            <XAxis dataKey="data" {...EIXO} tickFormatter={(d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`} padding={{ left: 16, right: 16 }} />
            <YAxis {...EIXO} axisLine={false} width={48} domain={[lo, hi]} ticks={marcasDeTaxa(lo, hi).ticks} tickFormatter={marcasDeTaxa(lo, hi).formato} />
            <Tooltip
              cursor={{ stroke: "var(--linha-2)" }}
              content={({ active, payload }) => {
                const d = active && (payload?.[0]?.payload as any);
                if (!d) return null;
                return (
                  <Balao
                    titulo={`${dataBR(d.data)} · ${d.n} ${d.n === 1 ? "banco" : "bancos"}`}
                    linhas={[
                      { cor: COR.s1, nome: "Mediana", valor: pct(d.mediana), destaque: true },
                      { cor: COR.s1, nome: "1º quartil", valor: pct(d.p25), tracejado: true },
                      { cor: COR.s1, nome: "3º quartil", valor: pct(d.p75), tracejado: true },
                    ]}
                  />
                );
              }}
            />
            <Area dataKey="miolo" stroke="none" fill={COR.s1} fillOpacity={0.14} isAnimationActive={animar} activeDot={false} />
            <Line dataKey="mediana" stroke={COR.s1} strokeWidth={3} dot={{ r: 5, fill: COR.s1, stroke: "var(--folha)", strokeWidth: 2 }} activeDot={{ r: 7, stroke: "var(--folha)", strokeWidth: 2.5 }} isAnimationActive={animar} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Quadro>
  );
}

export function MercadoCredito({ foto }: { foto: Foto }) {
  const creditos = useMemo(() => modelo.creditos(foto) as { imobiliario: Modalidade | null; veiculos: Modalidade | null }, [foto]);
  const [qual, setQual] = useState<"todas" | "veiculos" | "imobiliario">("todas");
  const todas = useMemo(() => [...linhasDosBancos(creditos.veiculos, NOME_DA_MODALIDADE.veiculos), ...linhasDosBancos(creditos.imobiliario, NOME_DA_MODALIDADE.imobiliario)], [creditos]);
  const dados = useMemo(() => (qual === "todas" ? todas : todas.filter((l) => l.modalidade === NOME_DA_MODALIDADE[qual])), [todas, qual]);
  const colunas = useMemo<ColumnDef<LinhaDeBanco, any>[]>(
    () => [
      { accessorKey: "banco", header: "Banco", meta: { largura: "14rem", ajuda: "Instituição que informou a taxa ao Banco Central." }, cell: (c) => <span className="font-semibold text-tinta">{c.getValue()}</span> },
      { accessorKey: "modalidade", header: "Financiamento de", meta: { ajuda: "O tipo de bem financiado.", largura: "9rem" } },
      { accessorKey: "taxa", header: "Taxa", meta: { numerica: true, ajuda: "Taxa de juros do financiamento, em % ao ano." }, cell: (c) => <span className="font-bold text-tinta">{pct(c.getValue())}</span> },
      { accessorKey: "contraMediana", header: "Contra a mediana", meta: { numerica: true, ajuda: "A diferença entre a taxa do banco e a mediana de todos os bancos da mesma modalidade, em p.p.", csv: (l: LinhaDeBanco) => num(l.contraMediana) }, cell: (c) => <Delta valor={c.getValue()} tamanho="p" /> },
      { accessorKey: "posicao", header: "Posição", meta: { ajuda: "Onde a taxa fica entre os bancos da modalidade: 1º e 3º quartil dividem os bancos em quatro grupos do mesmo tamanho.", largura: "13rem" }, cell: (c) => <span className="text-tinta2">{c.getValue()}</span> },
      { accessorKey: "rank", header: "Ordem", meta: { numerica: true, ajuda: "1 é a taxa mais baixa da modalidade." } },
    ],
    [],
  );
  const extras = (
    <Segmentado
      valor={qual}
      aoMudar={setQual}
      rotulo="Modalidade"
      opcoes={[{ id: "todas", nome: "Todas" }, ...(creditos.veiculos ? [{ id: "veiculos" as const, nome: "Veículos" }] : []), ...(creditos.imobiliario ? [{ id: "imobiliario" as const, nome: "Imóveis" }] : [])]}
    />
  );
  return (
    <div className="grid grid-cols-1 gap-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <MedianaNoTempo foto={foto} serie="taxa_financiamento_veiculos" titulo="Financiamento de veículos: mediana de cada janela semanal" subtitulo="Cada ponto é uma janela de 7 dias do Banco Central (a data é o início). Linha: mediana dos bancos; faixa: do 1º ao 3º quartil. % ao ano." />
        <MedianaNoTempo foto={foto} serie="taxa_financiamento_imobiliario" titulo="Financiamento imobiliário: mediana mês a mês" subtitulo="Linha: mediana dos bancos de cada mês; faixa: do 1º ao 3º quartil. % ao ano." />
      </div>
      <div>
        <h3 className="rotulo m-0 mb-2 font-sans">
          Taxa de cada banco · veículos (janela de 7 dias a partir de {creditos.veiculos ? dataBR(creditos.veiculos.data) : "—"}), imóveis em {creditos.imobiliario ? mesAno(creditos.imobiliario.data) : "—"}
        </h3>
        <Tabela dados={dados} colunas={colunas} legenda="Taxas de financiamento por banco" busca="Buscar banco" extras={extras} nomeDoArquivo={`radar-pricing-credito-${foto.data}`} ordemInicial={[{ id: "taxa", desc: false }]} idDaLinha={(l) => `${l.modalidade}|${l.banco}`} altura="32rem" />
        <p className="m-0 mt-2 text-xs text-tinta3">Fonte: Banco Central, taxas de juros por instituição. O imobiliário é mensal e tem poucos bancos; o de veículos é publicado toda semana, em janelas de 7 dias.</p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ setor
type LinhaPanorama = { serie: string; grupo: string; descricao: string; unidade: string; data: string; valor: number; data_anterior: string; anterior: number; delta: number };

export function MercadoSetor({ foto }: { foto: Foto }) {
  const todas = useMemo(() => (foto.derivados.setor ?? []) as LinhaPanorama[], [foto]);
  const grupos = useMemo(() => [...new Set(todas.map((l) => l.grupo))], [todas]);
  const [grupo, setGrupo] = useState("");
  const dados = useMemo(() => (grupo ? todas.filter((l) => l.grupo === grupo) : todas), [todas, grupo]);
  const abac = useMemo(() => modelo.abac(foto) as { serie: string; rotulo: string; unidade: string; pontos: { data: string; valor: number }[]; ultimo: { data: string; valor: number }; delta: number | null }[], [foto]);
  const colunas = useMemo<ColumnDef<LinhaPanorama, any>[]>(
    () => [
      { accessorKey: "grupo", header: "Grupo", meta: { largura: "11rem", ajuda: "Como o Banco Central agrupa as métricas do Panorama de Consórcios." }, cell: (c) => <span className="font-semibold text-tinta">{c.getValue()}</span> },
      { accessorKey: "descricao", header: "Métrica", meta: { largura: "26rem", ajuda: "O que está sendo medido, com o recorte (total, imóveis, veículos...)." }, cell: (c) => <span className="text-tinta2">{c.getValue()}</span> },
      { accessorKey: "valor", header: "Último trimestre", meta: { numerica: true, ajuda: "Valor no fim do trimestre mais recente.", csv: (l: LinhaPanorama) => comUnidade(l.valor, l.unidade) }, cell: (c) => <span className="font-bold text-tinta">{comUnidade(c.getValue(), c.row.original.unidade)}</span> },
      { accessorKey: "anterior", header: "Anterior", meta: { numerica: true, ajuda: "Valor no fim do trimestre anterior.", csv: (l: LinhaPanorama) => comUnidade(l.anterior, l.unidade) }, cell: (c) => <span className="text-tinta3">{comUnidade(c.getValue(), c.row.original.unidade)}</span> },
      { accessorKey: "delta", header: "Variação", meta: { numerica: true, ajuda: "A diferença entre os dois trimestres, na unidade da métrica (p.p. quando a métrica é um percentual).", csv: (l: LinhaPanorama) => deltaComUnidade(l.delta, l.unidade) }, cell: (c) => <Delta valor={c.getValue()} texto={deltaComUnidade(c.getValue(), c.row.original.unidade)} tamanho="p" /> },
      { id: "pct", header: "Variação %", accessorFn: (l) => (l.anterior ? ((l.valor - l.anterior) / Math.abs(l.anterior)) * 100 : null), sortUndefined: "last", meta: { numerica: true, ajuda: "A variação em relação ao valor anterior, em %.", csv: (l: LinhaPanorama) => (l.anterior ? num(((l.valor - l.anterior) / Math.abs(l.anterior)) * 100) : "") }, cell: (c) => (c.getValue() === null ? <span className="text-tinta3">—</span> : <span className="text-tinta2">{num(c.getValue(), 1)}%</span>) },
    ],
    [],
  );
  const colunasAbac = useMemo<ColumnDef<(typeof abac)[number], any>[]>(
    () => [
      { accessorKey: "rotulo", header: "Indicador", meta: { largura: "16rem", ajuda: "Números acumulados do ano, da Associação Brasileira de Administradoras de Consórcios (ABAC)." }, cell: (c) => <span className="font-semibold text-tinta">{c.getValue()}</span> },
      { id: "valor", header: "Último valor", accessorFn: (l) => l.ultimo.valor, meta: { numerica: true, csv: (l) => `${num(l.ultimo.valor)} ${l.unidade}` }, cell: (c) => <span className="font-bold text-tinta">{num(c.getValue(), c.getValue() % 1 === 0 ? 0 : 2)} <span className="font-normal text-tinta3">{c.row.original.unidade}</span></span> },
      { id: "mes", header: "Até", accessorFn: (l) => l.ultimo.data, meta: { ajuda: "O mês em que o acumulado termina." }, cell: (c) => <span className="num">{mesAno(c.getValue())}</span> },
      { accessorKey: "delta", header: "No mês", meta: { numerica: true, ajuda: "O que foi somado em relação ao mês anterior, na mesma unidade.", csv: (l) => (l.delta === null ? "" : num(l.delta)) }, sortUndefined: "last", cell: (c) => <Delta valor={c.getValue()} tipo="num" casas={2} tamanho="p" /> },
      { id: "forma", header: "Evolução", enableSorting: false, accessorFn: () => "", meta: { largura: "7rem", csv: () => "" }, cell: (c) => <Spark valores={c.row.original.pontos.map((p) => p.valor)} largura={72} altura={28} /> },
    ],
    [],
  );
  const extras = (
    <label className="flex items-center gap-1.5 text-xs font-semibold text-tinta2">
      <span className="sr-only sm:not-sr-only">Grupo</span>
      <select value={grupo} onChange={(e) => setGrupo(e.target.value)} className="max-w-[14rem] rounded-lg border border-linha bg-folha2 px-2 py-1.5 text-sm font-normal text-tinta outline-none focus:border-marca">
        <option value="">Todos os grupos</option>
        {grupos.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="grid grid-cols-1 gap-5">
      <div>
        <h3 className="rotulo m-0 mb-2 font-sans">Panorama de Consórcios · Banco Central, {todas[0] ? `${mesAno(todas[0].data_anterior)} contra ${mesAno(todas[0].data)}` : ""}</h3>
        <Tabela dados={dados} colunas={colunas} legenda="Métricas do Panorama de Consórcios do Banco Central" busca="Buscar métrica (ex.: inadimplência, imóveis)" extras={extras} nomeDoArquivo={`radar-pricing-panorama-${foto.data}`} ordemInicial={[]} idDaLinha={(l) => l.serie} altura="34rem" vazio="Nenhuma métrica nesse grupo." />
        <p className="m-0 mt-2 text-xs text-tinta3">As quantidades de cotas estão em milhares (mil); os valores, nas unidades da coluna. A variação em p.p. vale para métricas que são percentuais.</p>
      </div>
      <div>
        <h3 className="rotulo m-0 mb-2 font-sans">Volume de vendas no ano · ABAC</h3>
        <Tabela dados={abac} colunas={colunasAbac} legenda="Indicadores da ABAC" nomeDoArquivo={`radar-pricing-abac-${foto.data}`} idDaLinha={(l) => l.serie} altura="22rem" />
        <p className="m-0 mt-2 text-xs text-tinta3">Os números de cada mês são acumulados do ano até aquele mês; "No mês" é o que foi somado em relação ao mês anterior.</p>
      </div>
    </div>
  );
}
