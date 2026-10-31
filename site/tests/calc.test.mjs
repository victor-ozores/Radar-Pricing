import assert from "node:assert/strict";
import test from "node:test";

import { arredonda, desconta, interpola, valorPresente } from "../js/calc.js";

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

test("valor presente: capitalização composta, 12 meses = 1 ano", () => {
  assert.equal(arredonda(valorPresente(1000, 10, 12), 2), 909.09);
  assert.equal(arredonda(valorPresente(1000, 10, 24), 2), 826.45);
  assert.equal(arredonda(valorPresente(1000, 0, 36), 2), 1000);
});

test("desconta: âncora + spread, e null quando a foto não tem a curva", () => {
  const r = desconta({ pontos }, 1000, 24, 5);
  assert.deepEqual(r, { taxa_ancora: 12, taxa_demonstracao: 17, vp_ancora: 797.19, vp_demonstracao: 730.51, extrapolado: false }); // 1000/1,12² e 1000/1,17²
  assert.equal(desconta(null, 1000, 24, 5), null);
  assert.equal(desconta({ pontos: [] }, 1000, 24, 5), null);
  assert.equal(desconta({ pontos }, 1000, 6, 5).extrapolado, true);
});

test("spread zero devolve o valor da âncora", () => {
  const r = desconta({ pontos }, 1000, 36, 0);
  assert.equal(r.vp_ancora, r.vp_demonstracao);
});
