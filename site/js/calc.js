// As contas do painel. A primeira parte repete src/radar_pricing/derivados.py (interpola, valor_presente,
// monta_tabela); tests/test_site.py compara os dois lados ao centavo com uma foto de verdade. A segunda parte são
// as calculadoras (cota cancelada, retorno de uma oferta, cota ativa): modelos simples de DEMONSTRAÇÃO, só com o que
// a pessoa digita e as curvas do dia. Taxas em % ao ano (efetivas); capitalização composta. O prazo de um valor a
// receber daqui a N meses é contado como o Tesouro conta: dias úteis da data-base da curva até o mesmo dia N meses
// depois, divididos por 252 (js/prazo.js). Só o que segue um índice por calendário (a correção mês a mês do precatório,
// a taxa própria de correção) continua em meses corridos, 1 mês = 1/12 de ano.

import { DIAS_UTEIS_NO_ANO, diasUteisDoPrazo } from "./prazo.js";

/**
 * Taxa para o prazo `anos` por interpolação linear entre os dois vencimentos vizinhos.
 * Fora da curva usa a taxa da ponta mais próxima e avisa que extrapolou.
 * @returns {[number, boolean]} [taxa, extrapolado]
 */
export function interpola(pontos, anos) {
  const primeiro = pontos[0];
  const ultimo = pontos[pontos.length - 1];
  if (anos <= primeiro.anos) return [primeiro.taxa, anos < primeiro.anos];
  if (anos >= ultimo.anos) return [ultimo.taxa, anos > ultimo.anos];
  for (let i = 0; i < pontos.length - 1; i++) {
    const a = pontos[i];
    const b = pontos[i + 1];
    if (a.anos <= anos && anos <= b.anos) {
      const peso = (anos - a.anos) / (b.anos - a.anos);
      return [a.taxa + peso * (b.taxa - a.taxa), false];
    }
  }
  throw new Error("prazo dentro da curva sem par de vencimentos vizinhos");
}

/** Valor de hoje de `valor` recebido daqui a `anos` (anos de 252 dias úteis); taxa efetiva ao ano, capitalização composta. */
export function valorPresente(valor, taxaPct, anos) {
  return valor / (1 + taxaPct / 100) ** anos;
}

const ehData = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** A curva serve para as contas: tem vencimentos e a data-base de onde o prazo é contado. */
export const curvaUsavel = (c) => Boolean(c && c.pontos && c.pontos.length > 0 && ehData(c.base));

/** Dias úteis de hoje (a data-base da curva) até o mesmo dia `meses` depois. */
export const diasDoPrazo = (curva, meses) => diasUteisDoPrazo(curva.base, meses);

/** O prazo em anos de 252 dias úteis: o que se interpola na curva e o expoente do desconto. */
export const anosDoPrazo = (curva, meses) => diasDoPrazo(curva, meses) / DIAS_UTEIS_NO_ANO;

/** Arredonda pelo valor binário exato, como o `round` do Python. Só um empate exato (0,125) sai diferente
 *  (JS sobe, Python vai para o par), e as contas de desconto não caem em empate. */
export function arredonda(x, casas) {
  return Number(x.toFixed(casas));
}

/**
 * Uma linha da tabela da foto: taxa da âncora, taxa de desconto (âncora + spread) e os dois valores presentes,
 * arredondados como o robô arredonda. `curva` é um item de derivados.ancoras; null se a foto não tem a curva.
 */
export function desconta(curva, valorFace, meses, spreadPP) {
  if (!curvaUsavel(curva)) return null;
  const dias = diasDoPrazo(curva, meses);
  const anos = dias / DIAS_UTEIS_NO_ANO;
  const [taxa, extrapolado] = interpola(curva.pontos, anos);
  const demo = taxa + spreadPP;
  return {
    dias_uteis: dias,
    taxa_ancora: arredonda(taxa, 4),
    taxa_demonstracao: arredonda(demo, 4),
    vp_ancora: arredonda(valorPresente(valorFace, taxa, anos), 2),
    vp_demonstracao: arredonda(valorPresente(valorFace, demo, anos), 2),
    extrapolado,
  };
}

