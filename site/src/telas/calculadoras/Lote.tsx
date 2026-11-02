import type { ColumnDef } from "@tanstack/react-table";
import { useId, useMemo } from "react";
import { COLUNAS_DO_LOTE, EXEMPLO_DE_LOTE, MAX_LINHAS, TIPOS_DE_LOTE, calculaLote } from "../../../js/lote.js";
import { dataBR, num, pct, reais } from "../../../js/formato.js";
import { notaDoSpread, usePersistido } from "../../calc/memoria";
import { useEstado } from "../../dados";
import { Segmentado } from "../../ui/blocos";
import { Tabela } from "../../ui/Tabela";
import { CircleCheck, CircleX, TriangleAlert } from "lucide-react";
import { AcoesDaConta, BarraDoResultado, Moldura, Nota, comSinalReais, tituloDaSituacao, type Situacao } from "./pecas";

type Tipo = "cancelada" | "ativa";

/** Os nomes curtos das colunas, para a linha de ajuda que fica sempre à vista (os longos ficam em "Como preencher"). */
const CURTAS: Record<Tipo, string[]> = {
  cancelada: ["valor a devolver", "meses", "correção", "preço pedido", "custos"],
  ativa: ["crédito", "parcela", "parcelas que faltam", "contemplação (meses)", "preço pedido", "custos"],
};

const EXEMPLO = { tipo: "cancelada" as string, textoCancelada: EXEMPLO_DE_LOTE.cancelada, textoAtiva: EXEMPLO_DE_LOTE.ativa };

/** Uma linha da tabela: os números já calculados (ou o erro) de uma cota da lista. */
type Linha = {
  n: number;
  erro: string | null;
  a: number | null; // valor a devolver / crédito
  b: number | null; // prazo / parcela
  c: string | number | null; // correção / parcelas
  d: number | null; // contemplação (só ativa)
  valeHoje: number | null;
  pctDoValor: number | null;
  preco: number | null;
  cabe: boolean | null;
  situacao: Situacao | null;
  lucro: number | null;
  folga: number | null;
  precoMaximo: number | null;
  agioCredito: number | null;
  agioSaldo: number | null;
  estimativa: boolean;
};

const virgula = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v).replace(".", ","));
const traco = <span className="text-tinta3">—</span>;
const dinheiro = (v: number | null) => (v === null ? traco : <span className="num">{reais(v)}</span>);

