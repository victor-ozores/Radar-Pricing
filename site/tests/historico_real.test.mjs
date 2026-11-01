// A foto de verdade (31/10/2026, baixada da branch data): o histórico do painel tem que bater com as contas do robô.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ancoraNoTempo, custoDoDinheiro, dataAteO, focusNoTempo, titulosDoTesouro } from "../js/historico.js";
import { somaDias } from "../js/foto.js";
import * as modelo from "../js/modelo.js";

const foto = JSON.parse(readFileSync(new URL("./fixtures/foto-2026-10-31.json", import.meta.url), "utf8"));

test("a âncora de 3 anos de hoje é a mesma que o robô calculou", () => {
  const linha = foto.derivados.valor_presente.find((l) => l.meses === 36);
  for (const [titulo, chave] of [["Tesouro Prefixado", "nominal"], ["Tesouro IPCA+", "real"]]) {
    const serie = ancoraNoTempo(foto, titulo, 36);
    assert.ok(serie.length >= 20, `${titulo}: série curta demais (${serie.length})`);
    assert.equal(serie.at(-1).data, foto.derivados.ancoras[chave === "nominal" ? "curva_nominal" : "curva_real"].base);
    assert.ok(Math.abs(serie.at(-1).valor - linha[chave].taxa_ancora) < 0.00006, `${titulo}: ${serie.at(-1).valor} contra ${linha[chave].taxa_ancora}`);
  }
});

test("a taxa de 7 dias atrás do histórico é a mesma que o robô guardou como referência, vencimento a vencimento", () => {
  const todos = titulosDoTesouro(foto);
  let conferidos = 0;
  for (const curva of modelo.curvas(foto)) {
    for (const p of curva.pontos) {
      const t = todos.find((x) => x.titulo === curva.titulo && x.vencimento === p.vencimento);
      assert.equal(t.pontos.at(-1).valor, p.taxa, `${curva.titulo} ${p.vencimento}: taxa de hoje`);
      const datas = t.pontos.map((x) => x.data);
      const dia = dataAteO(datas, somaDias(curva.base, -7));
      const antes = t.pontos.find((x) => x.data === dia).valor;
      assert.ok(Math.abs(antes - p.ref7) < 1e-9, `${curva.titulo} ${p.vencimento}: ${antes} contra ${p.ref7}`);
      conferidos++;
    }
  }
  assert.equal(conferidos, 11); // 5 vencimentos do Prefixado e 6 do IPCA+
});

test("o histórico da foto de verdade: ~5 semanas de Tesouro, Selic de 2 meses e Focus semanal", () => {
  assert.ok(titulosDoTesouro(foto)[0].pontos.length >= 20);
  assert.equal(titulosDoTesouro(foto).length, 15);
  const custo = custoDoDinheiro(foto);
  assert.ok(custo.length >= 40);
  assert.ok(custo.every((l) => l.meta === undefined || (l.meta > 0 && l.meta < 40)));
  const f = focusNoTempo(foto);
  assert.ok(f.anos.length >= 3 && f.linhas.length >= 20);
});
