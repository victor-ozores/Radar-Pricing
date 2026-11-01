import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { dataBR, num, pct } from "../../../js/formato.js";
import { dataAteO, titulosDoTesouro } from "../../../js/historico.js";
import { somaDias } from "../../../js/foto.js";
import { entradaDeVariacao, variacaoDe } from "../../../js/modelo.js";
import { Balao, EIXO, GRADE, Quadro } from "../../graficos/base";
import type { Foto } from "../../tipos";
import { Delta } from "../../ui/Delta";
import { Spark } from "../../ui/Spark";
import { Segmentado } from "../../ui/blocos";
import { Tabela } from "../../ui/Tabela";

type Titulo = { chave: string; titulo: string; vencimento: string; ano: number; pontos: { data: string; valor: number }[] };

/** Do mais claro (vencimento mais curto) ao mais escuro (mais longo): o prazo vira a cor, sem inventar uma cor por linha. */
const corDoPrazo = (i: number, n: number) => `color-mix(in srgb, var(--s1) ${n < 2 ? 100 : Math.round(38 + (62 * i) / (n - 1))}%, var(--folha))`;

function EvolucaoDoTesouro({ titulos }: { titulos: Titulo[] }) {
  const nomes = [...new Set(titulos.map((t) => t.titulo))].filter((t) => t !== "Tesouro Selic");
  const [titulo, setTitulo] = useState(nomes[0] ?? "");
  const [janela, setJanela] = useState<"7" | "30" | "tudo">("tudo");
  const doTitulo = useMemo(() => titulos.filter((t) => t.titulo === titulo), [titulos, titulo]);
  const linhas = useMemo(() => {
    const datas = [...new Set(doTitulo.flatMap((t) => t.pontos.map((p) => p.data)))].sort();
    const fim = datas.at(-1);
    const corte = fim && janela !== "tudo" ? dataAteO(datas, somaDias(fim, -Number(janela))) : datas[0];
    return datas
      .filter((d) => !corte || d >= corte)
      .map((data) => ({ data, ...Object.fromEntries(doTitulo.map((t) => [t.chave, t.pontos.find((p) => p.data === data)?.valor ?? null])) }));
  }, [doTitulo, janela]);
  if (!doTitulo.length || linhas.length < 2) return null;
  const valores = linhas.flatMap((l) => doTitulo.map((t) => (l as Record<string, any>)[t.chave]).filter((v) => typeof v === "number")) as number[];
  const lo = Math.floor(Math.min(...valores) - 0.25);
  const hi = Math.ceil(Math.max(...valores) + 0.25);
  const animar = !(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  return (
    <Quadro
      titulo={`Como a taxa de cada vencimento do ${titulo} andou`}
      subtitulo="% ao ano, taxa de compra de cada dia. Cada linha é um vencimento; quanto mais forte a cor, mais longo o prazo."
      legenda={doTitulo.map((t, i) => ({ cor: corDoPrazo(i, doTitulo.length), nome: `Vence em ${t.ano}` }))}
      acoes={
        <div className="flex flex-wrap gap-2">
          <Segmentado valor={titulo} aoMudar={setTitulo} rotulo="Título" opcoes={nomes.map((n) => ({ id: n, nome: n.replace("Tesouro ", "") }))} />
          <Segmentado valor={janela} aoMudar={setJanela} rotulo="Período" opcoes={[{ id: "7", nome: "7 dias" }, { id: "30", nome: "30 dias" }, { id: "tudo", nome: "Tudo" }]} />
        </div>
      }
      tabela={{
        colunas: ["Data", ...doTitulo.map((t) => `Venc. ${t.ano} (% a.a.)`)],
        linhas: [...linhas].reverse().map((l) => [dataBR(l.data), ...doTitulo.map((t) => { const v = (l as Record<string, any>)[t.chave]; return typeof v === "number" ? num(v) : "—"; })]),
      }}
    >
      <div className="h-[22rem] w-full" role="img" aria-label={`Evolução da taxa dos vencimentos do ${titulo} entre ${dataBR(linhas[0].data)} e ${dataBR(linhas.at(-1)!.data)}. Os valores estão na tabela abaixo.`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={linhas} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid {...GRADE} />
            <XAxis dataKey="data" {...EIXO} minTickGap={40} tickFormatter={(d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`} />
            <YAxis {...EIXO} axisLine={false} width={48} domain={[lo, hi]} tickFormatter={(v: number) => `${num(v, 0)}%`} />
            <Tooltip
              cursor={{ stroke: "var(--linha-2)" }}
              content={({ active, payload }) => {
                const d = active && (payload?.[0]?.payload as Record<string, any> | undefined);
                if (!d) return null;
                return (
                  <Balao
                    titulo={dataBR(d.data)}
                    linhas={[...doTitulo].reverse().map((t) => ({ cor: corDoPrazo(doTitulo.indexOf(t), doTitulo.length), nome: `Vencimento ${t.ano}`, valor: typeof d[t.chave] === "number" ? pct(d[t.chave]) : "—" }))}
                    nota={`Primeiro dia do gráfico: ${dataBR(linhas[0].data)}`}
                  />
                );
              }}
            />
            {doTitulo.map((t, i) => (
              <Line
                key={t.chave}
                dataKey={t.chave}
                stroke={corDoPrazo(i, doTitulo.length)}
                strokeWidth={2.4}
                dot={false}
                activeDot={{ r: 5, stroke: "var(--folha)", strokeWidth: 2 }}
                isAnimationActive={animar}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Quadro>
  );
}

type Linha = { chave: string; titulo: string; vencimento: string; taxa: number; d1: number | null; d7: number | null; d30: number | null; serie: number[]; minimo: number; maximo: number };

export function MercadoTesouro({ foto }: { foto: Foto }) {
  const titulos = useMemo(() => titulosDoTesouro(foto) as Titulo[], [foto]);
  const dados = useMemo<Linha[]>(
    () =>
      titulos.map((t) => {
        const e = entradaDeVariacao(foto, "tesouro", "tesouro_taxa_compra", t.chave);
        const serie = t.pontos.map((p) => p.valor);
        return {
          chave: t.chave,
          titulo: t.titulo,
          vencimento: t.vencimento,
          taxa: t.pontos.at(-1)!.valor,
          d1: variacaoDe(e, 1)?.delta ?? null,
          d7: variacaoDe(e, 7)?.delta ?? null,
          d30: variacaoDe(e, 30)?.delta ?? null,
          serie,
          minimo: Math.min(...serie),
          maximo: Math.max(...serie),
        };
      }),
    [foto, titulos],
  );
  const colunas = useMemo<ColumnDef<Linha, any>[]>(
    () => [
      { accessorKey: "titulo", header: "Título", meta: { ajuda: "O tipo de título público: Prefixado (taxa fixa), IPCA+ (inflação mais taxa fixa) ou Selic (acompanha a Selic).", largura: "10rem" }, cell: (c) => <span className="font-semibold text-tinta">{c.getValue()}</span> },
      { accessorKey: "vencimento", header: "Vencimento", meta: { ajuda: "Quando o governo devolve o dinheiro. É o prazo da taxa.", largura: "7.5rem" }, cell: (c) => <span className="num">{dataBR(c.getValue())}</span> },
      { accessorKey: "taxa", header: "Taxa hoje", meta: { numerica: true, ajuda: "Taxa de compra do último dia da foto, em % ao ano." }, cell: (c) => <span className="font-bold text-tinta">{pct(c.getValue())}</span> },
      { accessorKey: "d1", header: "1 dia", meta: { numerica: true, ajuda: "Quanto a taxa mudou desde o dia útil anterior, em pontos percentuais.", csv: (l: Linha) => (l.d1 === null ? "" : l.d1) }, sortUndefined: "last", cell: (c) => <Delta valor={c.getValue()} tamanho="p" /> },
      { accessorKey: "d7", header: "7 dias", meta: { numerica: true, ajuda: "Quanto a taxa mudou em 7 dias, em pontos percentuais.", csv: (l: Linha) => (l.d7 === null ? "" : l.d7) }, sortUndefined: "last", cell: (c) => <Delta valor={c.getValue()} tamanho="p" /> },
      { accessorKey: "d30", header: "30 dias", meta: { numerica: true, ajuda: "Quanto a taxa mudou em 30 dias, em pontos percentuais.", csv: (l: Linha) => (l.d30 === null ? "" : l.d30) }, sortUndefined: "last", cell: (c) => <Delta valor={c.getValue()} tamanho="p" /> },
      { id: "faixa", header: "Mín – máx", accessorFn: (l) => l.maximo - l.minimo, meta: { numerica: true, ajuda: "A menor e a maior taxa do período que a foto guarda (cerca de 5 semanas).", csv: (l: Linha) => `${num(l.minimo)} a ${num(l.maximo)}` }, cell: (c) => <span className="text-tinta2">{num(c.row.original.minimo)} – {num(c.row.original.maximo)}</span> },
      { id: "forma", header: "Evolução", enableSorting: false, accessorFn: () => "", meta: { ajuda: "A forma da taxa nos dias que a foto guarda.", largura: "7rem", csv: () => "" }, cell: (c) => <Spark valores={c.row.original.serie} largura={84} altura={28} cor="var(--s1)" rotulo={`${c.row.original.titulo} ${c.row.original.vencimento.slice(0, 4)}: de ${num(c.row.original.serie[0])} a ${num(c.row.original.serie.at(-1)!)}`} /> },
    ],
    [],
  );
  const datas = titulos[0]?.pontos ?? [];
  return (
    <div className="grid grid-cols-1 gap-5">
      <EvolucaoDoTesouro titulos={titulos} />
      <div>
        <h3 className="rotulo m-0 mb-2 font-sans">Todos os títulos · taxa de compra, {datas.length ? `de ${dataBR(datas[0].data)} a ${dataBR(datas.at(-1)!.data)}` : ""}</h3>
        <Tabela dados={dados} colunas={colunas} legenda="Taxas dos títulos do Tesouro por vencimento, com variação em 1, 7 e 30 dias" busca="Buscar título ou ano (ex.: IPCA, 2032)" nomeDoArquivo={`radar-pricing-tesouro-${foto.data}`} ordemInicial={[{ id: "titulo", desc: false }]} idDaLinha={(l) => l.chave} altura="30rem" />
        <p className="m-0 mt-2 text-xs text-tinta3">
          Fonte: Tesouro Direto (Tesouro Nacional), taxa de compra. As mudanças são em pontos percentuais. No Tesouro Selic a taxa é o spread sobre a Selic (por isso é pequena e fica fora do gráfico).
        </p>
      </div>
    </div>
  );
}