// --------------------------------------------------------------------------------------------- hoje contra 7 dias atrás
/** A curva de 7 dias atrás, montada com a taxa de referência que a foto guarda em cada vencimento (`ref7`). */
export function curvaDeSeteDiasAtras(curva) {
  if (!curva || curva.pontos.length === 0 || curva.pontos.some((p) => p.ref7 == null)) return null;
  return { ...curva, pontos: curva.pontos.map((p) => ({ ...p, taxa: p.ref7 })) };
}

/**
 * O que mudou no preço de um valor a receber em `meses`: o valor presente hoje contra o de 7 dias atrás, na mesma
 * taxa de risco (spread). `curva` vem de modelo.curvas(). Devolve null se a foto não permite comparar.
 */
export function impactoNoPrazo(curva, meses, spreadPP, valor = 1000) {
  const antes = curvaDeSeteDiasAtras(curva);
  if (!antes || !curvaUsavel(curva)) return null;
  const anos = anosDoPrazo(curva, meses);
  const [taxaHoje] = interpola(curva.pontos, anos);
  const [taxaAntes] = interpola(antes.pontos, anos);
  const vpHoje = valorPresente(valor, taxaHoje + spreadPP, anos);
  const vpAntes = valorPresente(valor, taxaAntes + spreadPP, anos);
  return {
    meses,
    dias: curva.pontos[0].dias7 ?? 7,
    taxa_hoje: taxaHoje,
    taxa_antes: taxaAntes,
    vp_hoje: vpHoje,
    vp_antes: vpAntes,
    variacao_pct: (vpHoje / vpAntes - 1) * 100,
  };
}

// --------------------------------------------------------------------------------------------- calculadoras
const positivo = (x) => Number.isFinite(x) && x > 0;

function escolheCurva(curvas, corrigido) {
  const c = corrigido ? curvas.real : curvas.nominal;
  return curvaUsavel(c) ? c : null;
}

const mesesInteiros = (m) => Number.isInteger(m) && m >= 1;

/**
 * Cota cancelada: a administradora devolve `valor` daqui a `meses` (no fim do grupo). Quanto isso vale hoje?
 * Três jeitos de tratar a correção até a data:
 *  - `corrigido`: o valor sobe com a inflação (curva IPCA+, resultado em reais de hoje);
 *  - `correcaoPct` (% ao ano, o índice do bem: INCC, tabela FIPE, o que a pessoa quiser): o valor de hoje cresce a essa
 *    taxa até a data e é descontado pela curva Prefixada mais o spread (prevalece sobre `corrigido`);
 *  - nenhum dos dois: o valor é fixo em reais e é descontado pela curva Prefixada.
 * Devolve também o mesmo cálculo em prazos vizinhos e com o spread um ponto abaixo e acima.
 */
export function cotaCancelada({ valor, meses, corrigido, correcaoPct = null, spreadPP }, curvas) {
  const propria = correcaoPct !== null && correcaoPct !== undefined;
  if (propria && !(Number.isFinite(correcaoPct) && correcaoPct > -100)) return null;
  const curva = escolheCurva(curvas, propria ? false : corrigido);
  if (!curva || !positivo(valor) || !mesesInteiros(meses) || !(spreadPP >= 0)) return null;
  const um = (m, s) => {
    const dias = diasDoPrazo(curva, m);
    const anos = dias / DIAS_UTEIS_NO_ANO;
    const [ancora, extrapolado] = interpola(curva.pontos, anos);
    const desconto = ancora + s;
    const noPagamento = propria ? valor * (1 + correcaoPct / 100) ** (m / 12) : valor;
    const vp = valorPresente(noPagamento, desconto, anos);
    return { meses: m, dias_uteis: dias, prazo_anos: anos, spread: s, taxa_ancora: ancora, taxa_desconto: desconto, valor_no_pagamento: noPagamento, valor_presente: vp, pct_do_valor: (vp / valor) * 100, extrapolado };
  };
  return {
    ...um(meses, spreadPP),
    prazos: [-12, -6, 0, 6, 12].map((d) => meses + d).filter((m) => m >= 1).map((m) => um(m, spreadPP)),
    spreads: [-1, 0, 1].map((d) => spreadPP + d).filter((s) => s >= 0).map((s) => um(meses, s)),
  };
}

