import assert from "node:assert/strict";
import test from "node:test";

import { leituraDoNegocio, MARGEM_MINIMA_PCT } from "../js/calc.js";

const perto = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} contra ${b}`);

test("lucro em dinheiro, folga sobre o exigido e retorno ao ano, em forma fechada", () => {
  const l = leituraDoNegocio({ pagoHoje: 38000, recebe: 50000, valorJusto: 39324.2, anos: 2 });
  perto(l.total_pago, 38000);
  perto(l.lucro, 12000);
  perto(l.lucro_pct, (12000 / 38000) * 100);
  perto(l.folga, 1324.2);
  perto(l.folga_pct, (1324.2 / 38000) * 100);
  perto(l.retorno_aa, ((50000 / 38000) ** (1 / 2) - 1) * 100);
});

test("a situação: negativa é ruim, abaixo da margem é no limite, a partir da margem é bom", () => {
  const com = (folga) => leituraDoNegocio({ pagoHoje: 1000, recebe: 2000, valorJusto: 1000 + folga, anos: 1 }).situacao;
  assert.equal(MARGEM_MINIMA_PCT, 5);
  assert.equal(com(-0.01), "ruim");
  assert.equal(com(0), "limite"); // empate: não sobra nada
  assert.equal(com(49.99), "limite"); // 4,999% do que sai do bolso
  assert.equal(com(50), "bom"); // exatamente na margem de 5%
  assert.equal(com(500), "bom");
});

test("pode haver lucro em dinheiro e mesmo assim não compensar: rende menos que o retorno exigido", () => {
  const l = leituraDoNegocio({ pagoHoje: 45000, recebe: 50000, valorJusto: 39324.2, anos: 2 });
  assert.ok(l.lucro > 0);
  assert.equal(l.situacao, "ruim");
  assert.ok(l.folga < 0);
  perto(l.lucro, 5000);
});

test("com saídas futuras (as parcelas de uma cota ativa) o lucro as desconta, a folga olha só o que sai hoje e não há retorno ao ano", () => {
  const l = leituraDoNegocio({ pagoHoje: 20000, saidasFuturas: 114000, recebe: 100000, valorJusto: 3443.01, anos: 1 });
  perto(l.total_pago, 134000);
  perto(l.lucro, -34000);
  perto(l.lucro_pct, (-34000 / 134000) * 100);
  perto(l.folga, 3443.01 - 20000);
  assert.equal(l.retorno_aa, null);
  assert.equal(l.situacao, "ruim");
});

test("uma margem própria muda a fronteira entre no limite e bom", () => {
  const base = { pagoHoje: 1000, recebe: 2000, valorJusto: 1080, anos: 1 };
  assert.equal(leituraDoNegocio({ ...base, margemPct: 5 }).situacao, "bom");
  assert.equal(leituraDoNegocio({ ...base, margemPct: 10 }).situacao, "limite");
});

test("sem prazo, ou recebendo zero, não inventa retorno ao ano", () => {
  assert.equal(leituraDoNegocio({ pagoHoje: 1000, recebe: 1500, valorJusto: 1200 }).retorno_aa, null);
  assert.equal(leituraDoNegocio({ pagoHoje: 1000, recebe: 0, valorJusto: 0, anos: 1 }).retorno_aa, null);
});

test("entradas ruins dão null, nunca um número inventado", () => {
  const ok = { pagoHoje: 1000, recebe: 1500, valorJusto: 1200, anos: 1 };
  assert.ok(leituraDoNegocio(ok));
  for (const ruim of [{ pagoHoje: 0 }, { pagoHoje: -5 }, { pagoHoje: Number.NaN }, { recebe: Number.NaN }, { valorJusto: undefined }, { saidasFuturas: -1 }, { margemPct: -1 }]) {
    assert.equal(leituraDoNegocio({ ...ok, ...ruim }), null, JSON.stringify(ruim));
  }
});