export function Lote() {
  const { curvas, spread, foto, parametros } = useEstado();
  const [e, muda, volta] = usePersistido("lote", EXEMPLO);
  const tipo: Tipo = e.tipo === "ativa" ? "ativa" : "cancelada";
  const texto = tipo === "ativa" ? e.textoAtiva : e.textoCancelada;
  const idDoTexto = useId();

  const lote = useMemo(() => calculaLote(texto, tipo, { curvas, spreadPP: spread }), [texto, tipo, curvas, spread]);
  const linhas = useMemo<Linha[]>(
    () =>
      lote.linhas.map((l: any) => {
        const en = l.entrada ?? {};
        return {
          n: l.n,
          erro: l.erro ?? null,
          a: tipo === "ativa" ? (en.credito ?? null) : (en.valor ?? null),
          b: tipo === "ativa" ? (en.parcela ?? null) : (en.meses ?? null),
          c: tipo === "ativa" ? (en.parcelas ?? null) : (en.correcao ?? null),
          d: tipo === "ativa" ? (en.contemplacao ?? null) : null,
          valeHoje: l.vale_hoje ?? null,
          pctDoValor: l.pct_do_valor ?? null,
          preco: en.preco ?? null,
          cabe: l.cabe ?? null,
          situacao: (l.situacao ?? null) as Situacao | null,
          lucro: l.lucro ?? null,
          folga: l.folga ?? null,
          precoMaximo: l.preco_maximo ?? null,
          agioCredito: l.agio_credito_pct ?? null,
          agioSaldo: l.agio_saldo_pct ?? null,
          estimativa: Boolean(l.extrapolado),
        };
      }),
    [lote, tipo],
  );

  const colunas = useMemo<ColumnDef<Linha, any>[]>(() => {
    const comum: ColumnDef<Linha, any>[] = [
      { accessorKey: "n", header: "Linha", meta: { numerica: true, ajuda: "O número da linha na lista que você colou." }, cell: (c) => <span className="num">{c.getValue()}</span> },
    ];
    const entradas: ColumnDef<Linha, any>[] =
      tipo === "ativa"
        ? [
            { accessorKey: "a", header: "Crédito", meta: { numerica: true, csv: (l: Linha) => virgula(l.a) }, cell: (c) => dinheiro(c.getValue()) },
            { accessorKey: "b", header: "Parcela", meta: { numerica: true, csv: (l: Linha) => virgula(l.b) }, cell: (c) => dinheiro(c.getValue()) },
            { accessorKey: "c", header: "Parcelas", meta: { numerica: true }, cell: (c) => (c.getValue() === null ? traco : <span className="num">{c.getValue()}</span>) },
            { accessorKey: "d", header: "Contemplação", meta: { numerica: true, ajuda: "Em quantos meses a carta é contemplada (0 = já contemplada)." }, cell: (c) => (c.getValue() === null ? traco : <span className="num">{c.getValue()} m</span>) },
          ]
        : [
            { accessorKey: "a", header: "Valor a devolver", meta: { numerica: true, csv: (l: Linha) => virgula(l.a) }, cell: (c) => dinheiro(c.getValue()) },
            { accessorKey: "b", header: "Prazo", meta: { numerica: true, ajuda: "Meses até a administradora devolver." }, cell: (c) => (c.getValue() === null ? traco : <span className="num">{c.getValue()} m</span>) },
            { accessorKey: "c", header: "Correção", meta: { ajuda: "Como o valor é corrigido até a data: IPCA, sem correção ou a taxa que você informou." }, cell: (c) => c.getValue() ?? traco },
          ];
    const resultado: ColumnDef<Linha, any>[] = [
      { accessorKey: "preco", header: "Preço pedido", meta: { numerica: true, csv: (l: Linha) => virgula(l.preco) }, sortUndefined: "last", cell: (c) => dinheiro(c.getValue()) },
      {
        accessorKey: "situacao",
        header: "Veredito",
        meta: { ajuda: "Compensa: o preço está abaixo do máximo para o retorno exigido, com folga de 5% ou mais. No limite: sobra menos que isso. Não compensa: o preço passa do máximo.", csv: (l: Linha) => (l.situacao ? tituloDaSituacao(l.situacao) : "") },
        cell: (c) => {
          const s = c.getValue() as Situacao | null;
          if (!s) return traco;
          const Icone = s === "bom" ? CircleCheck : s === "limite" ? TriangleAlert : CircleX;
          const cor = s === "bom" ? "text-ok" : s === "limite" ? "text-aviso" : "text-erro";
          return (
            <span className={`inline-flex items-center gap-1 whitespace-nowrap font-semibold ${cor}`}>
              <Icone size={15} aria-hidden /> {tituloDaSituacao(s)}
            </span>
          );
        },
      },
      { accessorKey: "lucro", header: "Lucro no fim", meta: { numerica: true, ajuda: "O que entra menos tudo o que sai do bolso (preço, custos e, na cota ativa, as parcelas), sem descontar nada.", csv: (l: Linha) => virgula(l.lucro) }, sortUndefined: "last", cell: (c) => (c.getValue() === null ? traco : <span className={`num font-semibold ${c.getValue() >= 0 ? "text-ok" : "text-erro"}`}>{comSinalReais(c.getValue())}</span>) },
      { accessorKey: "valeHoje", header: tipo === "ativa" ? "Vale a cota" : "Vale hoje", meta: { numerica: true, ajuda: "O valor de hoje, com o spread do painel.", csv: (l: Linha) => virgula(l.valeHoje) }, sortUndefined: "last", cell: (c) => (c.getValue() === null ? traco : <span className="num font-bold text-tinta">{reais(c.getValue())}</span>) },
      { accessorKey: "pctDoValor", header: tipo === "ativa" ? "% do crédito" : "% do valor", meta: { numerica: true, csv: (l: Linha) => virgula(l.pctDoValor) }, sortUndefined: "last", cell: (c) => (c.getValue() === null ? traco : <span className="num">{pct(c.getValue(), 1)}</span>) },
      { accessorKey: "folga", header: "Sobra sobre o exigido", meta: { numerica: true, ajuda: "O valor de hoje menos o que sai do bolso hoje (preço mais custos). Negativa: o preço passa do máximo.", csv: (l: Linha) => virgula(l.folga) }, sortUndefined: "last", cell: (c) => dinheiro(c.getValue()) },
      { accessorKey: "precoMaximo", header: "Preço máximo", meta: { numerica: true, ajuda: "O máximo que dá para pagar sem perder para o valor de hoje, já separando os custos.", csv: (l: Linha) => virgula(l.precoMaximo) }, sortUndefined: "last", cell: (c) => dinheiro(c.getValue()) },
    ];
    const agio: ColumnDef<Linha, any>[] =
      tipo === "ativa"
        ? [
            { accessorKey: "agioCredito", header: "Ágio s/ crédito", meta: { numerica: true, ajuda: "O preço pedido como % do crédito.", csv: (l: Linha) => virgula(l.agioCredito) }, sortUndefined: "last", cell: (c) => (c.getValue() === null ? traco : <span className="num">{pct(c.getValue(), 1)}</span>) },
            { accessorKey: "agioSaldo", header: "Ágio s/ saldo", meta: { numerica: true, ajuda: "O preço pedido como % do saldo devedor (parcela vezes parcelas que faltam).", csv: (l: Linha) => virgula(l.agioSaldo) }, sortUndefined: "last", cell: (c) => (c.getValue() === null ? traco : <span className="num">{pct(c.getValue(), 1)}</span>) },
          ]
        : [];
    const obs: ColumnDef<Linha, any>[] = [
      {
        id: "obs",
        header: "Observação",
        accessorFn: (l) => l.erro ?? (l.estimativa ? "taxa estimada (prazo fora da curva)" : ""),
        meta: { largura: "12rem" },
        cell: (c) => (c.row.original.erro ? <span className="font-semibold text-aviso">{c.row.original.erro}</span> : <span className="text-tinta3">{c.getValue()}</span>),
      },
    ];
    return [...comum, ...entradas, ...resultado, ...agio, ...obs];
  }, [tipo]);

  const r = lote.resumo;
  const resumo = () =>
    [
      `Radar Pricing · Várias cotas (${tipo === "ativa" ? "ativas" : "canceladas"}) · foto de ${dataBR(foto.data)}`,
      `${r.calculadas} de ${r.total} cotas calculadas${r.com_erro ? ` (${r.com_erro} com erro)` : ""}; soma do valor de hoje: ${reais(r.soma_vale_hoje)}`,
      ...(r.com_preco ? [`Com preço pedido: ${r.compensam} compensam, ${r.no_limite} no limite e ${r.nao_compensam} não compensam (de ${r.com_preco}); pagaria ${reais(r.soma_pago)} por cotas que valem ${reais(r.soma_vale_das_com_preco)}; lucro no fim, somado: ${comSinalReais(r.soma_lucro)}`] : []),
      `Spread de risco: ${num(spread, 1)} p.p.${notaDoSpread(spread, parametros.spread_demonstracao_pp)}`,
      "Demonstração com premissas públicas: não é preço nem recomendação. victor-ozores.github.io/Radar-Pricing",
    ].join("\n");

  const colunasDoModelo = COLUNAS_DO_LOTE[tipo] as string[];
  const opcionais = tipo === "ativa" ? 2 : 3; // quantas colunas, no fim, podem ficar em branco ou faltar

  return (
    <Moldura
      campos={
        <>
          <Segmentado valor={tipo} aoMudar={(v) => muda({ tipo: v })} rotulo="Tipo de cota da lista" opcoes={TIPOS_DE_LOTE.map((t: { id: string; nome: string }) => ({ id: t.id as Tipo, nome: t.nome }))} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor={idDoTexto} className="text-[0.8125rem] font-semibold text-tinta2">
              Cole a lista, uma cota por linha
            </label>
            <textarea
              id={idDoTexto}
              value={texto}
              onChange={(ev) => muda(tipo === "ativa" ? { textoAtiva: ev.target.value } : { textoCancelada: ev.target.value })}
              rows={6}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              wrap="off"
              className="num w-full resize-y rounded-xl border border-linha2 bg-folha px-3 py-2.5 font-mono text-[16px] leading-relaxed text-tinta outline-none focus:border-marca focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--marca)_25%,transparent)]"
            />
            <p className="m-0 text-xs text-tinta2">
              <span className="font-semibold">Colunas, nesta ordem:</span> {CURTAS[tipo].join(" · ")}.
            </p>
          </div>
          <details className="group rounded-xl bg-folha2 text-xs leading-relaxed text-tinta2">
            <summary className="cursor-pointer list-none px-3 py-2.5 font-semibold [&::-webkit-details-marker]:hidden">
              <span className="mr-1.5 inline-block transition-transform group-open:rotate-90">▸</span>Como preencher
            </summary>
            <div className="px-3 pb-3">
              <ol className="m-0 list-decimal pl-5">
                {colunasDoModelo.map((c, i) => (
                  <li key={c}>
                    {c}
                    {i >= colunasDoModelo.length - opcionais ? <span className="text-tinta3"> (pode ficar em branco)</span> : null}
                  </li>
                ))}
              </ol>
              <p className="m-0 mt-1.5 text-tinta3">
                Copie as células no Excel e cole aqui, ou separe as colunas com ponto e vírgula. Até {MAX_LINHAS} linhas. Números do jeito brasileiro (50.000,50).{" "}
                {tipo === "cancelada" ? "Correção em branco vale IPCA. " : ""}Uma linha de título no começo é ignorada.
              </p>
            </div>
          </details>
          <p className="m-0 text-xs text-tinta3">
            Spread usado: <span className="num font-semibold text-tinta">{num(spread, 1)} p.p.</span>
            {notaDoSpread(spread, parametros.spread_demonstracao_pp)}. Para outro, mude no quadro do spread, acima.
          </p>
        </>
      }
    >
      {r.total === 0 ? (
        <Nota tom="info">Cole a lista no quadro ao lado para ver quanto vale cada cota.</Nota>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="folha p-4">
              <p className="rotulo m-0">Cotas calculadas</p>
              <p className="display num m-0 mt-1 text-[1.6rem] font-semibold leading-tight text-tinta">
                {r.calculadas} <span className="font-sans text-sm font-medium text-tinta3">de {r.total}</span>
              </p>
              {r.com_erro ? <p className="m-0 mt-1 text-xs font-semibold text-aviso">{r.com_erro} com erro: veja a coluna Observação.</p> : <p className="m-0 mt-1 text-xs text-tinta3">Nenhuma linha com erro.</p>}
            </div>
            <div className="folha p-4">
              <p className="rotulo m-0">Soma do que valem hoje</p>
              <p className="display num m-0 mt-1 break-words text-[1.6rem] font-semibold leading-tight text-tinta">{reais(r.soma_vale_hoje)}</p>
              <p className="m-0 mt-1 text-xs text-tinta3">Cotas com valor negativo entram na soma.</p>
            </div>
            <div className="folha p-4">
              <p className="rotulo m-0">Compensam</p>
              {r.com_preco ? (
                <>
                  <p className="display num m-0 mt-1 text-[1.6rem] font-semibold leading-tight text-tinta">
                    {r.compensam} <span className="font-sans text-sm font-medium text-tinta3">de {r.com_preco}</span>
                  </p>
                  <p className="m-0 mt-1 text-xs text-tinta3">
                    <span className="font-semibold text-aviso">{r.no_limite} no limite</span> · <span className="font-semibold text-erro">{r.nao_compensam} não compensam</span>. Lucro no fim, somado:{" "}
                    <span className={`num font-semibold ${r.soma_lucro >= 0 ? "text-ok" : "text-erro"}`}>{comSinalReais(r.soma_lucro)}</span>.
                  </p>
                </>
              ) : (
                <p className="m-0 mt-1 text-sm text-tinta3">Nenhuma linha com preço pedido.</p>
              )}
            </div>
          </div>
          <BarraDoResultado rotulo="Soma do que valem" valor={reais(r.soma_vale_hoje)} />
          {lote.truncado ? <Nota>A lista passa de {MAX_LINHAS} linhas: calculei as {MAX_LINHAS} primeiras.</Nota> : null}
          <Tabela dados={linhas} colunas={colunas} legenda={`Resultado de cada cota da lista (${tipo === "ativa" ? "cotas ativas" : "cotas canceladas"})`} nomeDoArquivo={`radar-pricing-lote-${tipo}`} altura="30rem" idDaLinha={(l, i) => `${i}-${l.n}`} />
        </>
      )}
      <AcoesDaConta resumo={resumo} aoVoltar={volta} />
    </Moldura>
  );
}
