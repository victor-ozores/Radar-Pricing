import { useMemo } from "react";
import { EXEMPLOS, retornoDaOferta } from "../../../js/calc.js";
import { dataBR, num, pct, prazoEmTexto, reais } from "../../../js/formato.js";
import { mesesDaConta, usePersistido } from "../../calc/memoria";
import { useEstado } from "../../dados";
import { Campo } from "../../ui/blocos";
import { Delta } from "../../ui/Delta";
import { Termo } from "../../ui/dicas";
import { AcoesDaConta, Aviso, BarraDoResultado, CampoDePrazo, ComoFoiCalculado, Interruptor, Moldura, Nota, Resultado, SpreadDaConta } from "./pecas";

const EXEMPLO = { ...EXEMPLOS.retorno, prazoEmData: false, prazoData: "", alvoAtivo: false, alvo: 12, custos: 0, usarSpread: false, spread: 5 };

export function Oferta() {
  const { curvas, spread: geral, foto, parametros } = useEstado();
  const [e, muda, volta] = usePersistido("oferta", EXEMPLO);
  const spread = e.usarSpread ? e.spread : geral;
  const meses = mesesDaConta(e, foto.data);
  const cdi = foto.derivados.ancoras.cdi_anualizado?.taxa ?? null;
  const r = useMemo(
    () => (meses ? retornoDaOferta({ preco: e.preco, valor: e.valor, meses, corrigido: e.corrigido, alvoPct: e.alvoAtivo ? e.alvo : NaN, spreadPP: spread, custos: e.custos }, curvas, cdi ?? NaN) : null),
    [e.preco, e.valor, meses, e.corrigido, e.alvoAtivo, e.alvo, spread, e.custos, curvas, cdi],
  );
  const cabe = r ? r.folga >= 0 : false;
  const resumo = () =>
    [
      `Radar Pricing · Retorno de uma oferta · foto de ${dataBR(foto.data)}`,
      `Pagando ${reais(e.preco, 0)}${e.custos > 0 ? ` + ${reais(e.custos, 0)} de custos` : ""} para receber ${reais(e.valor, 0)} em ${prazoEmTexto(meses ?? 0)} (${e.corrigido ? "corrigido pela inflação" : "sem correção"})`,
      r ? `Retorno: ${num(r.retorno_aa, 2)}% ao ano (ganho total de ${num(r.retorno_total, 1)}%)` : "Sem resultado para estes dados",
      r ? `Para ${num(r.alvo, 2)}% ao ano${r.alvo_padrao ? ` (Tesouro + spread de ${num(spread, 1)} p.p.${spread === parametros.spread_demonstracao_pp ? ", exemplo" : ""})` : ""}, o preço máximo é ${reais(r.preco_maximo)}: ${cabe ? "a oferta cabe" : "a oferta não cabe"}` : "",
      "Demonstração com premissas públicas: não é preço nem recomendação. victor-ozores.github.io/Radar-Pricing",
    ]
      .filter(Boolean)
      .join("\n");
  return (
    <Moldura
      campos={
        <>
          <Campo rotulo="Preço da oferta" valor={e.preco} aoMudar={(v) => muda({ preco: v })} prefixo="R$" min={1} max={1e9} ajuda="O quanto você pagaria hoje." />
          <Campo rotulo="Custos de transferência" valor={e.custos} aoMudar={(v) => muda({ custos: v })} prefixo="R$" min={0} max={1e9} ajuda="Taxa da administradora, cartório e o que mais sair do bolso. Deixe 0 se não houver." />
          <Campo rotulo="Valor que vai receber" valor={e.valor} aoMudar={(v) => muda({ valor: v })} prefixo="R$" min={1} max={1e9} ajuda="O que o grupo devolve no fim." />
          <CampoDePrazo rotulo="Quando recebe" e={e} muda={muda} baseIso={foto.data} />
          <Interruptor ligado={e.corrigido} aoMudar={(v) => muda({ corrigido: v })} rotulo="Corrigido pela inflação" ajuda={e.corrigido ? "O retorno é acima da inflação." : "O retorno é em reais fixos, sem correção."} />
          <div className="flex flex-col gap-3 rounded-xl bg-folha2 p-3">
            <Interruptor ligado={e.alvoAtivo} aoMudar={(v) => muda({ alvoAtivo: v })} rotulo="Tenho um retorno que quero" ajuda={e.alvoAtivo ? "Define o preço máximo ao lado." : "Sem isso, uso a taxa do Tesouro do prazo mais o spread."} />
            {e.alvoAtivo ? <Campo rotulo="Retorno desejado" valor={e.alvo} aoMudar={(v) => muda({ alvo: v })} sufixo="% a.a." min={0} max={100} casas={2} passo={0.5} /> : null}
          </div>
          <SpreadDaConta e={e} muda={muda} />
        </>
      }
    >
      {r && meses ? (
        <>
          <Resultado
            rotulo="Esta oferta rende"
            valor={r.retorno_aa}
            formato={(n) => `${num(n, 2)}% ao ano`}
            nota={
              <>
                Pagando {reais(r.pago, 0)}{e.custos > 0 ? " (com os custos)" : ""} para receber {reais(e.valor, 0)} em {prazoEmTexto(meses)}, o ganho total é de {num(r.retorno_total, 1)}%{e.corrigido ? ", acima da inflação" : ""}. O <Termo id="desagio">deságio</Termo> é de {num((1 - e.preco / e.valor) * 100, 1)}%{e.custos > 0 ? ` sobre o preço (${num((1 - r.pago / e.valor) * 100, 1)}% contando os custos)` : ""}.
              </>
            }
          />
          <BarraDoResultado rotulo="Rende" valor={`${num(r.retorno_aa, 2)}% a.a.`} />
          <div className={`rounded-2xl border p-4 ${cabe ? "border-ok/30 bg-ok2" : "border-aviso/40 bg-aviso2"}`}>
            <p className="rotulo m-0">Para um retorno de {num(r.alvo, 2)}% ao ano{r.alvo_padrao ? " (Tesouro + spread)" : ""}</p>
            <p className="m-0 mt-1 text-[0.97rem] leading-snug text-tinta">
              O preço máximo é <strong className="num">{reais(r.preco_maximo)}</strong>{e.custos > 0 ? " (já separando os custos)" : ""}. {cabe ? `A oferta está ${reais(r.folga)} abaixo disso: cabe no alvo.` : `A oferta está ${reais(Math.abs(r.folga))} acima disso: não chega no alvo.`}
            </p>
          </div>
          <div className="rounded-2xl border border-linha bg-folha p-4">
            <h3 className="m-0 mb-2 font-sans text-sm font-semibold text-tinta">Contra as referências de hoje</h3>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {r.referencias.map((ref: any) => (
                <li key={ref.nome} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-tinta2">{ref.nome}</span>
                  <span className="flex items-center gap-3">
                    <span className="num font-semibold text-tinta">{pct(ref.taxa)}</span>
                    <Delta valor={ref.diferenca_pp} tamanho="p" periodo="a oferta" />
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <Aviso extrapolado={r.extrapolado} curva={e.corrigido ? curvas.real : curvas.nominal} />
          <AcoesDaConta resumo={resumo} aoVoltar={volta} />
          <ComoFoiCalculado>
            <p className="m-0 num">
              Retorno = ({reais(e.valor, 0)} ÷ {reais(r.pago, 0)})<sup>12/{meses}</sup> − 1 = <strong>{pct(r.retorno_aa, 4)}</strong> ao ano.
            </p>
            <p className="m-0 mt-2 num">
              Máximo que pode sair do bolso = {reais(e.valor, 0)} ÷ (1 + {num(r.alvo, 2)}%)<sup>{meses}/12</sup> = {reais(r.preco_maximo + e.custos)}; menos os custos de {reais(e.custos, 0)}, o preço máximo é <strong>{reais(r.preco_maximo)}</strong>.
            </p>
            <p className="m-0 mt-2 text-tinta3">Demonstração: o alvo padrão é a taxa do Tesouro para o prazo ({pct(r.taxa_ancora)}) mais o spread de {num(spread, 1)} p.p. Não considera imposto nem o risco de a administradora atrasar.</p>
          </ComoFoiCalculado>
        </>
      ) : (
        <Nota tom="info">{meses === null ? "Informe um prazo de 1 a 360 meses (ou uma data futura)." : "Preencha o preço, o valor a receber e o prazo para ver o retorno."}</Nota>
      )}
    </Moldura>
  );
}
