import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { agioDaCota, cotaAtiva, EXEMPLOS, MAX_PARCELAS } from "../../../js/calc.js";
import { dataBR, num, numComMenos, prazoEmTexto, reais } from "../../../js/formato.js";
import { notaDoSpread, usePersistido } from "../../calc/memoria";
import { useEstado } from "../../dados";
import { Balao, COR, EIXO, GRADE } from "../../graficos/base";
import { Campo } from "../../ui/blocos";
import { AcoesDaConta, Aviso, BarraDoResultado, ComoFoiCalculado, ESe, Moldura, Nota, PrecoPedido, Resultado, SpreadDaConta, VeredictoDoPreco } from "./pecas";

const EXEMPLO = { ...EXEMPLOS.ativa, usarSpread: false, spread: 5, temPreco: false, preco: 20000, custos: 0 };

export function Ativa() {
  const { curvas, spread: geral, foto, parametros } = useEstado();
  const [e, muda, volta] = usePersistido("ativa", EXEMPLO);
  const spread = e.usarSpread ? e.spread : geral;
  const k = Math.min(e.contemplacao, e.parcelas);
  const r = useMemo(() => cotaAtiva({ credito: e.credito, parcela: e.parcela, parcelas: e.parcelas, contemplacao: k, spreadPP: spread }, curvas.real), [e.credito, e.parcela, e.parcelas, k, spread, curvas.real]);
  const saldo = e.parcela * e.parcelas;
  const agio = r && e.temPreco ? agioDaCota({ preco: e.preco, custos: e.custos, credito: e.credito, saldoDevedor: saldo }) : null;
  const animar = !(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  const resumo = () =>
    [
      `Radar Pricing · Cota ativa · foto de ${dataBR(foto.data)}`,
      `Crédito de ${reais(e.credito, 0)}, ${e.parcelas} parcelas de ${reais(e.parcela, 0)}, contemplação ${k === 0 ? "já" : `em ${prazoEmTexto(k)}`}`,
      `Spread de risco: ${num(spread, 1)} p.p.${notaDoSpread(spread, parametros.spread_demonstracao_pp)}`,
      r ? `A cota vale hoje ${reais(r.valor_da_cota)} (${num(r.pct_do_credito, 1)}% do crédito): crédito em valor de hoje ${reais(r.vp_credito)} menos parcelas em valor de hoje ${reais(r.vp_parcelas)}` : "Sem resultado para estes dados",
      ...(r && agio ? [`Preço pedido ${reais(e.preco, 0)} (+ ${reais(e.custos, 0)} de custos): ágio de ${num(agio.sobre_credito_pct, 1)}% sobre o crédito e ${num(agio.sobre_saldo_pct, 1)}% sobre o saldo devedor; preço máximo para empatar ${reais(r.valor_da_cota - e.custos)}`] : []),
      "Demonstração com premissas públicas: não é preço nem recomendação. victor-ozores.github.io/Radar-Pricing",
    ].join("\n");
  return (
    <Moldura
      campos={
        <>
          <Campo rotulo="Crédito da carta" valor={e.credito} aoMudar={(v) => muda({ credito: v })} prefixo="R$" min={1} max={1e9} ajuda="O valor que a pessoa recebe quando for contemplada." />
          <Campo rotulo="Parcela mensal" valor={e.parcela} aoMudar={(v) => muda({ parcela: v })} prefixo="R$" min={1} max={1e8} ajuda="Quanto paga por mês." />
          <Campo rotulo="Parcelas que faltam" valor={e.parcelas} aoMudar={(v) => muda({ parcelas: Math.round(v) })} casas={0} min={1} max={MAX_PARCELAS} passo={1} sufixo="parcelas" ajuda={`No máximo ${MAX_PARCELAS} (20 anos). Saldo devedor sem desconto: ${reais(saldo, 0)}.`} />
          <Campo rotulo="Contemplação daqui a" valor={k} aoMudar={(v) => muda({ contemplacao: Math.round(v) })} casas={0} min={0} max={e.parcelas} passo={1} sufixo="meses" ajuda="0 = já contemplada. Não considera a chance de contemplar nem o lance." />
          <PrecoPedido e={e} muda={muda} ajudaDoPreco="O que pedem pela cota, sem contar as parcelas que o comprador assume." />
          <SpreadDaConta e={e} muda={muda} />
        </>
      }
    >
      {r ? (
        <>
          <Resultado
            rotulo="A cota vale hoje"
            valor={r.valor_da_cota}
            formato={(n) => reais(n)}
            tom={r.valor_da_cota < 0 ? "sobe" : "marca"}
            nota={
              <>
                É o crédito de {reais(e.credito, 0)} em valor de hoje ({reais(r.vp_credito)}) menos as {e.parcelas} parcelas em valor de hoje ({reais(r.vp_parcelas)}). Equivale a <strong>{num(r.pct_do_credito, 1)}%</strong> do crédito.
              </>
            }
          />
          <BarraDoResultado rotulo="A cota vale" valor={reais(r.valor_da_cota)} />
          {e.temPreco ? <VeredictoDoPreco valorJusto={r.valor_da_cota} preco={e.preco} custos={e.custos} rotuloDoJusto="o valor da cota" /> : null}
          {agio ? (
            <div className="rounded-2xl border border-linha bg-folha p-4">
              <h3 className="m-0 mb-1 font-sans text-sm font-semibold text-tinta">O ágio pedido, nas duas bases</h3>
              <p className="m-0 text-[0.9rem] leading-snug text-tinta2">
                O percentual de ágio muda conforme a base de cálculo: o preço pedido é <strong className="num">{num(agio.sobre_credito_pct, 1)}%</strong> do crédito e <strong className="num">{num(agio.sobre_saldo_pct, 1)}%</strong> do saldo devedor. Quem compra paga, no total, <strong className="num">{reais(agio.custo_total, 0)}</strong> (saldo devedor + preço + custos), sem desconto no tempo.
              </p>
            </div>
          ) : null}
          <Aviso extrapolado={r.extrapolado} curva={curvas.real} />
          <div className="folha min-w-0 p-4 md:p-5">
            <h3 className="m-0 font-sans text-[0.95rem] font-semibold text-tinta">O valor da cota conforme o mês da contemplação</h3>
            <p className="m-0 mb-3 mt-0.5 text-[0.8125rem] text-tinta3">Quanto antes a carta é contemplada, mais vale a cota. O ponto marca o mês que você escolheu.</p>
            <div className="h-[15rem] w-full" role="img" aria-label={`Valor da cota por mês de contemplação: ${r.cenarios.map((c: any) => `mês ${c.contemplacao}: ${reais(c.valor_da_cota, 0)}`).join("; ")}.`}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={r.cenarios} margin={{ top: 12, right: 14, bottom: 0, left: 0 }}>
                  <CartesianGrid {...GRADE} />
                  <XAxis dataKey="contemplacao" type="number" domain={[0, "dataMax"]} {...EIXO} tickFormatter={(v: number) => (v === 0 ? "já" : `${v}`)} label={{ value: "meses até a contemplação", position: "insideBottom", offset: -2, fill: "var(--tinta-3)", fontSize: 12 }} height={42} />
                  <YAxis {...EIXO} axisLine={false} width={56} tickFormatter={(v: number) => `${numComMenos(v / 1000, 0)} mil`} />
                  <Tooltip
                    cursor={{ stroke: "var(--linha-2)" }}
                    content={({ active, payload }) => {
                      const d = active && (payload?.[0]?.payload as any);
                      if (!d) return null;
                      return <Balao titulo={d.contemplacao === 0 ? "Já contemplada" : `Contemplada em ${prazoEmTexto(d.contemplacao)}`} linhas={[{ cor: COR.s1, nome: "Valor da cota", valor: reais(d.valor_da_cota), destaque: true }, { cor: COR.s1, nome: "% do crédito", valor: `${num(d.pct_do_credito, 1)}%` }]} />;
                    }}
                  />
                  <Line dataKey="valor_da_cota" stroke={COR.s1} strokeWidth={3} dot={{ r: 4, fill: COR.s1, stroke: "var(--folha)", strokeWidth: 2 }} activeDot={{ r: 6, stroke: "var(--folha)", strokeWidth: 2 }} isAnimationActive={animar} />
                  <ReferenceDot x={k} y={r.valor_da_cota} r={8} fill="var(--folha)" stroke={COR.s2} strokeWidth={3} ifOverflow="extendDomain" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <ESe titulo="E se o spread de risco fosse outro?" linhas={r.spreads.map((s: any) => ({ rotulo: `${num(s.spread, 1)} p.p.`, valor: s.valor_da_cota, texto: reais(s.valor_da_cota, 0), atual: s.spread === spread, extra: `${num(s.pct_do_credito, 0)}%` }))} />
          <AcoesDaConta resumo={resumo} aoVoltar={volta} />
          <ComoFoiCalculado>
            <p className="m-0">Crédito e parcelas são corrigidos pelo mesmo índice, então tudo é descontado pela curva do Tesouro IPCA+ mais o spread de {num(spread, 1)} p.p., e o resultado fica em reais de hoje.</p>
            <p className="m-0 mt-2 num">
              Valor da cota = crédito ÷ (1 + taxa)<sup>{k}/12</sup> − Σ parcela ÷ (1 + taxa)<sup>mês/12</sup> = {reais(r.vp_credito)} − {reais(r.vp_parcelas)} = <strong>{reais(r.valor_da_cota)}</strong>.
            </p>
            <p className="m-0 mt-2 text-tinta3">
              Total de parcelas sem desconto: {reais(r.total_das_parcelas, 0)}. Um aumento do spread desconta o crédito <em>e</em> as parcelas, e o efeito líquido depende do prazo: nem sempre derruba o valor da cota. Demonstração: não considera lance, seguro, fundo de reserva nem as regras de cada grupo.
            </p>
          </ComoFoiCalculado>
        </>
      ) : (
        <Nota tom="info">Preencha o crédito, a parcela e os prazos para ver o valor da cota. A contemplação não pode passar do número de parcelas.</Nota>
      )}
    </Moldura>
  );
}