/**
 * Retorno de uma oferta: pagando `preco` para receber `valor` daqui a `meses`, quanto rende ao ano? Compara com o
 * Tesouro do mesmo prazo (e o CDI, se não for corrigido pela inflação) e calcula o preço máximo para um retorno-alvo
 * (`alvoPct`; sem ele, usa a taxa do Tesouro no prazo + o spread). Corrigido: o retorno é acima da inflação.
 */
export function retornoDaOferta({ preco, valor, meses, corrigido, alvoPct, spreadPP, custos = 0 }, curvas, cdiAnualPct) {
  const curva = escolheCurva(curvas, corrigido);
  if (!curva || !positivo(preco) || !positivo(valor) || !mesesInteiros(meses) || !(spreadPP >= 0) || !(custos >= 0)) return null;
  const dias = diasDoPrazo(curva, meses);
  const anos = dias / DIAS_UTEIS_NO_ANO;
  const [ancora, extrapolado] = interpola(curva.pontos, anos);
  const pago = preco + custos; // o que sai do bolso: o preço e os custos de transferência
  const retorno = ((valor / pago) ** (1 / anos) - 1) * 100; // ao ano de 252 dias úteis, como as taxas do Tesouro
  const alvo = Number.isFinite(alvoPct) ? alvoPct : ancora + spreadPP;
  const precoMaximo = valor / (1 + alvo / 100) ** anos;
  const referencias = [{ nome: corrigido ? "Tesouro IPCA+ no prazo (acima do IPCA)" : "Tesouro Prefixado no prazo", taxa: ancora }];
  if (!corrigido && Number.isFinite(cdiAnualPct)) referencias.push({ nome: "CDI de hoje (anualizado)", taxa: cdiAnualPct });
  return {
    dias_uteis: dias,
    prazo_anos: anos,
    retorno_aa: retorno,
    retorno_total: (valor / pago - 1) * 100,
    pago,
    custos,
    taxa_ancora: ancora,
    extrapolado,
    alvo,
    alvo_padrao: !Number.isFinite(alvoPct),
    preco_maximo: precoMaximo - custos, // o máximo a oferecer, já separando os custos de transferência
    folga: precoMaximo - pago,
    referencias: referencias.map((r) => ({ ...r, diferenca_pp: retorno - r.taxa })),
  };
}

/** Os exemplos que já vêm preenchidos nas calculadoras do painel e do Excel (valores inventados, só para mostrar). */
export const EXEMPLOS = {
  cancelada: { valor: 50000, meses: 24, corrigido: true },
  retorno: { preco: 38000, valor: 50000, meses: 24, corrigido: true },
  ativa: { credito: 100000, parcela: 1900, parcelas: 60, contemplacao: 12 },
  precatorio: { valor: 100000, meses: 36, indice: "selic", jurosPP: 2, propriaPct: 8, retencaoPct: 0, desagioPct: 40 },
};

const CONTEMPLACOES_PADRAO = [0, 6, 12, 24, 36, 48, 60, 84, 120, 180];
export const MAX_PARCELAS = 240; // 20 anos: o maior prazo de um grupo de imóveis

/**
 * Cota ativa: o comprador recebe o crédito (`credito`) no mês `contemplacao` (0 = já contemplada) e paga as
 * `parcelas` que faltam (`parcela` por mês, no 1º, 2º... mês). Valor da cota = crédito descontado - parcelas
 * descontadas. Supõe crédito e parcela corrigidos pelo mesmo índice, então desconta tudo pela curva IPCA+ (mais o
 * spread) e o resultado fica em reais de hoje. Não considera probabilidade de contemplação, lance, seguro nem as
 * regras de cada grupo.
 */
