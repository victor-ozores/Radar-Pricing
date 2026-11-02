import assert from "node:assert/strict";
import test from "node:test";

import { arredonda, desconta, interpola, valorPresente } from "../js/calc.js";
import { anosDoPrazoIngenuo, diasUteisIngenuo, somaMesesIngenuo } from "./calendario_ingenuo.mjs";

const BASE = "2026-10-29";
/** Anos de 252 dias úteis de BASE até o mesmo dia `meses` depois, contados dia a dia. */
const A = (meses) => anosDoPrazoIngenuo(BASE, meses);

const pontos = [
  { vencimento: "2027-01-01", anos: 1, taxa: 10 },
  { vencimento: "2029-01-01", anos: 3, taxa: 14 },
  { vencimento: "2031-01-01", anos: 5, taxa: 15 },
];

test("interpola linearmente entre vencimentos vizinhos", () => {
  assert.deepEqual(interpola(pontos, 2), [12, false]);
  assert.deepEqual(interpola(pontos, 4), [14.5, false]);
  assert.deepEqual(interpola(pontos, 3), [14, false]); // exatamente num vencimento
});

test("fora da curva usa a ponta e avisa que extrapolou", () => {
  assert.deepEqual(interpola(pontos, 0.5), [10, true]);
  assert.deepEqual(interpola(pontos, 10), [15, true]);
  assert.deepEqual(interpola(pontos, 1), [10, false]); // nas pontas, sem extrapolar
  assert.deepEqual(interpola(pontos, 5), [15, false]);
});

test("valor presente: capitalização composta, o prazo em anos é o expoente", () => {
  assert.equal(arredonda(valorPresente(1000, 10, 1), 2), 909.09);
  assert.equal(arredonda(valorPresente(1000, 10, 2), 2), 826.45);
  assert.equal(arredonda(valorPresente(1000, 0, 3), 2), 1000);
});

test("desconta: âncora + spread, e null quando a foto não tem a curva", () => {
  const r = desconta({ base: BASE, pontos }, 1000, 24, 5);
  const a = A(24); // um pouco menos de 2 anos: 24 meses têm menos de 504 dias úteis
  const taxa = 10 + (a - 1) * 2; // entre os pontos de 1 ano (10%) e 3 anos (14%)
  assert.deepEqual(r, {
    dias_uteis: Math.round(a * 252),
    taxa_ancora: arredonda(taxa, 4),
    taxa_demonstracao: arredonda(taxa + 5, 4),
    vp_ancora: arredonda(1000 / (1 + taxa / 100) ** a, 2),
    vp_demonstracao: arredonda(1000 / (1 + (taxa + 5) / 100) ** a, 2),
    extrapolado: false,
  });
  assert.equal(desconta(null, 1000, 24, 5), null);
  assert.equal(desconta({ base: BASE, pontos: [] }, 1000, 24, 5), null);
  assert.equal(desconta({ pontos }, 1000, 24, 5), null); // sem a data-base não há de onde contar o prazo
  assert.equal(desconta({ base: BASE, pontos }, 1000, 6, 5).extrapolado, true);
});

test("spread zero devolve o valor da âncora", () => {
  const r = desconta({ base: BASE, pontos }, 1000, 36, 0);
  assert.equal(r.vp_ancora, r.vp_demonstracao);
});

// --------------------------------------------------------------------------------------------- calculadoras
import { cotaAtiva, cotaCancelada, curvaDeSeteDiasAtras, impactoNoPrazo, retornoDaOferta } from "../js/calc.js";

