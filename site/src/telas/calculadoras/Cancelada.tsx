import { useMemo } from "react";
import { cotaCancelada, EXEMPLOS, leituraDoNegocio } from "../../../js/calc.js";
import { dataBR, num, pct, prazoEmTexto, reais } from "../../../js/formato.js";
import { mesesDaConta, notaDoSpread, usePersistido } from "../../calc/memoria";
import { useEstado } from "../../dados";
import { Campo, CampoEscolha } from "../../ui/blocos";
import { Termo } from "../../ui/dicas";
import { AcoesDaConta, Aviso, BarraDoResultado, CampoDePrazo, ComoFoiCalculado, ESe, Moldura, Nota, PrecoPedido, Resultado, SpreadDaConta, Veredito, comSinalPct, comSinalReais, linhaDoVeredito, tituloDaSituacao } from "./pecas";

const INDICES = [
  { id: "ipca", nome: "Pela inflação (IPCA)" },
  { id: "propria", nome: "Por uma taxa que eu informo" },
  { id: "nenhum", nome: "Sem correção" },
] as const;
type Indice = (typeof INDICES)[number]["id"];

const AJUDA_DO_INDICE: Record<Indice, string> = {
  ipca: "O valor sobe com o IPCA até a data. O resultado sai em reais de hoje.",
  propria: "Para o índice do bem (INCC, tabela FIPE...): o valor de hoje cresce a essa taxa até a data e depois é descontado pela curva Prefixada.",
  nenhum: "O valor é fixo em reais, sem correção.",
};

const EXEMPLO = { valor: EXEMPLOS.cancelada.valor, meses: EXEMPLOS.cancelada.meses, indice: "ipca" as string, propriaPct: 5, prazoEmData: false, prazoData: "", usarSpread: false, spread: 5, temPreco: true, preco: 38000, custos: 0 };

