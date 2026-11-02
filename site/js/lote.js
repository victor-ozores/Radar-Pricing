// Várias cotas de uma vez: lê uma lista colada (copiada do Excel, com tabulação, ou separada por ";") e calcula cada
// linha com as MESMAS funções das calculadoras (calc.js). Nada aqui faz conta própria: só lê, valida e junta.

import { agioDaCota, avaliaPreco, cotaAtiva, cotaCancelada, leituraDoNegocio, MAX_PARCELAS } from "./calc.js";
import { lerNumero } from "./formato.js";

export const MAX_LINHAS = 500;
export const MAX_MESES = 360;

export const TIPOS_DE_LOTE = [
  { id: "cancelada", nome: "Cotas canceladas" },
  { id: "ativa", nome: "Cotas ativas" },
];

/** As colunas que a lista precisa ter, na ordem (as duas últimas, de preço e custos, são opcionais). */
export const COLUNAS_DO_LOTE = {
  cancelada: ["Valor a devolver (R$)", "Meses até receber", "Correção: ipca, sem ou uma taxa % ao ano", "Preço pedido (R$)", "Custos (R$)"],
  ativa: ["Crédito (R$)", "Parcela mensal (R$)", "Parcelas que faltam", "Contemplação daqui a (meses)", "Preço pedido (R$)", "Custos (R$)"],
};

/** Valores inventados, para a pessoa ver o formato (cada um pode ser trocado). */
export const EXEMPLO_DE_LOTE = {
  cancelada: "50.000;24;ipca;38.000;0\n120.000;60;ipca;60.000;1.500\n80.000;36;4,5;62.000;\n30.000;18;sem;;",
  ativa: "100.000;1.900;60;12;;\n80.000;1.250;48;0;15.000;800\n150.000;1.800;80;6;60.000;",
};

const separa = (linha) => (linha.includes("\t") ? linha.split("\t") : linha.split(";")).map((c) => c.trim());

const semAcento = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** A coluna de correção: vazio ou "ipca" (a inflação), "sem" (nenhuma) ou uma taxa em % ao ano (o índice do bem). */
function leCorrecao(texto) {
  const t = semAcento(texto ?? "");
  if (t === "" || /^(ipca|inflacao|sim|s)$/.test(t)) return { corrigido: true, correcaoPct: null, rotulo: "IPCA" };
  if (/^(sem|nenhuma|nenhum|nao|n)$/.test(t)) return { corrigido: false, correcaoPct: null, rotulo: "sem correção" };
  const taxa = lerNumero(texto);
  if (taxa === null || !(taxa > -100) || taxa > 200) return null;
  return { corrigido: false, correcaoPct: taxa, rotulo: `${String(taxa).replace(".", ",")}% a.a.` };
}

const inteiro = (n) => n !== null && Number.isInteger(n);

function leCancelada(c, { curvas, spreadPP }) {
  const valor = lerNumero(c[0]);
  const meses = lerNumero(c[1]);
  if (valor === null || !(valor > 0)) return { erro: "valor a devolver inválido" };
  if (!inteiro(meses) || meses < 1 || meses > MAX_MESES) return { erro: `prazo: use meses inteiros, de 1 a ${MAX_MESES}` };
  const corr = leCorrecao(c[2]);
  if (!corr) return { erro: "correção: use ipca, sem ou uma taxa em % ao ano" };
  const preco = c[3] ? lerNumero(c[3]) : null;
  const custos = c[4] ? lerNumero(c[4]) : 0;
  if (c[3] && (preco === null || !(preco > 0))) return { erro: "preço pedido inválido" };
  if (custos === null || custos < 0) return { erro: "custos inválidos" };
  const r = cotaCancelada({ valor, meses, corrigido: corr.corrigido, correcaoPct: corr.correcaoPct, spreadPP }, curvas);
  if (!r) return { erro: "sem a curva do Tesouro nesta foto" };
  const a = preco === null ? null : avaliaPreco({ valorJusto: r.valor_presente, preco, custos });
  const lei = preco === null ? null : leituraDoNegocio({ pagoHoje: preco + custos, recebe: r.valor_no_pagamento, valorJusto: r.valor_presente, anos: r.prazo_anos });
  return {
    entrada: { valor, meses, correcao: corr.rotulo, preco, custos },
    ...(lei ? { lucro: lei.lucro, lucro_pct: lei.lucro_pct, situacao: lei.situacao } : {}),
    vale_hoje: r.valor_presente,
    pct_do_valor: r.pct_do_valor,
    taxa_desconto: r.taxa_desconto,
    extrapolado: r.extrapolado,
    ...(a ? { pago: a.pago, folga: a.folga, cabe: a.cabe, preco_maximo: a.preco_maximo } : {}),
  };
}

