import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { agioDaCota, avaliaPreco, fatorDeCorrecao, MAX_MESES_PRECATORIO, precatorio, retornoDaOferta } from "../js/calc.js";
import { mesesEntre, somaMeses } from "../js/foto.js";
import { caminhoDeCorrecao, curvas as curvasDaFoto } from "../js/modelo.js";
import { anosDoPrazoIngenuo } from "./calendario_ingenuo.mjs";

const foto = JSON.parse(readFileSync(new URL("./fixtures/foto-2026-10-31.json", import.meta.url), "utf8"));
const perto = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} contra ${b}`);

/** Um caminho de teste: a Selic e o IPCA de cada ano vêm de tabelas simples. */
const caminho = (selic, ipca = {}, anoBase = 2026, mesBase = 6) => ({
  anoBase,
  mesBase,
  selicDoAno: (ano) => selic[ano] ?? null,
  ipcaDoAno: (ano) => ipca[ano] ?? null,
});

// --------------------------------------------------------------------------------------------- o fator de correção
test("fator com a Selic parada em 12%: é (1,12) elevado a meses ÷ 12, qualquer que seja o mês de partida", () => {
  for (const mesBase of [0, 6, 11]) {
    for (const meses of [1, 7, 24, 100]) {
      const c = caminho({ 2026: 12, 2027: 12, 2028: 12, 2029: 12, 2030: 12, 2031: 12, 2032: 12, 2033: 12, 2034: 12, 2035: 12 }, {}, 2026, mesBase);
      perto(fatorDeCorrecao({ meses, indice: "selic" }, c), 1.12 ** (meses / 12));
    }
  }
});

test("fator na virada do ano: base em julho, 18 meses = 5 meses de 2026, 12 de 2027 e 1 de 2028", () => {
  const c = caminho({ 2026: 10, 2027: 20, 2028: 30 }, {}, 2026, 6);
  perto(fatorDeCorrecao({ meses: 18, indice: "selic" }, c), 1.1 ** (5 / 12) * 1.2 ** (12 / 12) * 1.3 ** (1 / 12));
  // o 1º mês de uma base em dezembro já cai no ano seguinte
  perto(fatorDeCorrecao({ meses: 1, indice: "selic" }, caminho({ 2026: 10, 2027: 20 }, {}, 2026, 11)), 1.2 ** (1 / 12));
});

test("IPCA mais juros: a taxa do ano é limitada pela Selic; sem IPCA não há resposta; sem Selic não há teto", () => {
  const ate = (selic, ipca) => fatorDeCorrecao({ meses: 12, indice: "ipca", jurosPP: 2 }, caminho({ 2026: selic, 2027: selic }, { 2026: ipca, 2027: ipca }, 2026, 11));
  perto(ate(13, 5), 1.07 ** (12 / 12)); // 5 + 2 = 7, abaixo da Selic de 13
  perto(ate(6, 5), 1.06); // 5 + 2 = 7 passaria da Selic de 6: vale a Selic
  assert.equal(fatorDeCorrecao({ meses: 12, indice: "ipca", jurosPP: 2 }, caminho({ 2026: 13, 2027: 13 })), null);
  perto(fatorDeCorrecao({ meses: 12, indice: "ipca", jurosPP: 2 }, caminho({}, { 2026: 5, 2027: 5 }, 2026, 11)), 1.07);
});

test("taxa própria, sem correção e entradas ruins", () => {
  perto(fatorDeCorrecao({ meses: 24, indice: "propria", propriaPct: 8 }, null), 1.08 ** 2);
  assert.equal(fatorDeCorrecao({ meses: 24, indice: "nenhum" }, null), 1);
  assert.equal(fatorDeCorrecao({ meses: 24, indice: "selic" }, null), null);
  assert.equal(fatorDeCorrecao({ meses: 24, indice: "outro" }, caminho({})), null);
  assert.equal(fatorDeCorrecao({ meses: 2.5, indice: "nenhum" }, null), null);
  assert.equal(fatorDeCorrecao({ meses: 0, indice: "nenhum" }, null), null);
  assert.equal(fatorDeCorrecao({ meses: 12, indice: "propria", propriaPct: NaN }, null), null);
});

// --------------------------------------------------------------------------------------------- o precatório
const BASE = "2026-10-29";
const A = (meses) => anosDoPrazoIngenuo(BASE, meses); // anos de 252 dias úteis, contados dia a dia
const curva = { base: BASE, pontos: [{ anos: 1, taxa: 10 }, { anos: 3, taxa: 12 }] };

test("precatório em forma fechada: valor × correção × (1 − retenção) ÷ (1 + Tesouro + spread)^(prazo em anos úteis)", () => {
  const r = precatorio({ valor: 100000, meses: 24, indice: "propria", propriaPct: 8, retencaoPct: 10, spreadPP: 5 }, curva, null);
  perto(r.fator, 1.08 ** 2);
  perto(r.valor_esperado, 100000 * 1.08 ** 2);
  perto(r.liquido_esperado, 100000 * 1.08 ** 2 * 0.9);
  perto(r.taxa_ancora, 10 + (A(24) - 1)); // entre 10% (1 ano) e 12% (3 anos), em anos de 252 dias úteis
  perto(r.taxa_desconto, 10 + (A(24) - 1) + 5);
  perto(r.valor_presente, (100000 * 1.08 ** 2 * 0.9) / (1 + (10 + (A(24) - 1) + 5) / 100) ** A(24));
  perto(r.prazo_anos, A(24));
  perto(r.pct_do_valor + r.desagio_justo_pct, 100);
  perto(r.correcao_aa_pct, 8);
  assert.equal(r.oferta, null);
  assert.equal(r.extrapolado, false);
});

test("oferta de compra: o preço sai do deságio, o retorno do que chega ÷ o que saiu, e o deságio mínimo fecha a conta", () => {
  const e = { valor: 100000, meses: 24, indice: "propria", propriaPct: 8, retencaoPct: 10, spreadPP: 5, desagioPct: 40, custos: 1000 };
  const r = precatorio(e, curva, null);
  const liquido = 100000 * 1.08 ** 2 * 0.9;
  perto(r.oferta.preco, 60000);
  perto(r.oferta.pago, 61000);
  perto(r.oferta.retorno_aa, ((liquido / 61000) ** (1 / A(24)) - 1) * 100);
  perto(r.oferta.folga, r.valor_presente - 61000);
  perto(r.oferta.preco_maximo, r.valor_presente - 1000);
  // pagando exatamente o preço máximo, o retorno é a taxa de desconto
  const exato = precatorio({ ...e, desagioPct: r.oferta.desagio_minimo_pct }, curva, null);
  perto(exato.oferta.folga, 0, 1e-6);
  perto(exato.oferta.retorno_aa, r.taxa_desconto, 1e-6);
});

test("precatório: fora da curva avisa, e entrada ruim vira null (não um número inventado)", () => {
  assert.equal(precatorio({ valor: 1000, meses: 6, indice: "nenhum", spreadPP: 5 }, curva, null).extrapolado, true);
  const ok = { valor: 1000, meses: 24, indice: "nenhum", spreadPP: 5 };
  assert.ok(precatorio(ok, curva, null));
  for (const mudanca of [{ valor: 0 }, { valor: NaN }, { meses: 0 }, { meses: MAX_MESES_PRECATORIO + 1 }, { meses: 12.5 }, { spreadPP: -1 }, { retencaoPct: 100 }, { retencaoPct: -1 }, { desagioPct: 100 }, { desagioPct: -5 }, { custos: -1 }, { jurosPP: -1 }]) {
    assert.equal(precatorio({ ...ok, ...mudanca }, curva, null), null, JSON.stringify(mudanca));
  }
  assert.equal(precatorio(ok, null, null), null);
  assert.equal(precatorio({ ...ok, indice: "selic" }, curva, null), null); // Selic sem caminho
});

test("quanto mais demora, maior o deságio justo (sem correção)", () => {
  const d = (meses) => precatorio({ valor: 1000, meses, indice: "nenhum", spreadPP: 5 }, curva, null).desagio_justo_pct;
  assert.ok(d(12) < d(36) && d(36) < d(84));
});

// --------------------------------------------------------------------------------------------- o caminho, com a foto de verdade
test("caminho de correção da foto de 31/10/2026: Selic do ano em curso é a média, os anos seguintes são os do Focus", () => {
  const c = caminhoDeCorrecao(foto);
  assert.equal(c.anoBase, 2026);
  assert.equal(c.mesBase, 9); // outubro
  perto(c.selicDoAno(2026), (13.75 + 13.25) / 2);
  perto(c.selicDoAno(2027), 11.75);
  perto(c.selicDoAno(2028), 10);
  perto(c.selicDoAno(2029), 10);
  perto(c.selicDoAno(2035), 10); // além do Focus, repete o último
  perto(c.ipcaDoAno(2026), 5.1891);
  perto(c.ipcaDoAno(2029), 3.5);
  perto(c.ipcaDoAno(2040), 3.5);
  assert.deepEqual(c.anosDoFocus.selic, [2026, 2027, 2028, 2029]);
});

test("sem Focus na foto: a Selic é a meta de hoje e o IPCA não existe", () => {
  const semFocus = { ...foto, registros: foto.registros.filter((r) => r.fonte !== "bcb_focus"), derivados: { ...foto.derivados, variacoes: foto.derivados.variacoes.filter((v) => v.fonte !== "bcb_focus") } };
  const c = caminhoDeCorrecao(semFocus);
  perto(c.selicDoAno(2027), 13.75);
  assert.equal(c.ipcaDoAno(2027), null);
  assert.equal(fatorDeCorrecao({ meses: 12, indice: "ipca" }, c), null);
  assert.ok(fatorDeCorrecao({ meses: 12, indice: "selic" }, c) > 1.13);
});

test("precatório com a foto de verdade: Selic de 36 meses a partir de out/2026 bate com a conta feita à mão", () => {
  const c = caminhoDeCorrecao(foto);
  // nov e dez/2026 (2 meses) a 13,5%; 2027 e 2028 e 2029 inteiros (36 meses = nov/26 a out/29): 10 meses de 2029
  const esperado = 1.135 ** (2 / 12) * 1.1175 * 1.1 * 1.1 ** (10 / 12);
  perto(fatorDeCorrecao({ meses: 36, indice: "selic" }, c), esperado);
  const nominal = curvasDaFoto(foto).find((x) => x.id === "nominal");
  const r = precatorio({ valor: 100000, meses: 36, indice: "selic", spreadPP: 5 }, nominal, c);
  perto(r.valor_esperado, 100000 * esperado);
  assert.ok(r.valor_presente > 0 && r.valor_presente < r.valor_esperado);
});

// --------------------------------------------------------------------------------------------- preço pedido, ágio e custos
test("avaliar um preço pedido: o que sai do bolso, a folga e o preço máximo", () => {
  const a = avaliaPreco({ valorJusto: 40000, preco: 38000, custos: 500 });
  assert.deepEqual([a.pago, a.folga, a.cabe, a.preco_maximo], [38500, 1500, true, 39500]);
  const b = avaliaPreco({ valorJusto: 40000, preco: 41000 });
  assert.deepEqual([b.pago, b.folga, b.cabe], [41000, -1000, false]);
  assert.equal(avaliaPreco({ valorJusto: 40000, preco: 0 }), null);
  assert.equal(avaliaPreco({ valorJusto: NaN, preco: 10 }), null);
  assert.equal(avaliaPreco({ valorJusto: 40000, preco: 10, custos: -1 }), null);
});

test("ágio nas duas bases (crédito e saldo devedor) e o custo total de quem compra", () => {
  const g = agioDaCota({ preco: 20000, custos: 1000, credito: 100000, saldoDevedor: 60000 });
  perto(g.sobre_credito_pct, 20);
  perto(g.sobre_saldo_pct, 33.333333333333336);
  assert.equal(g.custo_total, 81000);
  assert.equal(agioDaCota({ preco: 20000, credito: 0, saldoDevedor: 1 }), null);
});

test("retorno da oferta com custos: o que sai do bolso é preço + custos, e sem custos nada muda", () => {
  const nominal = { base: BASE, pontos: [{ anos: 1, taxa: 10 }, { anos: 3, taxa: 12 }] };
  const curvas = { nominal, real: null };
  const base = { preco: 38000, valor: 50000, meses: 24, corrigido: false, spreadPP: 5 };
  const sem = retornoDaOferta(base, curvas, 13);
  const zero = retornoDaOferta({ ...base, custos: 0 }, curvas, 13);
  assert.deepEqual(sem, zero);
  const com = retornoDaOferta({ ...base, custos: 2000 }, curvas, 13);
  perto(com.retorno_aa, retornoDaOferta({ ...base, preco: 40000 }, curvas, 13).retorno_aa);
  assert.equal(com.pago, 40000);
  perto(com.folga, sem.preco_maximo - 40000);
  perto(com.preco_maximo, sem.preco_maximo - 2000);
  assert.equal(retornoDaOferta({ ...base, custos: -1 }, curvas, 13), null);
});

// --------------------------------------------------------------------------------------------- prazo em data
test("meses de calendário: somar e medir", () => {
  assert.equal(somaMeses("2026-10-31", 1), "2026-11-01");
  assert.equal(somaMeses("2026-10-31", 3), "2027-01-01");
  assert.equal(somaMeses("2026-12", 12), "2027-12-01");
  assert.equal(somaMeses("2026-01-15", 0), "2026-01-01");
  assert.equal(mesesEntre("2026-10-31", "2029-03"), 29);
  assert.equal(mesesEntre("2026-10-31", "2026-10"), 0);
  assert.equal(mesesEntre("2026-10-31", "2026-09-30"), -1);
  assert.equal(mesesEntre("2026-10-31", somaMeses("2026-10-31", 47)), 47);
});
