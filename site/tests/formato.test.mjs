import assert from "node:assert/strict";
import test from "node:test";

import { comUnidade, dataBR, deltaComUnidade, diaDaSemana, horaBRT, idade, lerNumero, mesAno, num, pct, pp, prazoEmTexto, reais, sinal } from "../js/formato.js";

test("números em português do Brasil", () => {
  assert.equal(num(13.75), "13,75");
  assert.equal(num(1234.5), "1.234,50");
  assert.equal(num(0.050788, 4), "0,0508");
  assert.equal(pct(14.805), "14,81%");
  assert.equal(reais(1000), "R$ 1.000,00");
  assert.equal(reais(579.746, 2), "R$ 579,75");
});

test("valor que não é número vira travessão, nunca 'NaN' nem 'null'", () => {
  for (const f of [num, pct, reais, sinal, pp]) {
    assert.equal(f(null), "—");
    assert.equal(f(undefined), "—");
    assert.equal(f(Number.NaN), "—");
    assert.equal(f("13"), "—");
  }
});

test("sinal explícito e variação em p.p.", () => {
  assert.equal(sinal(0.25), "+0,25");
  assert.equal(sinal(-0.5), "−0,50");
  assert.equal(pp(2.26), "+2,26 p.p.");
  assert.equal(pp(-0.25), "−0,25 p.p.");
});

test("valor que arredonda para zero não leva sinal (nem 'menos zero')", () => {
  assert.equal(sinal(0), "0,00");
  assert.equal(sinal(-0), "0,00");
  assert.equal(sinal(0.004), "0,00");
  assert.equal(sinal(-0.004), "0,00");
  assert.equal(sinal(-0.006), "−0,01");
});

test("datas não passam por fuso", () => {
  assert.equal(dataBR("2026-10-31"), "31/10/2026");
  assert.equal(dataBR("2026-10-31T00:00:05-03:00"), "31/10/2026");
  assert.equal(dataBR(null), "—");
  assert.equal(dataBR("lixo"), "—");
  assert.equal(mesAno("2026-09-30"), "set/2026");
  assert.equal(mesAno("2026-01-01"), "jan/2026");
  assert.equal(diaDaSemana("2026-10-31"), "sábado");
  assert.equal(horaBRT("2026-10-31T00:00:05-03:00"), "00:00");
  assert.equal(horaBRT(undefined), "—");
});

test("idade do dado", () => {
  assert.equal(idade(0), "hoje");
  assert.equal(idade(1), "1 dia");
  assert.equal(idade(22), "22 dias");
  assert.equal(idade(null), "—");
});

test("valor com a unidade que a fonte informa", () => {
  assert.equal(comUnidade(13.75, "% a.a."), "13,75% a.a.");
  assert.equal(comUnidade(4.58, "%"), "4,58%");
  assert.equal(comUnidade(0.050788, "% ao dia"), "0,0508% ao dia");
  assert.equal(comUnidade(131, "unidade"), "131");
  assert.equal(comUnidade(13.93, "milhões"), "13,93 milhões");
  assert.equal(comUnidade(454.13, "R$ bilhões"), "R$ 454,13 bilhões");
  assert.equal(comUnidade(116.76, "R$ mil"), "R$ 116,76 mil");
  assert.equal(comUnidade(null, "%"), "—");
});

test("diferença na unidade da série", () => {
  assert.equal(deltaComUnidade(-0.25, "% a.a."), "−0,25 p.p.");
  assert.equal(deltaComUnidade(1.14, "%"), "+1,14 p.p.");
  assert.equal(deltaComUnidade(-1, "unidade"), "−1");
  assert.equal(deltaComUnidade(0.38, "milhões"), "+0,38 milhões");
  assert.equal(deltaComUnidade(64.54, "R$ bilhões"), "+R$ 64,54 bilhões");
  assert.equal(deltaComUnidade(-3.19, "R$ mil"), "−R$ 3,19 mil");
  assert.equal(deltaComUnidade(undefined, "%"), "—");
});

test("lê o número como a pessoa digita em português", () => {
  assert.equal(lerNumero("50.000,50"), 50000.5);
  assert.equal(lerNumero("1,5"), 1.5);
  assert.equal(lerNumero("R$ 1.000"), 1000);
  assert.equal(lerNumero("1.500"), 1500); // grupo de 3 dígitos: milhar
  assert.equal(lerNumero("12.5"), 12.5); // ponto decimal
  assert.equal(lerNumero("0.5"), 0.5);
  assert.equal(lerNumero(" 7 % "), 7);
  assert.equal(lerNumero("-3,25"), -3.25);
  assert.equal(lerNumero(42), 42);
  assert.equal(lerNumero("1.234.567,89"), 1234567.89);
});

test("o que não é número vira null, nunca NaN", () => {
  for (const ruim of ["", "   ", "-", "abc", "1,2,3", "1..2", "12a", null, undefined, Number.NaN, Infinity, {}]) {
    assert.equal(lerNumero(ruim), null, String(ruim));
  }
});

test("prazo em palavras", () => {
  assert.equal(prazoEmTexto(6), "6 meses");
  assert.equal(prazoEmTexto(12), "1 ano");
  assert.equal(prazoEmTexto(36), "3 anos");
  assert.equal(prazoEmTexto(30), "30 meses");
});
