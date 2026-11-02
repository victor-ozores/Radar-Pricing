// A leitura do dia em português simples, montada só com números da foto: o número grande do topo e as três frases
// do "resumo de hoje". Nenhuma frase afirma o que não está nos dados.

import { anosDoPrazo, impactoNoPrazo, interpola } from "./calc.js";
import { mesAno, num, pct, pp, prazoEmTexto, reais, sinal } from "./formato.js";
import * as modelo from "./modelo.js";

/** O prazo da lista que fica mais perto de 3 anos: o do exemplo do "o que mudou". */
export function prazoDeReferencia(prazos) {
  return prazos.reduce((a, b) => (Math.abs(b - 36) < Math.abs(a - 36) ? b : a));
}

const arredonda2 = (x) => Math.round(x * 100) / 100;
const palavraDoMovimento = (delta) => (delta > 0 ? "subiram" : "caíram");

/**
 * O número grande do topo: quanto mudou, em 7 dias, o valor de hoje de um valor a receber em ~3 anos (em R$ fixos).
 * Sem a comparação de 7 dias, mostra a taxa do dia. Devolve null se a foto não tem a curva prefixada.
 */
export function heroDoDia(estado) {
  const { parametros: par, curvas, spread } = estado;
  const curva = curvas.nominal;
  if (!curva) return null;
  const meses = prazoDeReferencia(par.prazos_meses);
  const r = impactoNoPrazo(curva, meses, spread, par.valor_face);
  const prazo = prazoEmTexto(meses);
  if (!r) {
    const [taxa] = interpola(curva.pontos, anosDoPrazo(curva, meses));
    return { numero: pct(taxa), sentido: "neutro", legenda: `ao ano é a taxa do Tesouro para ${prazo} (em R$ fixos)`, antes: null, hoje: null, porque: "Esta foto não traz a taxa de 7 dias atrás, então não há comparação." };
  }
  const delta = r.taxa_hoje - r.taxa_antes;
  const sentido = Math.abs(r.variacao_pct) < 0.05 ? "igual" : r.variacao_pct < 0 ? "caiu" : "subiu";
  return {
    numero: `${sinal(r.variacao_pct, 1)}%`,
    sentido,
    legenda: `em ${r.dias} dias, no valor de hoje de ${reais(par.valor_face, 0)} a receber em ${prazo} (em R$ fixos)`,
    antes: reais(r.vp_antes),
    hoje: reais(r.vp_hoje),
    porque: `Os juros do Tesouro para ${prazo} ${Math.abs(delta) < 0.005 ? "ficaram onde estavam" : `${palavraDoMovimento(delta)} de ${pct(r.taxa_antes)} para ${pct(r.taxa_hoje)} ao ano`}. ${delta > 0 ? "Juros mais altos descontam mais o dinheiro que só chega no futuro." : delta < 0 ? "Juros mais baixos descontam menos o dinheiro que só chega no futuro." : ""}`.trim(),
    meses,
    delta,
  };
}

function frasesDoTesouro(estado) {
  const { parametros: par, curvas, spread } = estado;
  const meses = prazoDeReferencia(par.prazos_meses);
  const partes = [];
  for (const [id, texto] of [["nominal", "em R$ fixos"], ["real", "acima do IPCA"]]) {
    const curva = curvas[id];
    if (!curva) continue;
    const r = impactoNoPrazo(curva, meses, spread, par.valor_face);
    // a diferença sai dos números como aparecem na frase (duas casas): quem subtrai os dois acha o mesmo resultado
    if (r) partes.push(`de ${pct(r.taxa_antes)} para ${pct(r.taxa_hoje)} ao ano ${texto} (${pp(arredonda2(r.taxa_hoje) - arredonda2(r.taxa_antes))})`);
    else partes.push(`${pct(interpola(curva.pontos, anosDoPrazo(curva, meses))[0])} ao ano ${texto}`);
  }
  if (partes.length === 0) return null;
  return `Tesouro de ${prazoEmTexto(meses)}: ${partes.join(" e ")}.`;
}

function fraseDoCredito(foto) {
  const { imobiliario, veiculos } = modelo.creditos(foto);
  const partes = [];
  if (imobiliario) partes.push(`financiar um imóvel custa ${pct(imobiliario.resumo.mediana)} ao ano na mediana de ${imobiliario.n} bancos`);
  if (veiculos) partes.push(`um veículo, ${pct(veiculos.resumo.mediana)} (${veiculos.n} bancos)`);
  if (partes.length === 0) return null;
  const frase = partes.join("; ");
  return `${frase.charAt(0).toUpperCase()}${frase.slice(1)}. É o crédito que concorre com o consórcio.`;
}

/** Procura uma métrica do Panorama pelo texto da descrição. */
export function metricaDoPanorama(foto, regex) {
  return (foto.derivados.setor ?? []).find((l) => regex.test(l.descricao)) ?? null;
}

function fraseDoSetor(foto) {
  const inad = metricaDoPanorama(foto, /Índice de Inadimplência - Total/i);
  const excl = metricaDoPanorama(foto, /Índice de Exclusão - Total/i);
  const partes = [];
  if (inad) partes.push(`a inadimplência está em ${pct(inad.valor)} (${pp(inad.delta)} no trimestre)`);
  if (excl) partes.push(`o índice de exclusão, em ${pct(excl.valor)} (${pp(excl.delta)})`);
  if (partes.length === 0) return null;
  const quando = (inad ?? excl).data;
  return `No consórcio, ${partes.join(" e ")}. Dados de ${mesAno(quando)}, do Banco Central.`;
}

