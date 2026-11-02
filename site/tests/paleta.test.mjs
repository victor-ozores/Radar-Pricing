import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/estilo.css", import.meta.url), "utf-8");

// Os 6 primeiros passos da paleta categórica documentada (skill de gráficos), conferidos em 02/11/2026 com o validador:
// claro (fundo #fffdf8): faixa de claridade, croma, separação para daltônicos entre vizinhas (pior 9,1), vizinhas em visão normal (pior 19,6);
// escuro (fundo #121a19): os mesmos testes (pior CVD 8,4; visão normal 19,3) e contraste >= 3:1. No claro, aqua, amarelo e magenta
// ficam abaixo de 3:1 e por isso a legenda mostra o valor de cada linha e há a tabela "Ver os números do gráfico" (regra de alívio).
const CLARO = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"];
const ESCURO = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300"];

const bloco = (inicio, fim) => css.slice(css.indexOf(inicio), fim ? css.indexOf(fim, css.indexOf(inicio) + 1) : undefined);
const tons = (trecho) => [1, 2, 3, 4, 5, 6].map((n) => new RegExp(`--t${n}:\\s*(#[0-9a-fA-F]{6})`).exec(trecho)?.[1].toLowerCase());

test("as cores das linhas do Tesouro são a paleta validada, no tema claro e no escuro", () => {
  const claro = bloco(':root,\n[data-tema="claro"]', '[data-tema="escuro"]');
  const escuro = bloco('[data-tema="escuro"] {');
  assert.deepEqual(tons(claro), CLARO);
  assert.deepEqual(tons(escuro), ESCURO);
});

test("não há duas cores iguais entre as 6 linhas, em nenhum dos temas", () => {
  assert.equal(new Set(CLARO).size, 6);
  assert.equal(new Set(ESCURO).size, 6);
});