function leAtiva(c, { curvas, spreadPP }) {
  const credito = lerNumero(c[0]);
  const parcela = lerNumero(c[1]);
  const parcelas = lerNumero(c[2]);
  const contemplacao = lerNumero(c[3]);
  if (credito === null || !(credito > 0)) return { erro: "crédito inválido" };
  if (parcela === null || !(parcela > 0)) return { erro: "parcela inválida" };
  if (!inteiro(parcelas) || parcelas < 1 || parcelas > MAX_PARCELAS) return { erro: `parcelas: use de 1 a ${MAX_PARCELAS}` };
  if (!inteiro(contemplacao) || contemplacao < 0 || contemplacao > parcelas) return { erro: "contemplação: de 0 até o número de parcelas" };
  const preco = c[4] ? lerNumero(c[4]) : null;
  const custos = c[5] ? lerNumero(c[5]) : 0;
  if (c[4] && (preco === null || !(preco > 0))) return { erro: "preço pedido inválido" };
  if (custos === null || custos < 0) return { erro: "custos inválidos" };
  const r = cotaAtiva({ credito, parcela, parcelas, contemplacao, spreadPP }, curvas.real);
  if (!r) return { erro: "sem a curva do Tesouro IPCA+ nesta foto" };
  const a = preco === null ? null : avaliaPreco({ valorJusto: r.valor_da_cota, preco, custos });
  const agio = preco === null ? null : agioDaCota({ preco, custos, credito, saldoDevedor: r.total_das_parcelas });
  const lei = preco === null ? null : leituraDoNegocio({ pagoHoje: preco + custos, saidasFuturas: r.total_das_parcelas, recebe: credito, valorJusto: r.valor_da_cota });
  return {
    entrada: { credito, parcela, parcelas, contemplacao, preco, custos },
    ...(lei ? { lucro: lei.lucro, lucro_pct: lei.lucro_pct, situacao: lei.situacao } : {}),
    vale_hoje: r.valor_da_cota,
    pct_do_valor: r.pct_do_credito,
    extrapolado: r.extrapolado,
    ...(a ? { pago: a.pago, folga: a.folga, cabe: a.cabe, preco_maximo: a.preco_maximo } : {}),
    ...(agio ? { agio_credito_pct: agio.sobre_credito_pct, agio_saldo_pct: agio.sobre_saldo_pct } : {}),
  };
}

/**
 * Calcula a lista. `texto`: uma cota por linha. A primeira linha pode ser um título (não começa por número) e linhas
 * em branco são ignoradas. Cada linha sai com `n` (o número da linha no texto) e, ou o resultado, ou `erro`.
 * @returns {{ linhas: any[], resumo: { total: number, calculadas: number, com_erro: number, soma_vale_hoje: number, com_preco: number, cabem: number, compensam: number, no_limite: number, nao_compensam: number, soma_lucro: number, soma_pago: number, soma_vale_das_com_preco: number }, truncado: boolean }}
 */
export function calculaLote(texto, tipo, { curvas, spreadPP }) {
  const leitor = tipo === "ativa" ? leAtiva : leCancelada;
  const minimo = tipo === "ativa" ? 4 : 2;
  const linhas = [];
  let truncado = false;
  const todas = String(texto ?? "").split(/\r?\n/);
  let viuDados = false;
  for (let i = 0; i < todas.length; i++) {
    const bruta = todas[i];
    if (bruta.trim() === "") continue;
    const c = separa(bruta);
    if (!viuDados && lerNumero(c[0]) === null && /[a-zA-ZÀ-ú]/.test(c[0] ?? "")) continue; // título da planilha
    viuDados = true;
    if (linhas.length >= MAX_LINHAS) {
      truncado = true;
      break;
    }
    if (c.length < minimo) {
      linhas.push({ n: i + 1, erro: `faltam colunas: esta lista precisa de pelo menos ${minimo}` });
      continue;
    }
    linhas.push({ n: i + 1, ...leitor(c, { curvas, spreadPP }) });
  }
  const boas = linhas.filter((l) => !l.erro);
  const comPreco = boas.filter((l) => l.pago !== undefined);
  return {
    linhas,
    truncado,
    resumo: {
      total: linhas.length,
      calculadas: boas.length,
      com_erro: linhas.length - boas.length,
      soma_vale_hoje: boas.reduce((s, l) => s + l.vale_hoje, 0),
      com_preco: comPreco.length,
      cabem: comPreco.filter((l) => l.cabe).length,
      compensam: comPreco.filter((l) => l.situacao === "bom").length,
      no_limite: comPreco.filter((l) => l.situacao === "limite").length,
      nao_compensam: comPreco.filter((l) => l.situacao === "ruim").length,
      soma_lucro: comPreco.reduce((s, l) => s + l.lucro, 0),
      soma_pago: comPreco.reduce((s, l) => s + l.pago, 0),
      soma_vale_das_com_preco: comPreco.reduce((s, l) => s + l.vale_hoje, 0),
    },
  };
}
