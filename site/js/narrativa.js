// A história do briefing: a manchete e a frase que cada capítulo defende, montadas só com números da foto.
// Regra: uma frase só diz o que os dados mostram. Sem dado, a função devolve null e o capítulo usa um título neutro.

import { anosDoPrazo, impactoNoPrazo, interpola } from "./calc.js";
import { num, pct, pp, prazoEmTexto } from "./formato.js";
import { prazoDeReferencia } from "./leitura.js";
import * as modelo from "./modelo.js";

const SEM_MUDANCA = 0.05; // abaixo disto (em %), o valor "ficou praticamente igual"

/**
 * A manchete do topo: o que aconteceu com o valor de hoje de um dinheiro a receber em ~3 anos, em 7 dias.
 * `{ antes, destaque, depois, sentido }`: o `destaque` é o trecho que ganha o realce.
 */
export function manchetePrincipal(estado) {
  const { parametros: par, curvas, spread } = estado;
  const curva = curvas.nominal;
  if (!curva) return null;
  const meses = prazoDeReferencia(par.prazos_meses);
  const prazo = prazoEmTexto(meses);
  const r = impactoNoPrazo(curva, meses, spread, par.valor_face);
  if (!r) {
    const [taxa] = interpola(curva.pontos, anosDoPrazo(curva, meses));
    return { antes: `A taxa do Tesouro para ${prazo} é de `, destaque: `${pct(taxa)} ao ano`, depois: ".", sentido: "neutro" };
  }
  const pouco = Math.abs(r.variacao_pct) < SEM_MUDANCA;
  if (pouco) return { antes: `Um valor a receber em ${prazo} vale hoje `, destaque: "praticamente o mesmo", depois: ` que há ${r.dias} dias.`, sentido: "igual" };
  const menos = r.variacao_pct < 0;
  return {
    antes: `Um valor a receber em ${prazo} vale hoje `,
    destaque: `${num(Math.abs(r.variacao_pct), 1)}% ${menos ? "menos" : "mais"}`,
    depois: ` do que valia há ${r.dias} dias.`,
    sentido: menos ? "caiu" : "subiu",
  };
}

/** Maior mexida (em módulo) das taxas de uma curva em 7 dias, e se as pontas curta e longa andaram em proporções bem diferentes. */
function mexidaDaCurva(curva) {
  const pontos = [...curva.pontos].filter((p) => p.d7 !== null && p.d7 !== undefined).sort((a, b) => a.anos - b.anos);
  if (pontos.length < 2) return null;
  const deltas = pontos.map((p) => p.d7);
  const maior = deltas.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a));
  const sobem = deltas.every((d) => d > 0.005);
  const caem = deltas.every((d) => d < -0.005);
  const curta = deltas[0];
  const longa = deltas.at(-1);
  const maisNaLonga = (sobem || caem) && Math.abs(longa) >= 2 * Math.abs(curta);
  return { maior, sobem, caem, curta, longa, maisNaLonga, primeiro: pontos[0], ultimo: pontos.at(-1) };
}

/** A frase do capítulo da curva do Tesouro. */
export function fraseDoCapituloDaCurva(curvas) {
  const lista = curvas.filter((c) => c.pontos.length > 1);
  const nominal = lista.find((c) => c.id === "nominal") ?? lista[0];
  if (!nominal) return null;
  const m = mexidaDaCurva(nominal);
  if (!m) return null;
  if (Math.abs(m.maior) < 0.005) return `As taxas do Tesouro ${nominal.nome} ficaram onde estavam em 7 dias.`;
  const verbo = m.sobem ? "subiram" : m.caem ? "caíram" : "mexeram";
  const ate = m.sobem || m.caem ? `até ${pp(Math.abs(m.maior)).replace(/^\+/, "")}` : `entre ${pp(Math.min(...nominal.pontos.map((p) => p.d7 ?? 0)))} e ${pp(Math.max(...nominal.pontos.map((p) => p.d7 ?? 0)))}`;
  const onde = m.maisNaLonga ? ", bem mais nos prazos longos do que nos curtos" : "";
  return `As taxas do Tesouro ${nominal.nome} ${verbo} ${ate} em 7 dias${onde}.`;
}

/** A frase do capítulo do custo do dinheiro: a Selic de hoje e o que o Focus espera lá na frente. */
export function fraseDoCapituloDoCusto(foto) {
  const manchete = modelo.manchetes(foto);
  const meta = manchete.find((m) => m.id === "selic_meta");
  const foco = modelo.focus(foto).selic.filter((s) => s.ano > Number(foto.data.slice(0, 4)));
  if (!meta) return null;
  if (foco.length === 0) return `A Selic está em ${pct(meta.valor)} ao ano.`;
  const alvo = foco[0];
  const sentido = alvo.valor < meta.valor - 0.005 ? "menor" : alvo.valor > meta.valor + 0.005 ? "maior" : "igual";
  const lugar = sentido === "igual" ? `igual, ${pct(alvo.valor)},` : `${sentido}, ${pct(alvo.valor)},`;
  return `A Selic está em ${pct(meta.valor)} ao ano; o mercado espera uma Selic ${lugar} no fim de ${alvo.ano}.`;
}

/** A frase do capítulo do crédito concorrente. */
export function fraseDoCapituloDoCredito(creditos) {
  const { imobiliario, veiculos } = creditos;
  if (imobiliario && veiculos) {
    const dif = veiculos.resumo.mediana - imobiliario.resumo.mediana;
    const quem = dif >= 0 ? "veículo" : "imóvel";
    return `Financiar um ${quem} custa ${num(Math.abs(dif), 1)} p.p. a mais por ano que financiar um ${dif >= 0 ? "imóvel" : "veículo"}, pela mediana dos bancos.`;
  }
  const so = imobiliario ?? veiculos;
  return so ? `A mediana dos bancos para este financiamento é ${pct(so.resumo.mediana)} ao ano.` : null;
}

/** A frase do capítulo do setor. */
export function fraseDoCapituloDoSetor(cotas) {
  const valor = cotas?.indice?.valor ?? cotas?.calculado;
  if (valor === null || valor === undefined) return null;
  return `De cada 100 cotas do consórcio (ativas e excluídas), ${num(valor, 0)} já saíram do grupo.`;
}