/** As frases do "resumo de hoje": [{ icone, texto }], só as que a foto permite. */
export function leituraDoDia(estado) {
  const frases = [
    { icone: "tendencia", texto: frasesDoTesouro(estado) },
    { icone: "banco", texto: fraseDoCredito(estado.foto) },
    { icone: "grupo", texto: fraseDoSetor(estado.foto) },
  ];
  return frases.filter((f) => f.texto);
}

/** "Em 7 dias, a curva toda subiu de +0,51 p.p. (6 meses) a +2,24 p.p. (4 anos)": a ideia do gráfico das curvas. */
export function fraseDaCurva(estado, id = "nominal") {
  const { parametros: par, curvas, spread } = estado;
  const curva = curvas[id];
  if (!curva) return null;
  const linhas = par.prazos_meses.map((m) => impactoNoPrazo(curva, m, spread, par.valor_face)).filter(Boolean);
  if (linhas.length < 2) return null;
  const mudancas = linhas.map((l) => l.taxa_hoje - l.taxa_antes);
  const primeira = linhas[0];
  const ultima = linhas.at(-1);
  const todasSobem = mudancas.every((d) => d > 0.005);
  const todasCaem = mudancas.every((d) => d < -0.005);
  const verbo = todasSobem ? "subiu" : todasCaem ? "caiu" : "mexeu";
  return `Em ${primeira.dias} dias, a curva ${verbo}: ${pp(mudancas[0])} em ${prazoEmTexto(primeira.meses)} e ${pp(mudancas.at(-1))} em ${prazoEmTexto(ultima.meses)}.`;
}

/** A frase do gráfico de barras: em qual prazo o valor mais mudou. */
export function fraseDasBarras(estado, id = "nominal") {
  const { parametros: par, curvas, spread } = estado;
  const curva = curvas[id];
  if (!curva) return null;
  const linhas = par.prazos_meses.map((m) => impactoNoPrazo(curva, m, spread, par.valor_face)).filter(Boolean);
  if (linhas.length === 0) return null;
  const maior = linhas.reduce((a, b) => (Math.abs(b.variacao_pct) > Math.abs(a.variacao_pct) ? b : a));
  const menor = linhas.reduce((a, b) => (Math.abs(b.variacao_pct) < Math.abs(a.variacao_pct) ? b : a));
  if (maior === menor) return `Em ${prazoEmTexto(maior.meses)}, o valor mudou ${sinal(maior.variacao_pct, 1)}%.`;
  const cresce = linhas.every((l, i) => i === 0 || Math.abs(l.variacao_pct) >= Math.abs(linhas[i - 1].variacao_pct));
  const intervalo = `${sinal(menor.variacao_pct, 1)}% em ${prazoEmTexto(menor.meses)} e ${sinal(maior.variacao_pct, 1)}% em ${prazoEmTexto(maior.meses)}`;
  return cresce ? `Quanto mais longe o prazo, maior o efeito: ${intervalo}.` : `O valor mudou ${intervalo}.`;
}


// --------------------------------------------------------------------------------------------- frases da aba Mercado
/** "Prefixado: de 13,45% em 0,2 anos a 15,17% em 5,2 anos. IPCA+: ..." (curvas de modelo.curvas()). */
export function fraseDasCurvas(curvas) {
  const partes = curvas
    .filter((c) => c.pontos.length > 1)
    .map((c) => {
      const pts = [...c.pontos].sort((a, b) => a.anos - b.anos);
      const a = pts[0];
      const b = pts.at(-1);
      return `${c.nome}: de ${pct(a.taxa)} em ${num(a.anos, 1)} anos a ${pct(b.taxa)} em ${num(b.anos, 1)} anos`;
    });
  return partes.length ? `${partes.join(". ")}.` : null;
}

/** O que o Focus espera para a Selic e o IPCA do primeiro ao último ano (de modelo.focus()). */
export function fraseDoFocus(foco) {
  const parte = (lista, nome) => {
    const l = [...lista].sort((a, b) => a.ano - b.ano);
    if (l.length < 2) return null;
    return `${nome} em ${pct(l[0].valor)} no fim de ${l[0].ano} e ${pct(l.at(-1).valor)} em ${l.at(-1).ano}`;
  };
  const partes = [parte(foco.selic, "a Selic"), parte(foco.ipca, "o IPCA")].filter(Boolean);
  return partes.length ? `O mercado espera ${partes.join("; ")}.` : null;
}

/** A diferença entre financiar um veículo e um imóvel (de modelo.creditos()). */
export function fraseDoCreditoComparado({ imobiliario, veiculos }) {
  if (!imobiliario || !veiculos) return null;
  const dif = veiculos.resumo.mediana - imobiliario.resumo.mediana;
  const mais = dif >= 0 ? "mais caro" : "mais barato";
  return `Pela mediana, financiar um veículo (${pct(veiculos.resumo.mediana)}) é ${num(Math.abs(dif), 1)} p.p. ${mais} que financiar um imóvel (${pct(imobiliario.resumo.mediana)}).`;
}

/** Em que segmento mais cotas foram excluídas no trimestre (de modelo.cotasDoSetor()). */
export function fraseDasExcluidas(cotas) {
  if (!cotas?.excluidas || cotas.porSegmento.length === 0) return null;
  const total = cotas.excluidas.delta;
  const [primeiro] = cotas.porSegmento;
  if (!(total > 0) || !(primeiro.delta > 0)) return null;
  return `No trimestre, ${num(total, 0)} mil cotas foram excluídas. ${primeiro.segmento} concentra ${num((primeiro.delta / total) * 100, 0)}% disso (${num(primeiro.delta, 0)} mil).`;
}
