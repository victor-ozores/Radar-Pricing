import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { comUnidade, dataBR, deltaComUnidade, mesAno, num, pct } from "../../../js/formato.js";
import { focusNoTempo, serieDe } from "../../../js/historico.js";
import * as modelo from "../../../js/modelo.js";
import { Balao, COR, EIXO, GRADE, Quadro } from "../../graficos/base";
import type { Foto } from "../../tipos";
import { Delta } from "../../ui/Delta";
import { Spark } from "../../ui/Spark";
import { Tabela } from "../../ui/Tabela";

type Serie = { serie: string; rotulo: string; mensal: boolean; valor: number; unidade: string; data: string; d1: { delta: number } | null; d7: { delta: number } | null; d30: { delta: number } | null; historico: number[] };

const CORES_FOCUS = [COR.s1, COR.s2, COR.s3, COR.s4];

function EvolucaoDoFocus({ foto, serie, titulo, subtitulo }: { foto: Foto; serie: string; titulo: string; subtitulo: string }) {
  const { anos, linhas } = useMemo(() => focusNoTempo(foto, serie) as { anos: number[]; linhas: Record<string, number | string>[] }, [foto, serie]);
  if (linhas.length < 2) return null;
  const valores = linhas.flatMap((l) => anos.map((a) => l[a]).filter((v): v is number => typeof v === "number"));
  const lo = Math.floor(Math.min(...valores) * 2 - 0.5) / 2;
  const hi = Math.ceil(Math.max(...valores) * 2 + 0.5) / 2;
  const animar = !(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  return (
    <Quadro
      titulo={titulo}
      subtitulo={subtitulo}
      legenda={anos.map((a, i) => ({ cor: CORES_FOCUS[i % 4], nome: `Fim de ${a}` }))}
      tabela={{ colunas: ["Data da pesquisa", ...anos.map((a) => `Fim de ${a} (% a.a.)`)], linhas: [...linhas].reverse().map((l) => [dataBR(l.data as string), ...anos.map((a) => (typeof l[a] === "number" ? num(l[a] as number) : "—"))]) }}
    >
      <div className="h-[18rem] w-full" role="img" aria-label={`${titulo}: ${anos.map((a) => `${a}: de ${num(linhas.find((l) => typeof l[a] === "number")![a] as number)} a ${num([...linhas].reverse().find((l) => typeof l[a] === "number")![a] as number)}`).join("; ")}.`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={linhas} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid {...GRADE} />
            <XAxis dataKey="data" {...EIXO} minTickGap={36} tickFormatter={(d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`} />
            <YAxis {...EIXO} axisLine={false} width={48} domain={[lo, hi]} tickFormatter={(v: number) => `${num(v, 1)}%`} />
            <Tooltip
              cursor={{ stroke: "var(--linha-2)" }}
              content={({ active, payload }) => {
                const d = active && (payload?.[0]?.payload as Record<string, any> | undefined);
                if (!d) return null;
                return <Balao titulo={`Focus de ${dataBR(d.data)}`} linhas={anos.filter((a) => typeof d[a] === "number").map((a, i) => ({ cor: CORES_FOCUS[i % 4], nome: `Fim de ${a}`, valor: pct(d[a]) }))} />;
              }}
            />
            {anos.map((a, i) => (
              <Line key={a} dataKey={String(a)} stroke={CORES_FOCUS[i % 4]} strokeWidth={2.6} dot={false} activeDot={{ r: 5, stroke: "var(--folha)", strokeWidth: 2 }} isAnimationActive={animar} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Quadro>
  );
}

function SelicPorReuniao({ reunioes, data }: { reunioes: { reuniao: string; valor: number }[]; data: string | null }) {
  if (reunioes.length < 2) return null;
  const valores = reunioes.map((r) => r.valor);
  const lo = Math.floor(Math.min(...valores) * 2 - 0.5) / 2;
  const hi = Math.ceil(Math.max(...valores) * 2 + 0.5) / 2;
  const animar = !(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  return (
    <Quadro
      titulo="A Selic esperada ao fim de cada reunião do Copom"
      subtitulo={`Mediana das projeções do Boletim Focus${data ? ` de ${dataBR(data)}` : ""}. R1/2027 é a 1ª reunião de 2027.`}
      tabela={{ colunas: ["Reunião", "Selic esperada (% a.a.)"], linhas: reunioes.map((r) => [r.reuniao, num(r.valor)]) }}
    >
      <div className="h-[16rem] w-full" role="img" aria-label={`Selic esperada por reunião: de ${pct(reunioes[0].valor)} em ${reunioes[0].reuniao} a ${pct(reunioes.at(-1)!.valor)} em ${reunioes.at(-1)!.reuniao}.`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={reunioes} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid {...GRADE} />
            <XAxis dataKey="reuniao" {...EIXO} interval="preserveStartEnd" minTickGap={20} />
            <YAxis {...EIXO} axisLine={false} width={48} domain={[lo, hi]} tickFormatter={(v: number) => `${num(v, 1)}%`} />
            <Tooltip cursor={{ stroke: "var(--linha-2)" }} content={({ active, payload }) => (active && payload?.[0] ? <Balao titulo={`Reunião ${(payload[0].payload as any).reuniao}`} linhas={[{ cor: COR.s1, nome: "Selic esperada", valor: pct((payload[0].payload as any).valor), destaque: true }]} /> : null)} />
            <Line dataKey="valor" type="stepAfter" stroke={COR.s1} strokeWidth={3} dot={{ r: 4, fill: COR.s1, stroke: "var(--folha)", strokeWidth: 2 }} activeDot={{ r: 6, stroke: "var(--folha)", strokeWidth: 2 }} isAnimationActive={animar} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Quadro>
  );
}

export function MercadoJuros({ foto }: { foto: Foto }) {
  const series = useMemo<Serie[]>(() => (modelo.seriesDoBanco(foto) as Omit<Serie, "historico">[]).map((s) => ({ ...s, historico: (serieDe(foto, "bcb_sgs", s.serie) as { valor: number }[]).map((p) => p.valor) })), [foto]);
  const foco = useMemo(() => modelo.focus(foto) as { selic: any[]; ipca: any[]; data: string | null; reunioes: { reuniao: string; valor: number }[] }, [foto]);
  const colunasSeries = useMemo<ColumnDef<Serie, any>[]>(
    () => [
      { accessorKey: "rotulo", header: "Série", meta: { largura: "13rem", ajuda: "Indicador do Banco Central (SGS)." }, cell: (c) => <span className="font-semibold text-tinta">{c.getValue()}</span> },
      { accessorKey: "valor", header: "Último valor", meta: { numerica: true, ajuda: "O valor mais recente, na unidade da série.", csv: (l: Serie) => comUnidade(l.valor, l.unidade) }, cell: (c) => <span className="font-bold text-tinta">{comUnidade(c.row.original.valor, c.row.original.unidade)}</span> },
      { accessorKey: "data", header: "Data", meta: { ajuda: "O dia (ou mês) a que o valor se refere." }, cell: (c) => <span className="num">{c.row.original.mensal ? mesAno(c.getValue()) : dataBR(c.getValue())}</span> },
      ...(["d1", "d7", "d30"] as const).map<ColumnDef<Serie, any>>((k) => ({
        id: k,
        header: k === "d1" ? "1 dia" : k === "d7" ? "7 dias" : "30 dias",
        accessorFn: (l) => l[k]?.delta ?? null,
        sortUndefined: "last",
        meta: { numerica: true, ajuda: "Mudança desde então, na unidade da série (em p.p. quando a série é uma taxa).", csv: (l: Serie) => (l[k] ? deltaComUnidade(l[k]!.delta, l.unidade) : "") },
        cell: (c) => <Delta valor={c.getValue()} texto={c.getValue() === null ? undefined : deltaComUnidade(c.getValue(), c.row.original.unidade)} tamanho="p" />,
      })),
      { id: "forma", header: "Evolução", enableSorting: false, accessorFn: () => "", meta: { largura: "7rem", ajuda: "A forma da série no período que a foto guarda.", csv: () => "" }, cell: (c) => <Spark valores={c.row.original.historico} largura={84} altura={28} rotulo={`${c.row.original.rotulo}: ${c.row.original.historico.length} valores`} /> },
    ],
    [],
  );
  const colunasFocus = useMemo<ColumnDef<any, any>[]>(
    () => [
      { accessorKey: "tipo", header: "Expectativa", meta: { largura: "10rem" }, cell: (c) => <span className="font-semibold text-tinta">{c.getValue()}</span> },
      { accessorKey: "ano", header: "Fim de", meta: { numerica: true, ajuda: "O ano a que a projeção se refere." } },
      { accessorKey: "valor", header: "Hoje", meta: { numerica: true, ajuda: "Mediana das projeções de bancos e consultorias, em % ao ano." }, cell: (c) => <span className="font-bold text-tinta">{pct(c.getValue())}</span> },
      { accessorKey: "d7", header: "7 dias", meta: { numerica: true, ajuda: "Quanto a projeção mudou em 7 dias, em p.p." }, sortUndefined: "last", cell: (c) => <Delta valor={c.getValue()} tamanho="p" /> },
      { accessorKey: "d30", header: "30 dias", meta: { numerica: true, ajuda: "Quanto a projeção mudou em 30 dias, em p.p." }, sortUndefined: "last", cell: (c) => <Delta valor={c.getValue()} tamanho="p" /> },
    ],
    [],
  );
  const dadosFocus = useMemo(
    () => [
      ...foco.selic.map((s) => ({ tipo: "Selic", ano: s.ano, valor: s.valor, d7: s.d7?.delta ?? null, d30: s.d30?.delta ?? null })),
      ...foco.ipca.map((s) => ({ tipo: "IPCA", ano: s.ano, valor: s.valor, d7: s.d7?.delta ?? null, d30: s.d30?.delta ?? null })),
    ],
    [foco],
  );
  return (
    <div className="grid grid-cols-1 gap-5">
      <div>
        <h3 className="rotulo m-0 mb-2 font-sans">Selic, CDI e inflação · Banco Central (SGS)</h3>
        <Tabela dados={series} colunas={colunasSeries} legenda="Séries do Banco Central: Selic, CDI e IPCA" nomeDoArquivo={`radar-pricing-selic-ipca-${foto.data}`} idDaLinha={(l) => l.serie} altura="22rem" />
        <p className="m-0 mt-2 text-xs text-tinta3">A meta Selic traz datas à frente de hoje (decisões já anunciadas); o painel usa só o valor de hoje. CDI e Selic over são taxas ao dia.</p>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <EvolucaoDoFocus foto={foto} serie="focus_selic_anual" titulo="Como a Selic esperada mudou, dia a dia" subtitulo="Projeção do Focus para o fim de cada ano, a cada dia útil. % ao ano." />
        <EvolucaoDoFocus foto={foto} serie="focus_ipca_anual" titulo="Como o IPCA esperado mudou, dia a dia" subtitulo="Projeção do Focus para o IPCA de cada ano, a cada dia útil. % ao ano." />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.1fr_1fr]">
        <SelicPorReuniao reunioes={foco.reunioes} data={foco.data} />
        <div>
          <h3 className="rotulo m-0 mb-2 font-sans">Boletim Focus · o que o mercado espera</h3>
          <Tabela dados={dadosFocus} colunas={colunasFocus} legenda="Expectativas do Boletim Focus para Selic e IPCA" nomeDoArquivo={`radar-pricing-focus-${foto.data}`} ordemInicial={[{ id: "tipo", desc: false }, { id: "ano", desc: false }]} altura="22rem" />
          <p className="m-0 mt-2 text-xs text-tinta3">Fonte: Banco Central (Focus). As mudanças são em pontos percentuais (p.p.).</p>
        </div>
      </div>
    </div>
  );
}