export function cotaAtiva({ credito, parcela, parcelas, contemplacao, spreadPP }, curvaReal) {
  const curva = curvaUsavel(curvaReal) ? curvaReal : null;
  if (
    !curva || !positivo(credito) || !positivo(parcela) || !(spreadPP >= 0) ||
    !Number.isInteger(parcelas) || parcelas < 1 || parcelas > MAX_PARCELAS ||
    !Number.isInteger(contemplacao) || contemplacao < 0 || contemplacao > parcelas
  ) {
    return null;
  }
  let extrapolado = false;
  const fator = (m, s) => {
    const anos = anosDoPrazo(curva, m);
    const [ancora, ext] = interpola(curva.pontos, anos);
    extrapolado ||= ext;
    return (1 + (ancora + s) / 100) ** anos;
  };
  const vpDasParcelas = (s) => {
    let soma = 0;
    for (let t = 1; t <= parcelas; t++) soma += parcela / fator(t, s);
    return soma;
  };
  const vpDoCredito = (k, s) => (k === 0 ? credito : credito / fator(k, s));
  const valorDaCota = (k, s) => vpDoCredito(k, s) - vpDasParcelas(s);

  const vpParcelas = vpDasParcelas(spreadPP);
  const vpCredito = vpDoCredito(contemplacao, spreadPP);
  const ks = [...new Set([...CONTEMPLACOES_PADRAO.filter((k) => k <= parcelas), contemplacao])].sort((a, b) => a - b);
  return {
    valor_da_cota: vpCredito - vpParcelas,
    pct_do_credito: ((vpCredito - vpParcelas) / credito) * 100,
    vp_credito: vpCredito,
    vp_parcelas: vpParcelas,
    total_das_parcelas: parcela * parcelas,
    cenarios: ks.map((k) => ({ contemplacao: k, valor_da_cota: valorDaCota(k, spreadPP), pct_do_credito: (valorDaCota(k, spreadPP) / credito) * 100 })),
    spreads: [-1, 0, 1].map((d) => spreadPP + d).filter((s) => s >= 0).map((s) => ({ spread: s, valor_da_cota: valorDaCota(contemplacao, s), pct_do_credito: (valorDaCota(contemplacao, s) / credito) * 100 })),
    extrapolado,
  };
}

// --------------------------------------------------------------------------------------------- sensibilidade
export const CHOQUES_PP = [-3, -2, -1, 0, 1, 2, 3];

/**
 * E se a taxa do Tesouro andar `choque` pontos percentuais em todos os prazos? O valor de hoje de `valor` a receber
 * em cada prazo e quanto ele muda contra o dia de hoje (choque 0). `curva` vem de modelo.curvas().
 * @returns {{ meses: number, taxa: number, base: number, celulas: { choque: number, valor: number, variacao_pct: number }[] }[] | null}
 */
export function sensibilidade(curva, prazos, spreadPP, valor = 1000, choques = CHOQUES_PP) {
  if (!curvaUsavel(curva) || !positivo(valor) || !(spreadPP >= 0)) return null;
  return prazos.map((meses) => {
    const anos = anosDoPrazo(curva, meses);
    const [taxa] = interpola(curva.pontos, anos);
    const base = valorPresente(valor, taxa + spreadPP, anos);
    return {
      meses,
      taxa,
      base,
      celulas: choques.map((choque) => {
        const v = valorPresente(valor, Math.max(0, taxa + spreadPP + choque), anos);
        return { choque, valor: v, variacao_pct: (v / base - 1) * 100 };
      }),
    };
  });
}

// --------------------------------------------------------------------------------------------- avaliar um preço pedido
/**
 * Um preço pedido contra o valor justo da conta: o que sai do bolso (preço mais custos), a folga e o preço máximo.
 * Serve à cota cancelada e à cota ativa. `valorJusto` é o valor de hoje que a calculadora achou.
 */
export function avaliaPreco({ valorJusto, preco, custos = 0 }) {
  if (!Number.isFinite(valorJusto) || !positivo(preco) || !(custos >= 0)) return null;
  const pago = preco + custos;
  return { pago, custos, folga: valorJusto - pago, cabe: valorJusto - pago >= 0, preco_maximo: valorJusto - custos };
}

