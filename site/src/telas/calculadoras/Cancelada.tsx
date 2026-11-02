import { useMemo } from "react";
import { cotaCancelada, EXEMPLOS } from "../../../js/calc.js";
import { dataBR, num, pct, prazoEmTexto, reais } from "../../../js/formato.js";
import { mesesDaConta, usePersistido } from "../../calc/memoria";
import { useEstado } from "../../dados";
import { Campo } from "../../ui/blocos";
import { Termo } from "../../ui/dicas";
import { AcoesDaConta, Aviso, BarraDoResultado, CampoDePrazo, ComoFoiCalculado, ESe, Interruptor, Moldura, Nota, PrecoPedido, Resultado, SpreadDaConta, VeredictoDoPreco } from "./pecas";

const EXEMPLO = { ...EXEMPLOS.cancelada, prazoEmData: false, prazoData: "", usarSpread: false, spread: 5, temPreco: false, preco: 38000, custos: 0 };

export function Cancelada() {
  const { curvas, spread: geral, foto } = useEstado();
  const [e, muda, volta] = usePersistido("cancelada", EXEMPLO);
  const spread = e.usarSpread ? e.spread : geral;
  const meses = mesesDaConta(e, foto.data);
  const r = useMemo(() => (meses ? cotaCancelada({ valor: e.valor, meses, corrigido: e.corrigido, spreadPP: spread }, curvas) : null), [e.valor, meses, e.corrigido, spread, curvas]);
  const curva = e.corrigido ? curvas.real : curvas.nominal;
  const resumo = () =>
    [
      `Radar Pricing · Cota cancelada · foto de ${dataBR(foto.data)}`,
      `Valor que o grupo devolve: ${reais(e.valor, 0)} em ${prazoEmTexto(meses ?? 0)} (${e.corrigido ? "corrigido pela inflação" : "sem correção"})`,
      `Spread de risco: ${num(spread, 1)} p.p. (exemplo)`,
      r ? `Vale hoje: ${reais(r.valor_presente)} (${num(r.pct_do_valor, 1)}% do valor), taxa de desconto de ${pct(r.taxa_desconto)} ao ano` : "Sem resultado para estes dados",
      ...(r && e.temPreco ? [`Preço pedido: ${reais(e.preco, 0)} + ${reais(e.custos, 0)} de custos = ${reais(e.preco + e.custos, 0)}; preço máximo para empatar: ${reais(r.valor_presente - e.custos)}`] : []),
      "Demonstração com premissas públicas: não é preço nem recomendação. victor-ozores.github.io/Radar-Pricing",
    ].join("\n");
  return (
    <Moldura
      campos={
        <>
          <Campo rotulo="Valor que o grupo vai devolver" valor={e.valor} aoMudar={(v) => muda({ valor: v })} prefixo="R$" min={1} max={1e9} ajuda="O que a administradora paga a quem desistiu, no fim do grupo." />
          <CampoDePrazo rotulo="Quando o grupo devolve" e={e} muda={muda} baseIso={foto.data} ajuda="Em consórcio, o grupo costuma devolver só no fim." />
          <Interruptor ligado={e.corrigido} aoMudar={(v) => muda({ corrigido: v })} rotulo="Corrigido pela inflação" ajuda={e.corrigido ? "O valor sobe com o IPCA até a data. Resultado em reais de hoje." : "O valor é fixo em reais, sem correção."} />
          <PrecoPedido e={e} muda={muda} ajudaDoPreco="O que pedem por esta cota cancelada." />
          <SpreadDaConta e={e} muda={muda} />
        </>
      }
    >
      {r && meses ? (
        <>
          <Resultado
            rotulo="Vale hoje"
            valor={r.valor_presente}
            formato={(n) => reais(n)}
            nota={
              <>
                Isso é <strong>{num(r.pct_do_valor, 1)}%</strong> dos {reais(e.valor, 0)} que serão devolvidos em {prazoEmTexto(meses)}. Foi descontado pela <Termo id="taxaDeDesconto">taxa de desconto</Termo> de {pct(r.taxa_desconto)} ao ano.
              </>
            }
          />
          <BarraDoResultado rotulo="Vale hoje" valor={reais(r.valor_presente)} />
          {e.temPreco ? <VeredictoDoPreco valorJusto={r.valor_presente} preco={e.preco} custos={e.custos} /> : null}
          <Aviso extrapolado={r.extrapolado} curva={curva} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ESe titulo="E se o prazo fosse outro?" linhas={r.prazos.map((p: any) => ({ rotulo: prazoEmTexto(p.meses), valor: p.valor_presente, texto: reais(p.valor_presente, 0), atual: p.meses === meses, extra: `${num(p.pct_do_valor, 0)}%` }))} />
            <ESe titulo="E se o spread de risco fosse outro?" linhas={r.spreads.map((s: any) => ({ rotulo: `${num(s.spread, 1)} p.p.`, valor: s.valor_presente, texto: reais(s.valor_presente, 0), atual: s.spread === spread, extra: `${num(s.pct_do_valor, 0)}%` }))} />
          </div>
          <AcoesDaConta resumo={resumo} aoVoltar={volta} />
          <ComoFoiCalculado>
            <p className="m-0">
              Taxa do Tesouro {e.corrigido ? "IPCA+" : "Prefixado"} para {prazoEmTexto(meses)}: {pct(r.taxa_ancora, 4)} (interpolada entre os vencimentos vizinhos). Somando o spread de {num(spread, 1)} p.p., a taxa de desconto é {pct(r.taxa_desconto, 4)} ao ano.
            </p>
            <p className="m-0 mt-2 num">
              {reais(e.valor)} ÷ (1 + {num(r.taxa_desconto, 4)}%)<sup>{meses}/12</sup> = <strong>{reais(r.valor_presente)}</strong>
            </p>
            <p className="m-0 mt-2 text-tinta3">{e.corrigido ? "Com correção pelo IPCA, o valor e a taxa são reais: o resultado já está em reais de hoje." : "Sem correção, a conta usa a curva do Tesouro Prefixado (taxa fixa)."} Exemplo de demonstração: não é preço nem recomendação.</p>
          </ComoFoiCalculado>
        </>
      ) : (
        <Nota tom="info">{meses === null ? "Informe um prazo de 1 a 360 meses (ou uma data futura) para ver quanto vale hoje." : `Esta foto precisa ter a curva do Tesouro ${e.corrigido ? "IPCA+" : "Prefixado"}.`}</Nota>
      )}
    </Moldura>
  );
}
