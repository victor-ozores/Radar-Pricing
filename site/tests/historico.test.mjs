import assert from "node:assert/strict";
import test from "node:test";

import { anosDoPrazoIngenuo, diasUteisIngenuo } from "./calendario_ingenuo.mjs";
import { ancoraNoTempo, cdiAnualizado, creditoNoTempo, custoDoDinheiro, dataAteO, focusNoTempo, serieDe, titulosDoTesouro } from "../js/historico.js";

const reg = (fonte, serie, dimensao, data_ref, valor) => ({ fonte, serie, dimensao, data_ref, valor, unidade: "", descricao: "" });
const TESOURO = "tesouro_taxa_compra";

const foto = {
  registros: [
    reg("bcb_sgs", "selic_meta", "", "2026-10-30", 13.75),
    reg("bcb_sgs", "selic_meta", "", "2026-10-29", 13.75),
    reg("bcb_sgs", "selic_meta", "", "2026-10-28", 14.0),
    reg("bcb_sgs", "cdi", "", "2026-10-30", 0.0514),
    reg("tesouro", TESOURO, "titulo=Tesouro Prefixado|vencimento=2029-01-01", "2026-10-29", 14.8),
    reg("tesouro", TESOURO, "titulo=Tesouro Prefixado|vencimento=2029-01-01", "2026-10-22", 12.75),
    reg("tesouro", TESOURO, "titulo=Tesouro Prefixado|vencimento=2029-01-01", "2026-09-29", 12.5),
    reg("tesouro", TESOURO, "titulo=Tesouro Prefixado|vencimento=2027-01-01", "2026-10-29", 13.45),
    reg("tesouro", TESOURO, "titulo=Tesouro Prefixado|vencimento=2027-01-01", "2026-10-22", 13.4),
    reg("tesouro", TESOURO, "titulo=Tesouro IPCA+|vencimento=2032-08-15", "2026-10-29", 7.84),
    reg("bcb_focus", "focus_selic_anual", "ano=2027", "2026-10-23", 11.75),
    reg("bcb_focus", "focus_selic_anual", "ano=2027", "2026-10-16", 12),
    reg("bcb_focus", "focus_selic_anual", "ano=2026", "2026-10-23", 13.25),
    reg("bcb_taxas", "taxa_financiamento_veiculos", "banco=A", "2026-10-09", 20),
    reg("bcb_taxas", "taxa_financiamento_veiculos", "banco=B", "2026-10-09", 30),
    reg("bcb_taxas", "taxa_financiamento_veiculos", "banco=C", "2026-10-09", 40),
    reg("bcb_taxas", "taxa_financiamento_veiculos", "banco=A", "2026-10-02", 10),
  ],
};

test("serieDe devolve a série em ordem de data e só a pedida", () => {
  assert.deepEqual(serieDe(foto, "bcb_sgs", "selic_meta"), [
    { data: "2026-10-28", valor: 14 },
    { data: "2026-10-29", valor: 13.75 },
    { data: "2026-10-30", valor: 13.75 },
  ]);
  assert.deepEqual(serieDe(foto, "bcb_sgs", "nao_existe"), []);
});

test("CDI anualizado usa 252 dias úteis (a conta do robô)", () => {
  assert.ok(Math.abs(cdiAnualizado(0.0514) - (1.000514 ** 252 - 1) * 100) < 1e-12);
  assert.ok(Math.abs(cdiAnualizado(0.0514) - 13.8253) < 0.0001); // conferido à parte, em Python
});

test("custoDoDinheiro junta meta e CDI por data, sem inventar o que falta", () => {
  const linhas = custoDoDinheiro(foto);
  assert.equal(linhas.length, 3);
  assert.deepEqual(linhas.map((l) => l.data), ["2026-10-28", "2026-10-29", "2026-10-30"]);
  assert.equal(linhas[0].cdi, undefined);
  assert.equal(linhas[2].meta, 13.75);
  assert.ok(linhas[2].cdi > 13);
});

test("títulos do Tesouro: um por vencimento, ordenados, com a taxa de cada dia", () => {
  const t = titulosDoTesouro(foto);
  assert.deepEqual(t.map((x) => `${x.titulo} ${x.ano}`), ["Tesouro IPCA+ 2032", "Tesouro Prefixado 2027", "Tesouro Prefixado 2029"]);
  assert.deepEqual(t[2].pontos.map((p) => p.data), ["2026-09-29", "2026-10-22", "2026-10-29"]);
});

test("dataAteO pega a data mais perto sem passar do alvo", () => {
  const d = ["2026-09-29", "2026-10-22", "2026-10-29"];
  assert.equal(dataAteO(d, "2026-10-22"), "2026-10-22");
  assert.equal(dataAteO(d, "2026-10-25"), "2026-10-22");
  assert.equal(dataAteO(d, "2026-09-01"), "2026-09-29"); // todas passam: a mais antiga
});

test("âncora no tempo: interpola a curva de cada dia, e dia com um vencimento só não entra", () => {
  const dois = {
    registros: [
      reg("tesouro", TESOURO, "titulo=Tesouro Prefixado|vencimento=2027-01-01", "2026-01-01", 10),
      reg("tesouro", TESOURO, "titulo=Tesouro Prefixado|vencimento=2029-01-01", "2026-01-01", 14),
      reg("tesouro", TESOURO, "titulo=Tesouro Prefixado|vencimento=2027-01-01", "2026-01-02", 11),
    ],
  };
  const serie = ancoraNoTempo(dois, "Tesouro Prefixado", 24); // 2 anos: no meio dos dois vencimentos de 1 e 3 anos
  assert.equal(serie.length, 1);
  assert.equal(serie[0].data, "2026-01-01");
  // o prazo é contado em dias úteis a partir do próprio dia da curva (2026-01-01), não do dia de hoje
  const a1 = diasUteisIngenuo("2026-01-01", "2027-01-01") / 252;
  const a2 = diasUteisIngenuo("2026-01-01", "2029-01-01") / 252;
  const esperado = 10 + ((anosDoPrazoIngenuo("2026-01-01", 24) - a1) / (a2 - a1)) * 4;
  assert.ok(Math.abs(serie[0].valor - esperado) < 1e-9, `esperava ${esperado}, veio ${serie[0].valor}`);
  assert.ok(Math.abs(esperado - 12) < 0.05);
  assert.deepEqual(ancoraNoTempo(dois, "Não existe", 24), []);
});

test("Focus no tempo: um ano por coluna, uma semana por linha", () => {
  const f = focusNoTempo(foto);
  assert.deepEqual(f.anos, [2026, 2027]);
  assert.deepEqual(f.linhas, [
    { data: "2026-10-16", 2027: 12 },
    { data: "2026-10-23", 2026: 13.25, 2027: 11.75 },
  ]);
});

test("crédito no tempo: mediana e quartis dos bancos de cada dia", () => {
  const c = creditoNoTempo(foto, "taxa_financiamento_veiculos");
  assert.deepEqual(c.map((x) => x.data), ["2026-10-02", "2026-10-09"]);
  assert.deepEqual([c[1].n, c[1].mediana, c[1].p25, c[1].p75], [3, 30, 25, 35]);
  assert.deepEqual([c[0].n, c[0].mediana], [1, 10]);
});
