import assert from "node:assert/strict";
import test from "node:test";

import { CHOQUES_PP, sensibilidade } from "../js/calc.js";

const curva = { pontos: [{ anos: 1, taxa: 10 }, { anos: 3, taxa: 12 }] };

test("sensibilidade: choque 0 é o dia de hoje e o sinal da variação acompanha a taxa", () => {
  const [um, tres] = sensibilidade(curva, [12, 36], 5, 1000);
  assert.equal(um.taxa, 10);
  assert.ok(Math.abs(um.base - 1000 / 1.15) < 1e-9);
  const zero = um.celulas.find((c) => c.choque === 0);
  assert.equal(zero.variacao_pct, 0);
  assert.ok(Math.abs(zero.valor - um.base) < 1e-12);
  const mais1 = um.celulas.find((c) => c.choque === 1);
  assert.ok(Math.abs(mais1.valor - 1000 / 1.16) < 1e-9); // 12 meses: um ano inteiro de desconto
  assert.ok(mais1.variacao_pct < 0);
  assert.ok(um.celulas.find((c) => c.choque === -1).variacao_pct > 0);
  assert.equal(um.celulas.length, CHOQUES_PP.length);
  // o prazo mais longo sente mais o mesmo choque
  const longo = Math.abs(tres.celulas.find((c) => c.choque === 3).variacao_pct);
  const curto = Math.abs(um.celulas.find((c) => c.choque === 3).variacao_pct);
  assert.ok(longo > curto);
});

test("sensibilidade: a taxa de desconto nunca fica negativa e entradas ruins viram null", () => {
  const baixa = { pontos: [{ anos: 1, taxa: 1 }] };
  const [l] = sensibilidade(baixa, [12], 0, 1000, [-5]);
  assert.ok(Math.abs(l.celulas[0].valor - 1000) < 1e-9); // taxa 0%: o valor não muda com o tempo
  assert.equal(sensibilidade(null, [12], 5), null);
  assert.equal(sensibilidade(baixa, [12], -1), null);
  assert.equal(sensibilidade(baixa, [12], 5, 0), null);
});
