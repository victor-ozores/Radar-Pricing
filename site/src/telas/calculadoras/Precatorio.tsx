import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EXEMPLOS, leituraDoNegocio, MAX_MESES_PRECATORIO, precatorio } from "../../../js/calc.js";
import { dataBR, num, pct, prazoEmTexto, reais } from "../../../js/formato.js";
import { somaMeses } from "../../../js/foto.js";
import { caminhoDeCorrecao } from "../../../js/modelo.js";
import { mesesDaConta, notaDoSpread, usePersistido } from "../../calc/memoria";
import { useEstado } from "../../dados";
import { Balao, COR, EIXO, GRADE, rotuloPct } from "../../graficos/base";
import { Campo, CampoEscolha } from "../../ui/blocos";
import { Termo } from "../../ui/dicas";
import { AcoesDaConta, Aviso, BarraDoResultado, CampoDePrazo, ComoFoiCalculado, ESe, Interruptor, Moldura, Nota, Resultado, SpreadDaConta, Veredito, comSinalPct, comSinalReais, linhaDoVeredito, tituloDaSituacao } from "./pecas";

const EXEMPLO = { valor: EXEMPLOS.precatorio.valor, meses: EXEMPLOS.precatorio.meses, prazoEmData: false, prazoData: "", indice: EXEMPLOS.precatorio.indice as string, jurosPP: EXEMPLOS.precatorio.jurosPP, propriaPct: EXEMPLOS.precatorio.propriaPct, retencaoPct: EXEMPLOS.precatorio.retencaoPct, temOferta: true, desagioPct: EXEMPLOS.precatorio.desagioPct, custos: 0, usarSpread: false, spread: 5 };

const INDICES = [
  { id: "selic", nome: "Selic" },
  { id: "ipca", nome: "IPCA + juros (teto: Selic)" },
  { id: "propria", nome: "Uma taxa que eu informo" },
  { id: "nenhum", nome: "Sem correção" },
] as const;
type Indice = (typeof INDICES)[number]["id"];

const AJUDA_DO_INDICE: Record<Indice, string> = {
  selic: "Regra da EC 113/2021 (de dez/2021 a ago/2025) e dos precatórios tributários, segundo fontes públicas. Aqui, com a Selic que o Focus espera para cada ano.",
  ipca: "Regra da EC 136/2025 para requisições novas de estados e municípios, segundo fontes públicas: IPCA mais juros de 2% ao ano, limitado pela Selic. Há divergência sobre a transição: confirme o seu caso.",
  propria: "Para uma regra que não é nenhuma das duas: informe a taxa ao ano que vale no seu caso.",
  nenhum: "O valor fica como está até o pagamento. É o caso mais conservador.",
};

const PRAZOS_DO_GRAFICO = [12, 24, 36, 48, 60, 72, 84, 96, 108, 120];