const perto = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} não é ${b}`);
/** Uma curva chata (mesma taxa em todo prazo): dá para conferir a conta à mão. */
const plana = (taxa) => ({ titulo: "t", base: BASE, pontos: [{ vencimento: somaMesesIngenuo(BASE, 12), anos: A(12), taxa, ref7: taxa - 1, dias7: 7 }, { vencimento: somaMesesIngenuo(BASE, 132), anos: A(132), taxa, ref7: taxa - 1, dias7: 7 }] });

test("curva de 7 dias atrás usa a taxa de referência da foto; sem ela, não compara", () => {
  const antes = curvaDeSeteDiasAtras(plana(14));
  assert.deepEqual(antes.pontos.map((p) => p.taxa), [13, 13]);
  assert.equal(curvaDeSeteDiasAtras({ base: BASE, pontos: [{ anos: 1, taxa: 14, ref7: null }] }), null);
  assert.equal(curvaDeSeteDiasAtras(null), null);
});

test("impacto no preço: juros mais altos hoje derrubam o valor presente", () => {
  const r = impactoNoPrazo(plana(14), 36, 5, 1000);
  perto(r.vp_hoje, 1000 / 1.19 ** A(36)); // 14 + 5
  perto(r.vp_antes, 1000 / 1.18 ** A(36)); // 13 + 5
  perto(r.variacao_pct, (1.18 ** A(36) / 1.19 ** A(36) - 1) * 100);
  assert.ok(r.variacao_pct < 0);
  assert.equal(r.dias, 7);
  assert.equal(impactoNoPrazo({ base: BASE, pontos: [{ anos: 1, taxa: 14, ref7: null }] }, 36, 5), null);
});

test("cota cancelada: valor a receber descontado pela taxa do dia + spread", () => {
  const r = cotaCancelada({ valor: 10000, meses: 24, corrigido: false, spreadPP: 5 }, { nominal: plana(14), real: null });
  perto(r.taxa_ancora, 14);
  perto(r.taxa_desconto, 19);
  perto(r.valor_presente, 10000 / 1.19 ** A(24));
  perto(r.pct_do_valor, 100 / 1.19 ** A(24));
  perto(r.prazo_anos, A(24));
  assert.equal(r.dias_uteis, Math.round(A(24) * 252));
  assert.deepEqual(r.prazos.map((p) => p.meses), [12, 18, 24, 30, 36]);
  assert.deepEqual(r.spreads.map((s) => s.spread), [4, 5, 6]);
  perto(r.spreads[2].valor_presente, 10000 / 1.2 ** A(24));
});

test("cota cancelada: prazos vizinhos abaixo de 1 mês somem, spread abaixo de zero some, corrigido troca a curva", () => {
  const curvas = { nominal: plana(14), real: plana(7) };
  const curto = cotaCancelada({ valor: 100, meses: 3, corrigido: true, spreadPP: 0.5 }, curvas);
  assert.deepEqual(curto.prazos.map((p) => p.meses), [3, 9, 15]);
  assert.deepEqual(curto.spreads.map((s) => s.spread), [0.5, 1.5]);
  perto(curto.taxa_ancora, 7);
  assert.equal(cotaCancelada({ valor: 100, meses: 3, corrigido: true, spreadPP: 5 }, { nominal: plana(14), real: null }), null);
});

test("cota cancelada: entrada inválida devolve null, nunca NaN", () => {
  const curvas = { nominal: plana(14), real: plana(7) };
  for (const ruim of [{ valor: 0 }, { valor: -5 }, { valor: Number.NaN }, { meses: 0 }, { meses: Number.NaN }, { spreadPP: -1 }]) {
    assert.equal(cotaCancelada({ valor: 100, meses: 12, corrigido: false, spreadPP: 5, ...ruim }, curvas), null);
  }
});

test("retorno da oferta: ao ano, total, preço máximo e folga", () => {
  const curvas = { nominal: plana(14), real: plana(7) };
  const r = retornoDaOferta({ preco: 1000, valor: 1200, meses: 12, corrigido: false, spreadPP: 5 }, curvas, 13.65);
  perto(r.retorno_aa, (1.2 ** (1 / A(12)) - 1) * 100); // ao ano de 252 dias úteis, como a taxa do Tesouro
  perto(r.retorno_total, 20);
  perto(r.alvo, 19); // taxa do Tesouro 14 + spread 5
  assert.equal(r.alvo_padrao, true);
  perto(r.preco_maximo, 1200 / 1.19 ** A(12));
  perto(r.folga, 1200 / 1.19 ** A(12) - 1000);
  assert.deepEqual(r.referencias.map((x) => x.nome), ["Tesouro Prefixado no prazo", "CDI de hoje (anualizado)"]);
  perto(r.referencias[0].diferenca_pp, r.retorno_aa - 14);
  perto(r.referencias[1].diferenca_pp, r.retorno_aa - 13.65);

  const dois = retornoDaOferta({ preco: 1000, valor: 1200, meses: 24, corrigido: false, spreadPP: 5 }, curvas, 13.65);
  perto(dois.retorno_aa, (1.2 ** (1 / A(24)) - 1) * 100);
  perto(dois.retorno_total, 20);
});

test("retorno da oferta: alvo digitado manda; corrigido compara só com o IPCA+ (sem CDI)", () => {
  const curvas = { nominal: plana(14), real: plana(7) };
  const valor = 1000 * 1.2 ** A(12); // rende exatamente 20% ao ano de 252 dias úteis
  const r = retornoDaOferta({ preco: 1000, valor, meses: 12, corrigido: true, alvoPct: 20, spreadPP: 5 }, curvas, 13.65);
  perto(r.retorno_aa, 20);
  assert.equal(r.alvo_padrao, false);
  perto(r.preco_maximo, 1000); // alvo = retorno: o preço máximo é o preço
  perto(r.folga, 0);
  assert.deepEqual(r.referencias.map((x) => x.nome), ["Tesouro IPCA+ no prazo (acima do IPCA)"]);
  assert.equal(retornoDaOferta({ preco: 0, valor: 1200, meses: 12, corrigido: false, spreadPP: 5 }, curvas, 13.65), null);
});

test("cota ativa: confere com a fórmula fechada da anuidade (curva plana)", () => {
  const taxa = 7;
  const spread = 5;
  const i = 1 + (taxa + spread) / 100; // fator anual
  const n = 60;
  const parcela = 1900;
  const credito = 100000;
  const r = cotaAtiva({ credito, parcela, parcelas: n, contemplacao: 12, spreadPP: spread }, plana(taxa));
  let vpParcelas = 0; // cada parcela descontada pelo prazo, em dias úteis, até o mesmo dia do mês dela
  for (let t = 1; t <= n; t++) vpParcelas += parcela / i ** A(t);
  const vpCredito = credito / i ** A(12);
  perto(r.vp_parcelas, vpParcelas);
  perto(r.vp_credito, vpCredito);
  perto(r.valor_da_cota, vpCredito - vpParcelas);
  perto(r.pct_do_credito, ((vpCredito - vpParcelas) / credito) * 100);
  perto(r.total_das_parcelas, 114000);
  assert.equal(r.extrapolado, true); // a curva plana de teste começa em 1 ano; as parcelas do 1º ao 11º mês extrapolam
});

test("cota ativa: já contemplada recebe o crédito inteiro; contemplar mais tarde vale menos", () => {
  const r = cotaAtiva({ credito: 50000, parcela: 1000, parcelas: 48, contemplacao: 0, spreadPP: 5 }, plana(7));
  perto(r.vp_credito, 50000);
  const valores = r.cenarios.map((c) => c.valor_da_cota);
  assert.deepEqual(r.cenarios.map((c) => c.contemplacao), [0, 6, 12, 24, 36, 48]);
  for (let k = 1; k < valores.length; k++) assert.ok(valores[k] < valores[k - 1], "esperar mais para contemplar tem de valer menos");
  perto(r.cenarios[0].valor_da_cota, r.valor_da_cota);
});

test("cota ativa: o cenário do usuário entra na lista, cada spread é o mesmo cálculo, entrada inválida é null", () => {
  const r = cotaAtiva({ credito: 50000, parcela: 1000, parcelas: 48, contemplacao: 10, spreadPP: 5 }, plana(7));
  assert.ok(r.cenarios.some((c) => c.contemplacao === 10));
  assert.deepEqual(r.spreads.map((s) => s.spread), [4, 5, 6]);
  // cada cenário de spread é o mesmo cálculo com aquele spread (a direção não é fixa: juros maiores também
  // encolhem o valor das parcelas, que ficam mais longe que o crédito)
  const base0 = { credito: 50000, parcela: 1000, parcelas: 48, contemplacao: 10 };
  for (const cenario of r.spreads) {
    perto(cenario.valor_da_cota, cotaAtiva({ ...base0, spreadPP: cenario.spread }, plana(7)).valor_da_cota);
  }
  assert.ok(new Set(r.spreads.map((c) => c.valor_da_cota)).size === 3);
  const base = { credito: 50000, parcela: 1000, parcelas: 48, contemplacao: 10, spreadPP: 5 };
  for (const ruim of [{ credito: 0 }, { parcela: -1 }, { parcelas: 0 }, { parcelas: 241 }, { parcelas: 12.5 }, { contemplacao: 49 }, { contemplacao: -1 }, { contemplacao: 1.5 }, { spreadPP: -2 }]) {
    assert.equal(cotaAtiva({ ...base, ...ruim }, plana(7)), null, JSON.stringify(ruim));
  }
  assert.equal(cotaAtiva(base, null), null);
});

test("cota ativa: parcelas maiores que o crédito dão valor negativo, sem esconder o sinal", () => {
  const r = cotaAtiva({ credito: 10000, parcela: 500, parcelas: 60, contemplacao: 0, spreadPP: 5 }, plana(7));
  assert.ok(r.valor_da_cota < 0 && r.pct_do_credito < 0);
});