export function Cancelada() {
  const { curvas, spread: geral, foto, parametros } = useEstado();
  const [e, muda, volta] = usePersistido("cancelada", EXEMPLO);
  const spread = e.usarSpread ? e.spread : geral;
  const meses = mesesDaConta(e, foto.data);
  const indice: Indice = INDICES.some((i) => i.id === e.indice) ? (e.indice as Indice) : "ipca";
  const r = useMemo(
    () => (meses ? cotaCancelada({ valor: e.valor, meses, corrigido: indice === "ipca", correcaoPct: (indice === "propria" ? e.propriaPct : null) as any, spreadPP: spread }, curvas) : null),
    [e.valor, meses, indice, e.propriaPct, spread, curvas],
  );
  const curva = indice === "ipca" ? curvas.real : curvas.nominal;
  const leitura = r && meses && e.temPreco ? leituraDoNegocio({ pagoHoje: e.preco + e.custos, recebe: r.valor_no_pagamento, valorJusto: r.valor_presente, anos: r.prazo_anos }) : null;
  const textoDoIndice = indice === "ipca" ? "corrigido pela inflação" : indice === "propria" ? `corrigido a ${num(e.propriaPct, 2)}% ao ano` : "sem correção";
  const resumo = () =>
    [
      `Radar Pricing · Cota cancelada · foto de ${dataBR(foto.data)}`,
      `Valor que o grupo devolve: ${reais(e.valor, 0)} em ${prazoEmTexto(meses ?? 0)} (${textoDoIndice})`,
      `Spread de risco: ${num(spread, 1)} p.p.${notaDoSpread(spread, parametros.spread_demonstracao_pp)}`,
      r ? `Vale hoje: ${reais(r.valor_presente)} (${num(r.pct_do_valor, 1)}% do valor), taxa de desconto de ${pct(r.taxa_desconto)} ao ano` : "Sem resultado para estes dados",
      ...(r && leitura ? [`Preço pedido: ${reais(e.preco, 0)} + ${reais(e.custos, 0)} de custos = ${reais(e.preco + e.custos, 0)}; preço máximo para compensar: ${reais(r.valor_presente - e.custos)}`, linhaDoVeredito(leitura)] : []),
      "Demonstração com premissas públicas: não é preço nem recomendação. victor-ozores.github.io/Radar-Pricing",
    ].join("\n");
  return (
    <Moldura
      campos={
        <>
          <Campo rotulo="Valor que o grupo vai devolver" valor={e.valor} aoMudar={(v) => muda({ valor: v })} prefixo="R$" min={1} max={1e9} ajuda="O que a administradora paga a quem desistiu, no fim do grupo." />
          <CampoDePrazo rotulo="Quando o grupo devolve" e={e} muda={muda} baseIso={foto.data} ajuda="Costuma ser no fim do grupo ou quando a cota excluída é sorteada: confira o contrato." />
          <CampoEscolha rotulo="Como o valor é corrigido" valor={indice} aoMudar={(v) => muda({ indice: v })} opcoes={INDICES.map((i) => ({ id: i.id, nome: i.nome }))} ajuda={AJUDA_DO_INDICE[indice]} />
          {indice === "propria" ? <Campo rotulo="Taxa de correção" valor={e.propriaPct} aoMudar={(v) => muda({ propriaPct: v })} sufixo="% a.a." casas={2} min={-50} max={200} passo={0.5} /> : null}
          <PrecoPedido e={e} muda={muda} ajudaDoPreco="O que pedem por esta cota cancelada." />
          <SpreadDaConta e={e} muda={muda} />
        </>
      }
    >
      {r && meses ? (
        <>
          {leitura && meses ? (
            <Veredito
              situacao={leitura.situacao}
              frase={
                <>
                  Pagando <strong>{reais(e.preco + e.custos, 0)}</strong>
                  {e.custos > 0 ? " (com os custos)" : ""} por um valor que a administradora devolve em {prazoEmTexto(meses)}:{" "}
                  {leitura.situacao === "bom" ? "o preço está abaixo do que esse valor vale hoje." : leitura.situacao === "limite" ? "o preço é quase o que esse valor vale hoje, então sobra pouco." : "o preço passa do que esse valor vale hoje."}
                </>
              }
              itens={[
                { rotulo: "Lucro no fim", valor: comSinalReais(leitura.lucro), sub: `${comSinalPct(leitura.lucro_pct)} · recebe ${reais(r.valor_no_pagamento, 0)}, paga ${reais(leitura.total_pago, 0)}`, tom: leitura.lucro >= 0 ? "bom" : "ruim" },
                { rotulo: "Rende ao ano", valor: `${num(leitura.retorno_aa ?? 0, 2)}%`, sub: `você exige ${num(r.taxa_desconto, 2)}% (Tesouro + spread)`, tom: leitura.folga >= 0 ? "bom" : "ruim" },
                { rotulo: leitura.folga >= 0 ? "Sobra sobre o exigido" : "Falta para o exigido", valor: comSinalReais(leitura.folga), sub: "em valor de hoje", tom: leitura.folga >= 0 ? "bom" : "ruim" },
              ]}
              rodape={
                leitura.situacao === "ruim" ? (
                  <>
                    Para compensar, o preço teria de cair para no máximo <strong className="num">{reais(r.valor_presente - e.custos)}</strong> ({reais(Math.abs(leitura.folga), 0)} a menos).
                  </>
                ) : (
                  <>
                    Preço máximo para ainda compensar: <strong className="num">{reais(r.valor_presente - e.custos)}</strong>
                    {e.custos > 0 ? " (já separando os custos)" : ""}.
                  </>
                )
              }
            />
          ) : null}
          <Resultado
            rotulo="Vale hoje"
            valor={r.valor_presente}
            formato={(n) => reais(n)}
            nota={
              <>
                Isso é <strong>{num(r.pct_do_valor, 1)}%</strong> dos {reais(e.valor, 0)} {indice === "propria" ? `de hoje (que viram ${reais(r.valor_no_pagamento, 0)} em ${prazoEmTexto(meses)})` : `que serão devolvidos em ${prazoEmTexto(meses)}`}. Foi descontado pela <Termo id="taxaDeDesconto">taxa de desconto</Termo> de {pct(r.taxa_desconto)} ao ano.
              </>
            }
          />
          <BarraDoResultado rotulo={leitura ? `${tituloDaSituacao(leitura.situacao)} · lucro` : "Vale hoje"} valor={leitura ? comSinalReais(leitura.lucro) : reais(r.valor_presente)} situacao={leitura?.situacao ?? null} />
          <Aviso extrapolado={r.extrapolado} curva={curva} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ESe titulo="E se o prazo fosse outro?" linhas={r.prazos.map((p: any) => ({ rotulo: prazoEmTexto(p.meses), valor: p.valor_presente, texto: reais(p.valor_presente, 0), atual: p.meses === meses, extra: `${num(p.pct_do_valor, 0)}%` }))} />
            <ESe titulo="E se o spread de risco fosse outro?" linhas={r.spreads.map((s: any) => ({ rotulo: `${num(s.spread, 1)} p.p.`, valor: s.valor_presente, texto: reais(s.valor_presente, 0), atual: s.spread === spread, extra: `${num(s.pct_do_valor, 0)}%` }))} />
          </div>
          <AcoesDaConta resumo={resumo} aoVoltar={volta} />
          <ComoFoiCalculado>
            <p className="m-0">
              Taxa do Tesouro {indice === "ipca" ? "IPCA+" : "Prefixado"} para {prazoEmTexto(meses)}: {pct(r.taxa_ancora, 4)} (interpolada entre os vencimentos vizinhos). Somando o spread de {num(spread, 1)} p.p., a taxa de desconto é {pct(r.taxa_desconto, 4)} ao ano.
            </p>
            <p className="m-0 mt-2">Prazo: {r.dias_uteis} dias úteis ÷ 252 = {num(r.prazo_anos, 4)} anos (de 252 dias úteis cada; o Tesouro conta assim: sem fins de semana nem feriados nacionais).</p>
            {indice === "propria" ? (
              <p className="m-0 mt-2 num">
                {reais(e.valor)} × (1 + {num(e.propriaPct, 2)}%)<sup>{meses}/12</sup> = {reais(r.valor_no_pagamento)} no pagamento
              </p>
            ) : null}
            <p className="m-0 mt-2 num">
              {reais(indice === "propria" ? r.valor_no_pagamento : e.valor)} ÷ (1 + {num(r.taxa_desconto, 4)}%)<sup>{num(r.prazo_anos, 4)}</sup> = <strong>{reais(r.valor_presente)}</strong>
            </p>
            <p className="m-0 mt-2 text-tinta3">{indice === "ipca" ? "Com correção pelo IPCA, o valor e a taxa são reais: o resultado já está em reais de hoje." : indice === "propria" ? "Com a sua taxa, o valor cresce até a data e a conta usa a curva do Tesouro Prefixado (taxa fixa), porque a correção já embute a inflação." : "Sem correção, a conta usa a curva do Tesouro Prefixado (taxa fixa)."} Exemplo de demonstração: não é preço nem recomendação.</p>
          </ComoFoiCalculado>
        </>
      ) : (
        <Nota tom="info">{meses === null ? "Informe um prazo de 1 a 360 meses (ou uma data futura) para ver quanto vale hoje." : `Esta foto precisa ter a curva do Tesouro ${indice === "ipca" ? "IPCA+" : "Prefixado"}.`}</Nota>
      )}
    </Moldura>
  );
}