/**
 * O ágio de uma cota ativa vendida por `preco`, nas duas bases que o mercado usa (o percentual muda muito conforme a
 * base): sobre o crédito e sobre o saldo devedor (as parcelas que faltam, sem desconto). E o custo todo de quem compra:
 * saldo devedor + preço + custos de transferência.
 */
export function agioDaCota({ preco, custos = 0, credito, saldoDevedor }) {
  if (!positivo(preco) || !(custos >= 0) || !positivo(credito) || !positivo(saldoDevedor)) return null;
  return { sobre_credito_pct: (preco / credito) * 100, sobre_saldo_pct: (preco / saldoDevedor) * 100, custo_total: saldoDevedor + preco + custos };
}

// --------------------------------------------------------------------------------------------- lucro e situação
/** A folga abaixo disso, em % do que sai do bolso hoje, ainda é "no limite" (o preço quase não deixa margem). */
export const MARGEM_MINIMA_PCT = 5;

/**
 * O negócio em linguagem de lucro e prejuízo, igual para todas as calculadoras.
 *  - `pagoHoje`: o que sai do bolso hoje (preço mais custos de transferência);
 *  - `saidasFuturas`: o que ainda sai depois, sem descontar (as parcelas de uma cota ativa);
 *  - `recebe`: o que entra (valor a receber, crédito, precatório depois das retenções);
 *  - `valorJusto`: o valor de hoje do que entra, já descontado pela taxa exigida (Tesouro mais spread) e já sem as saídas
 *    futuras: o máximo que dá para pagar hoje e ainda ganhar o retorno exigido;
 *  - `anos`: o prazo até receber, em anos de 252 dias úteis (o `prazo_anos` das calculadoras), para o retorno ao ano.
 * `lucro` é em dinheiro, sem descontar nada. `folga` é o que sobra (ou falta) sobre o retorno exigido, em valor de hoje.
 * `situacao`: "ruim" (folga negativa: rende menos que o exigido), "limite" (folga menor que a margem mínima) ou "bom".
 * Pode haver lucro em dinheiro e mesmo assim "ruim": ganhar menos que o Tesouro mais o spread também é perder.
 * @returns {{ total_pago: number, lucro: number, lucro_pct: number, folga: number, folga_pct: number, retorno_aa: number | null, situacao: "bom" | "limite" | "ruim" } | null}
 */
export function leituraDoNegocio({ pagoHoje, saidasFuturas = 0, recebe, valorJusto, anos = /** @type {number | null} */ (null), margemPct = MARGEM_MINIMA_PCT }) {
  if (![pagoHoje, recebe, valorJusto].every(Number.isFinite) || !(pagoHoje > 0) || !(saidasFuturas >= 0) || !(margemPct >= 0)) return null;
  const totalPago = pagoHoje + saidasFuturas;
  const lucro = recebe - totalPago;
  const folga = valorJusto - pagoHoje;
  const folgaPct = (folga / pagoHoje) * 100;
  const comRetorno = saidasFuturas === 0 && Number.isFinite(anos) && anos > 0 && recebe > 0;
  return {
    total_pago: totalPago,
    lucro,
    lucro_pct: (lucro / totalPago) * 100,
    folga,
    folga_pct: folgaPct,
    retorno_aa: comRetorno ? ((recebe / pagoHoje) ** (1 / anos) - 1) * 100 : null,
    situacao: folga < 0 ? "ruim" : folgaPct < margemPct ? "limite" : "bom",
  };
}

// --------------------------------------------------------------------------------------------- precatório
export const INDICES_DE_CORRECAO = ["selic", "ipca", "propria", "nenhum"];
export const MAX_MESES_PRECATORIO = 360;

/**
 * Quanto um valor cresce até o pagamento. Selic e IPCA andam mês a mês pelo `caminho` (modelo.caminhoDeCorrecao):
 * cada mês rende (1 + taxa do ano)^(1/12). No IPCA, a taxa do ano é o IPCA mais os juros, limitada pela Selic.
 * Devolve null se faltar dado do índice escolhido ou se o prazo não for um número inteiro de meses.
 * @param {{ meses: number, indice: "selic"|"ipca"|"propria"|"nenhum", jurosPP?: number, propriaPct?: number }} p
 */