export function Precatorio() {
  const { curvas, spread: geral, foto, parametros } = useEstado();
  const caminho = useMemo(() => caminhoDeCorrecao(foto), [foto]);
  const [e, muda, volta] = usePersistido("precatorio", EXEMPLO);
  const indice = (INDICES.find((i) => i.id === e.indice)?.id ?? "selic") as Indice;
  const spread = e.usarSpread ? e.spread : geral;
  const meses = mesesDaConta(e, foto.data, MAX_MESES_PRECATORIO);
  const base = { valor: e.valor, indice, jurosPP: e.jurosPP, propriaPct: e.propriaPct, retencaoPct: e.retencaoPct, custos: e.custos, spreadPP: spread };
  const conta = (m: number, i: Indice = indice, desagio: number | null = null) => precatorio({ ...base, meses: m, indice: i, desagioPct: desagio as any }, curvas.nominal, caminho);
  const r = useMemo(() => (meses ? conta(meses, indice, e.temOferta ? e.desagioPct : null) : null), [meses, indice, e, spread, curvas.nominal, caminho]); // eslint-disable-line react-hooks/exhaustive-deps
  const leitura = r?.oferta && meses ? leituraDoNegocio({ pagoHoje: r.oferta.pago, recebe: r.liquido_esperado, valorJusto: r.valor_presente, anos: r.prazo_anos }) : null;
  const animar = !(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  const serie = useMemo(() => PRAZOS_DO_GRAFICO.map((m) => ({ meses: m, desagio: conta(m)?.desagio_justo_pct ?? null })).filter((p) => p.desagio !== null), [e, spread, indice, curvas.nominal, caminho]); // eslint-disable-line react-hooks/exhaustive-deps
  const semDado = indice === "selic" && caminho.selicDoAno(caminho.anoBase) === null ? "a Selic" : indice === "ipca" && caminho.ipcaDoAno(caminho.anoBase) === null ? "o IPCA esperado" : null;
  const alemDoFocus = meses !== null && foto.data && (indice === "selic" || indice === "ipca") && Number(somaMeses(foto.data, meses).slice(0, 4)) > Math.max(...caminho.anosDoFocus[indice === "selic" ? "selic" : "ipca"]);
  const textoDaCorrecao =
    indice === "nenhum"
      ? "Sem correção, o valor fica como está."
      : indice === "propria"
        ? `Taxa de ${num(e.propriaPct, 2)}% ao ano durante ${prazoEmTexto(meses ?? 0)}.`
        : indice === "selic"
          ? "Mês a mês, o valor rende (1 + taxa do ano)^(1/12). A taxa do ano é a Selic: no ano em curso, a média entre a meta de hoje e a esperada para o fim do ano; nos seguintes, a esperada pelo Focus."
          : `Mês a mês, o valor rende (1 + taxa do ano)^(1/12). A taxa do ano é o IPCA esperado pelo Focus mais ${num(e.jurosPP, 1)} p.p. de juros, limitada pela Selic (somo os juros à taxa do ano, o que é uma aproximação dos juros simples da regra).`;
  const resumo = () =>
    [
      `Radar Pricing · Precatório · foto de ${dataBR(foto.data)}`,
      `Valor atualizado hoje: ${reais(e.valor, 0)}; pagamento em ${prazoEmTexto(meses ?? 0)}; correção: ${INDICES.find((i) => i.id === indice)?.nome}${indice === "ipca" ? ` (juros de ${num(e.jurosPP, 1)} p.p.)` : indice === "propria" ? ` (${num(e.propriaPct, 2)}% ao ano)` : ""}${e.retencaoPct > 0 ? `; retenções de ${num(e.retencaoPct, 1)}%` : ""}`,
      `Spread de risco: ${num(spread, 1)} p.p.${notaDoSpread(spread, parametros.spread_demonstracao_pp)}`,
      r ? `Valor esperado no pagamento: ${reais(r.valor_esperado)} (correção de ${num(r.correcao_total_pct, 1)}%, ${num(r.correcao_aa_pct, 2)}% ao ano); vale hoje ${reais(r.valor_presente)} (${num(r.pct_do_valor, 1)}% do valor atualizado: deságio justo de ${num(r.desagio_justo_pct, 1)}%)` : "Sem resultado para estes dados",
      ...(r?.oferta ? [`Oferta de compra com ${num(e.desagioPct, 1)}% de deságio (${reais(r.oferta.preco, 0)}${e.custos > 0 ? ` + ${reais(e.custos, 0)} de custos` : ""}): retorno de ${num(r.oferta.retorno_aa, 2)}% ao ano; deságio mínimo para ganhar Tesouro + spread: ${num(r.oferta.desagio_minimo_pct, 1)}%`] : []),
      ...(leitura ? [linhaDoVeredito(leitura)] : []),
      "Demonstração com premissas públicas: não é preço nem recomendação. victor-ozores.github.io/Radar-Pricing",
    ].join("\n");
  return (
    <Moldura
      campos={
        <>
          <Campo rotulo="Valor atualizado hoje" valor={e.valor} aoMudar={(v) => muda({ valor: v })} prefixo="R$" min={1} max={1e10} ajuda="O valor do crédito já corrigido até hoje (o que consta no ofício ou no extrato do tribunal)." />
          <CampoDePrazo rotulo="Quando é pago" e={e} muda={muda} baseIso={foto.data} max={MAX_MESES_PRECATORIO} ajuda="A fila é incerta: teste mais de um prazo." />
          <CampoEscolha rotulo="Como o valor é corrigido" valor={indice} aoMudar={(v) => muda({ indice: v })} opcoes={INDICES.map((i) => ({ id: i.id, nome: i.nome }))} ajuda={AJUDA_DO_INDICE[indice]} />
          {indice === "ipca" ? <Campo rotulo="Juros ao ano, além do IPCA" valor={e.jurosPP} aoMudar={(v) => muda({ jurosPP: v })} sufixo="p.p." casas={2} min={0} max={30} passo={0.5} /> : null}
          {indice === "propria" ? <Campo rotulo="Taxa de correção" valor={e.propriaPct} aoMudar={(v) => muda({ propriaPct: v })} sufixo="% a.a." casas={2} min={-50} max={200} passo={0.5} /> : null}
          <Campo rotulo="Retenções e descontos" valor={e.retencaoPct} aoMudar={(v) => muda({ retencaoPct: v })} sufixo="%" casas={1} min={0} max={99} passo={0.5} ajuda="Imposto de renda, PSS, honorários e o que mais sair do valor. A regra de cada um varia: digite o total." />
          <div className="flex flex-col gap-3 rounded-xl bg-folha2 p-3">
            <Interruptor ligado={e.temOferta} aoMudar={(v) => muda({ temOferta: v })} rotulo="Tenho uma oferta de compra" ajuda="Na cessão, o comprador paga com um deságio sobre o valor atualizado." />
            {e.temOferta ? (
              <>
                <Campo rotulo="Deságio oferecido" valor={e.desagioPct} aoMudar={(v) => muda({ desagioPct: v })} sufixo="%" casas={1} min={0} max={99} passo={1} ajuda={`Preço: ${reais(e.valor * (1 - e.desagioPct / 100), 0)}.`} />
                <Campo rotulo="Custos de transferência" valor={e.custos} aoMudar={(v) => muda({ custos: v })} prefixo="R$" min={0} max={1e9} ajuda="Cartório, advogado da cessão e o que mais o comprador pagar." />
              </>
            ) : null}
          </div>
          <SpreadDaConta e={e} muda={muda} dica="Prazo e pagamento de precatório são mais incertos que os de uma cota: um spread maior é razoável." />
        </>
      }
    >
      {semDado ? <Nota>Esta foto não traz {semDado} esperado(a); escolha outra correção ou informe uma taxa.</Nota> : null}
      {r && meses ? (
        <>
          {leitura && r.oferta ? (
            <Veredito
              situacao={leitura.situacao}
              frase={
                <>
                  Comprando o precatório por <strong>{reais(r.oferta.pago, 0)}</strong> ({num(e.desagioPct, 1)}% de deságio sobre {reais(e.valor, 0)}
                  {e.custos > 0 ? ", com os custos" : ""}) e recebendo {reais(r.liquido_esperado, 0)}
                  {e.retencaoPct > 0 ? " depois das retenções" : ""} em {prazoEmTexto(meses)}:{" "}
                  {leitura.situacao === "bom" ? "o preço está abaixo do que o precatório vale hoje." : leitura.situacao === "limite" ? "o preço é quase o que o precatório vale hoje, então sobra pouco." : "o preço passa do que o precatório vale hoje."}
                </>
              }
              itens={[
                { rotulo: "Lucro no fim", valor: comSinalReais(leitura.lucro), sub: `${comSinalPct(leitura.lucro_pct)} · recebe ${reais(r.liquido_esperado, 0)}, paga ${reais(leitura.total_pago, 0)}`, tom: leitura.lucro >= 0 ? "bom" : "ruim" },
                { rotulo: "Rende ao ano", valor: `${num(r.oferta.retorno_aa, 2)}%`, sub: `você exige ${num(r.taxa_desconto, 2)}% (Tesouro + spread)`, tom: leitura.folga >= 0 ? "bom" : "ruim" },
                { rotulo: leitura.folga >= 0 ? "Sobra sobre o exigido" : "Falta para o exigido", valor: comSinalReais(leitura.folga), sub: "em valor de hoje", tom: leitura.folga >= 0 ? "bom" : "ruim" },
              ]}
              rodape={
                <>
                  Deságio mínimo para ainda compensar: <strong className="num">{num(r.oferta.desagio_minimo_pct, 1)}%</strong> (preço máximo <strong className="num">{reais(r.oferta.preco_maximo)}</strong>
                  {e.custos > 0 ? ", já separando os custos" : ""}).
                </>
              }
            />
          ) : null}
          <Resultado
            rotulo="Vale hoje"
            valor={r.valor_presente}
            formato={(n) => reais(n)}
            nota={
              <>
                Isso é <strong>{num(r.pct_do_valor, 1)}%</strong> dos {reais(e.valor, 0)}: um deságio justo de <strong>{num(r.desagio_justo_pct, 1)}%</strong> para ganhar a taxa do Tesouro mais o spread ({pct(r.taxa_desconto)} ao ano). Em <Termo id="precatorio">precatório</Termo>, quanto mais demora, maior o deságio.
              </>
            }
          />
          <BarraDoResultado rotulo={leitura ? `${tituloDaSituacao(leitura.situacao)} · lucro` : "Vale hoje"} valor={leitura ? comSinalReais(leitura.lucro) : reais(r.valor_presente)} situacao={leitura?.situacao ?? null} />
          <div className="rounded-2xl border border-linha bg-folha p-4">
            <h3 className="m-0 mb-1 font-sans text-sm font-semibold text-tinta">O que chega no pagamento</h3>
            <p className="m-0 text-[0.9rem] leading-snug text-tinta2">
              Com a correção de <strong className="num">{num(r.correcao_total_pct, 1)}%</strong> ({num(r.correcao_aa_pct, 2)}% ao ano), os {reais(e.valor, 0)} viram <strong className="num">{reais(r.valor_esperado)}</strong>
              {e.retencaoPct > 0 ? <>; tirando {num(e.retencaoPct, 1)}% de retenções, ficam <strong className="num">{reais(r.liquido_esperado)}</strong></> : null}, daqui a {prazoEmTexto(meses)}.
            </p>
            {alemDoFocus ? <p className="m-0 mt-1.5 text-xs text-tinta3">O Focus só olha até {Math.max(...caminho.anosDoFocus[indice === "selic" ? "selic" : "ipca"])}; depois disso repito o último valor esperado.</p> : null}
          </div>
          <Aviso extrapolado={r.extrapolado} curva={curvas.nominal} />
          <div className="folha min-w-0 p-4 md:p-5">
            <h3 className="m-0 font-sans text-[0.95rem] font-semibold text-tinta">Quanto a espera pesa no deságio justo</h3>
            <p className="m-0 mb-3 mt-0.5 text-[0.8125rem] text-tinta3">Deságio justo para cada prazo de pagamento, com a correção e o spread escolhidos. O ponto marca o seu prazo.</p>
            <div className="h-[14rem] w-full" role="img" aria-label={`Deságio justo por prazo: ${serie.map((p) => `${prazoEmTexto(p.meses)} ${num(p.desagio as number, 0)}%`).join(", ")}.`}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={serie} margin={{ top: 12, right: 14, bottom: 0, left: 0 }}>
                  <CartesianGrid {...GRADE} />
                  <XAxis dataKey="meses" type="number" domain={[12, 120]} ticks={[12, 36, 60, 84, 108]} {...EIXO} tickFormatter={(v: number) => `${v / 12}a`} />
                  <YAxis {...EIXO} axisLine={false} width={44} tickFormatter={rotuloPct} />
                  <Tooltip
                    cursor={{ stroke: "var(--linha-2)" }}
                    content={({ active, payload }) => {
                      const d = active && (payload?.[0]?.payload as any);
                      return d ? <Balao titulo={`Pago em ${prazoEmTexto(d.meses)}`} linhas={[{ cor: COR.s1, nome: "Deságio justo", valor: `${num(d.desagio, 1)}%`, destaque: true }]} /> : null;
                    }}
                  />
                  <Line dataKey="desagio" stroke={COR.s1} strokeWidth={3} dot={{ r: 4, fill: COR.s1, stroke: "var(--folha)", strokeWidth: 2 }} activeDot={{ r: 6, stroke: "var(--folha)", strokeWidth: 2 }} isAnimationActive={animar} />
                  {meses >= 12 && meses <= 120 ? <ReferenceDot x={meses} y={r.desagio_justo_pct} r={8} fill="var(--folha)" stroke={COR.s2} strokeWidth={3} ifOverflow="extendDomain" /> : null}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ESe
              titulo="E se a correção fosse outra?"
              linhas={INDICES.flatMap((i) => {
                const x = conta(meses, i.id);
                return x ? [{ rotulo: i.id === "selic" ? "Selic" : i.id === "ipca" ? "IPCA+" : i.id === "propria" ? "Taxa sua" : "Nenhuma", valor: x.valor_presente, texto: reais(x.valor_presente, 0), atual: i.id === indice, extra: `${num(x.pct_do_valor, 0)}%` }] : [];
              })}
            />
            <ESe
              titulo="E se o pagamento fosse em outro prazo?"
              linhas={[-24, -12, 0, 12, 24].flatMap((d) => {
                const m = meses + d;
                const x = m >= 1 ? conta(m) : null;
                return x ? [{ rotulo: prazoEmTexto(m), valor: x.valor_presente, texto: reais(x.valor_presente, 0), atual: d === 0, extra: `${num(x.pct_do_valor, 0)}%` }] : [];
              })}
            />
          </div>
          <Nota>
            Em precatório, a regra de correção, a ordem de pagamento e as retenções mudam de caso para caso (ente devedor, ano de expedição, natureza do crédito). Esta é uma conta de demonstração com premissas públicas: confirme o seu caso antes de usar qualquer número.
          </Nota>
          <AcoesDaConta resumo={resumo} aoVoltar={volta} />
          <ComoFoiCalculado>
            <p className="m-0">
              <strong>1. Correção até o pagamento.</strong> {textoDaCorrecao} O fator total é {num(r.fator, 6)}.
            </p>
            <p className="m-0 mt-2 num">
              {reais(e.valor)} × {num(r.fator, 6)}{e.retencaoPct > 0 ? ` × (1 − ${num(e.retencaoPct, 1)}%)` : ""} = {reais(r.liquido_esperado)}
            </p>
            <p className="m-0 mt-2">
              <strong>2. Valor de hoje.</strong> Taxa do Tesouro Prefixado para {prazoEmTexto(meses)}: {pct(r.taxa_ancora, 4)}. Com o spread de {num(spread, 1)} p.p., a taxa de desconto é {pct(r.taxa_desconto, 4)} ao ano. Prazo: {r.dias_uteis} dias úteis ÷ 252 = {num(r.prazo_anos, 4)} anos (de 252 dias úteis cada; o Tesouro conta assim: sem fins de semana nem feriados nacionais).
            </p>
            <p className="m-0 mt-2 num">
              {reais(r.liquido_esperado)} ÷ (1 + {num(r.taxa_desconto, 4)}%)<sup>{num(r.prazo_anos, 4)}</sup> = <strong>{reais(r.valor_presente)}</strong>
            </p>
            <p className="m-0 mt-2 text-tinta3">Usa a curva Prefixada porque a correção já embute inflação: o valor esperado está em reais do dia do pagamento. Não considera ordem de pagamento, risco do ente devedor nem litígios.</p>
            {r.oferta ? (
              <p className="m-0 mt-2 num">
                Retorno de quem compra = ({reais(r.liquido_esperado, 0)} ÷ {reais(r.oferta.pago, 0)})<sup>12/{meses}</sup> − 1 = <strong>{pct(r.oferta.retorno_aa, 4)}</strong> ao ano.
              </p>
            ) : null}
          </ComoFoiCalculado>
        </>
      ) : (
        <Nota tom="info">{meses === null ? "Informe um prazo de 1 a 360 meses (ou uma data futura) para ver quanto vale hoje." : semDado ? "Sem esse dado, a conta não tem como seguir." : "Preencha o valor e o prazo para ver quanto vale hoje."}</Nota>
      )}
    </Moldura>
  );
}
