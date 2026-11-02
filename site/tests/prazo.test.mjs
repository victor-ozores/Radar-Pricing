// O prazo em dias úteis (base 252): o mesmo de src/radar_pricing/prazo.py. A conta aqui é conferida contra uma contagem
// dia a dia com a tabela das datas da Páscoa (não a fórmula do pacote) e contra o preço que o Tesouro publica.

import assert from "node:assert/strict";
import test from "node:test";

import { valorPresente } from "../js/calc.js";
import { diasUteisIngenuo, PASCOA } from "./calendario_ingenuo.mjs";
import { anosAteOVencimento, diasUteis, diasUteisDoPrazo, feriadosDoAno, isoDoDia, listaDeFeriados, numeroDoDia, pascoa, somaMeses } from "../js/prazo.js";

const ingenuo = diasUteisIngenuo;

test("a Páscoa bate com a tabela das datas oficiais", () => {
  for (const [ano, esperada] of Object.entries(PASCOA)) assert.equal(isoDoDia(pascoa(Number(ano))), esperada, ano);
});

test("feriados de 2026 e a Consciência Negra só a partir de 2024", () => {
  const f = new Set([...feriadosDoAno(2026)].map(isoDoDia));
  for (const dia of ["2026-02-16", "2026-02-17", "2026-04-03", "2026-06-04", "2026-01-01", "2026-04-21", "2026-05-01", "2026-09-07", "2026-10-12", "2026-11-02", "2026-11-15", "2026-11-20", "2026-12-25"]) {
    assert.ok(f.has(dia), dia);
  }
  assert.equal(f.size, 13);
  assert.equal(feriadosDoAno(2023).size, 12);
  assert.equal(feriadosDoAno(2024).size, 13); // e vale desde o primeiro ano em que passou a ser nacional
  assert.deepEqual(listaDeFeriados(2026, 2026).map((x) => x.data), [...f].sort());
  assert.ok(listaDeFeriados(2026, 2026).every((x) => x.nome.length > 3));
});

test("dias úteis: casos contados à mão", () => {
  assert.equal(diasUteis("2026-10-30", "2026-11-03"), 1); // sexta até terça; 02/11 (segunda) é feriado
  assert.equal(diasUteis("2026-10-30", "2026-11-02"), 0);
  assert.equal(diasUteis("2026-10-26", "2026-11-02"), 4);
  assert.equal(diasUteis("2026-10-29", "2026-10-30"), 1); // o dia de chegada conta
  assert.equal(diasUteis("2026-10-30", "2026-10-31"), 0); // sábado
  assert.equal(diasUteis("2026-10-30", "2026-10-30"), 0); // a data-base não conta
  assert.equal(diasUteis("2026-11-05", "2026-11-01"), 0); // ao contrário não é prazo
  assert.equal(diasUteis("2026-10-30", "2027-01-01"), 41);
});

test("dias úteis: igual à contagem dia a dia em sorteios", () => {
  let semente = 20261102;
  const sorteia = (n) => {
    semente = (semente * 1664525 + 1013904223) % 4294967296;
    return Math.floor((semente / 4294967296) * n);
  };
  for (let i = 0; i < 1500; i++) {
    const de = isoDoDia(numeroDoDia("2026-01-01") + sorteia(365 * 11));
    const ate = isoDoDia(numeroDoDia(de) + sorteia(365 * 11));
    assert.equal(diasUteis(de, ate), ingenuo(de, ate), `${de} ${ate}`);
  }
});

test("soma de meses como o EDATE do Excel", () => {
  for (const [inicio, meses, esperado] of [
    ["2026-01-31", 1, "2026-02-28"], ["2028-01-31", 1, "2028-02-29"], ["2028-02-29", 12, "2029-02-28"], ["2026-10-30", 3, "2027-01-30"],
    ["2026-12-15", 1, "2027-01-15"], ["2026-10-30", 24, "2028-10-30"], ["2026-10-30", 0, "2026-10-30"], ["2026-08-31", 6, "2027-02-28"],
  ]) assert.equal(somaMeses(inicio, meses), esperado, `${inicio} +${meses}`);
});

test("o prazo em meses é o da contagem dia a dia", () => {
  for (const base of ["2026-10-30", "2027-01-31", "2026-03-02", "2028-02-29"]) {
    for (const meses of [1, 2, 6, 12, 13, 24, 36, 59, 120]) assert.equal(diasUteisDoPrazo(base, meses), ingenuo(base, somaMeses(base, meses)), `${base} +${meses}`);
  }
});

// O preço unitário que o Tesouro publica para o Tesouro Prefixado (arquivo oficial, taxa e PU de compra de 30/10/2026).
const PU_DO_TESOURO = [
  ["2027-01-01", 13.48, 979.63],
  ["2028-01-01", 14.32, 856.35],
  ["2029-01-01", 14.89, 742.71],
  ["2031-01-01", 15.3, 555.37],
  ["2032-01-01", 15.38, 479.96],
];

test("o preço do Tesouro Prefixado sai igual ao que o Tesouro publica", () => {
  for (const [vencimento, taxa, pu] of PU_DO_TESOURO) {
    const preco = valorPresente(1000, taxa, anosAteOVencimento("2026-10-30", vencimento));
    assert.ok(Math.abs(Number(preco.toFixed(2)) - pu) <= 0.011, `${vencimento}: ${preco} contra ${pu}`);
    const corridos = (numeroDoDia(vencimento) - numeroDoDia("2026-10-30")) / 365.25; // dias corridos erram de 0,12% a 0,59%
    assert.ok(valorPresente(1000, taxa, corridos) < pu * 0.999, vencimento);
  }
});

test("dois feriados no mesmo dia contam uma vez só (em 2079 a Sexta-feira Santa cai no Dia de Tiradentes, 21/04)", () => {
  assert.equal(isoDoDia(pascoa(2079)), "2079-04-23");
  assert.equal(feriadosDoAno(2079).size, 12); // 13 feriados com a Consciência Negra, menos o dia repetido
  assert.equal(diasUteis("2079-04-20", "2079-04-24"), 1); // sexta 21 (feriado duplo), sábado, domingo, segunda 24
  assert.equal(diasUteis("2079-04-20", "2079-04-24"), ingenuo("2079-04-20", "2079-04-24"));
  assert.equal(diasUteis("2079-01-01", "2080-01-01"), ingenuo("2079-01-01", "2080-01-01"));
});