export function fatorDeCorrecao({ meses, indice, jurosPP = 0, propriaPct = 0 }, caminho) {
  if (!Number.isInteger(meses) || meses < 1) return null;
  if (indice === "nenhum") return 1;
  if (indice === "propria") return Number.isFinite(propriaPct) ? (1 + propriaPct / 100) ** (meses / 12) : null;
  if (indice !== "selic" && indice !== "ipca") return null;
  if (!caminho) return null;
  let fator = 1;
  for (let m = 1; m <= meses; m++) {
    const ano = caminho.anoBase + Math.floor((caminho.mesBase + m) / 12);
    const selic = caminho.selicDoAno(ano);
    let taxa = selic;
    if (indice === "ipca") {
      const ipca = caminho.ipcaDoAno(ano);
      taxa = ipca === null ? null : selic === null ? ipca + jurosPP : Math.min(ipca + jurosPP, selic);
    }
    if (taxa === null || taxa === undefined) return null;
    fator *= (1 + taxa / 100) ** (1 / 12);
  }
  return fator;
}

/**
 * Precatório: o valor atualizado hoje (`valor`) cresce com a correção até o pagamento (`meses`), perde as retenções
 * (`retencaoPct`: IR, PSS, honorários... o que a pessoa informar) e é descontado pela curva Prefixada mais o spread.
 * Com `desagioPct` (o deságio de uma oferta de compra, sobre o valor atualizado) calcula também o retorno de quem
 * compra. Modelo simples de DEMONSTRAÇÃO: não sabe a ordem de pagamento, o ente devedor nem a regra de cada caso.
 */
export function precatorio({ valor, meses, indice, jurosPP = 0, propriaPct = 0, retencaoPct = 0, desagioPct = null, custos = 0, spreadPP }, curvaNominal, caminho) {
  const curva = curvaUsavel(curvaNominal) ? curvaNominal : null;
  if (!curva || !positivo(valor) || !Number.isInteger(meses) || meses < 1 || meses > MAX_MESES_PRECATORIO || !(spreadPP >= 0)) return null;
  if (!(jurosPP >= 0) || !(retencaoPct >= 0 && retencaoPct < 100) || !(custos >= 0)) return null;
  if (desagioPct !== null && !(desagioPct >= 0 && desagioPct < 100)) return null;
  const fator = fatorDeCorrecao({ meses, indice, jurosPP, propriaPct }, caminho);
  if (fator === null) return null;
  const esperado = valor * fator;
  const liquido = esperado * (1 - retencaoPct / 100);
  const dias = diasDoPrazo(curva, meses);
  const anos = dias / DIAS_UTEIS_NO_ANO;
  const [ancora, extrapolado] = interpola(curva.pontos, anos);
  const desconto = ancora + spreadPP;
  const vp = valorPresente(liquido, desconto, anos);
  let oferta = null;
  if (desagioPct !== null) {
    const preco = valor * (1 - desagioPct / 100);
    const pago = preco + custos;
    oferta = {
      preco,
      pago,
      custos,
      retorno_aa: ((liquido / pago) ** (1 / anos) - 1) * 100,
      retorno_total: (liquido / pago - 1) * 100,
      folga: vp - pago,
      preco_maximo: vp - custos,
      desagio_minimo_pct: (1 - (vp - custos) / valor) * 100,
    };
  }
  return {
    dias_uteis: dias,
    prazo_anos: anos,
    fator,
    correcao_total_pct: (fator - 1) * 100,
    correcao_aa_pct: (fator ** (12 / meses) - 1) * 100,
    valor_esperado: esperado,
    liquido_esperado: liquido,
    taxa_ancora: ancora,
    taxa_desconto: desconto,
    valor_presente: vp,
    pct_do_valor: (vp / valor) * 100,
    desagio_justo_pct: 100 - (vp / valor) * 100,
    extrapolado,
    oferta,
  };
}
