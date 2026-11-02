// Os sete pontos de apresentação da auditoria de 01/11/2026 (docs/auditoria/calculos_2026-11-01.md): nenhum mudava um
// número, mas cada um deixava o texto ou o rótulo dizer o que não era. Aqui cada um tem um teste que falha sem a correção.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { impactoNoPrazo } from "../js/calc.js";
import { comUnidade, deltaComUnidade, numComMenos } from "../js/formato.js";
import { leituraDoDia } from "../js/leitura.js";
import * as modelo from "../js/modelo.js";

const foto = JSON.parse(readFileSync(new URL("./fixtures/foto-2026-10-31.json", import.meta.url), "utf8"));

function estadoReal() {
  const lista = modelo.curvas(foto);
  const par = foto.derivados.parametros;
  return { foto, parametros: par, curvas: { nominal: lista.find((c) => c.id === "nominal"), real: lista.find((c) => c.id === "real") }, spread: par.spread_demonstracao_pp };
}

test("a diferença da frase fecha com os números que a frase mostra (6,78% para 7,77% é +0,99, não +1,00)", () => {
  const [tesouro] = leituraDoDia(estadoReal());
  assert.match(tesouro.texto, /de 12,79% para 14,93% ao ano em R\$ fixos \(\+2,14 p\.p\.\)/);
  assert.match(tesouro.texto, /de 6,78% para 7,77% ao ano acima do IPCA \(\+0,99 p\.p\.\)/);
  // a conta exata não mudou (continua 0,9956): o que muda é só de onde sai a diferença mostrada
  const e = estadoReal();
  const r = impactoNoPrazo(e.curvas.real, 36, e.spread, 1000);
  assert.ok(Math.abs(r.taxa_hoje - r.taxa_antes - 0.9956) < 0.0001);
});

const registro = (serie, data_ref, valor, unidade) => ({ fonte: "abac", serie, dimensao: "", data_ref, valor, unidade, descricao: "" });
const fotoAbac = (datas) => ({
  registros: datas.flatMap((d, i) => [registro("abac_cotas_vendidas_no_ano", d, 3 + i, "milhões"), registro("abac_ticket_medio", d, 100 + i, "R$ mil"), registro("abac_participantes_ativos", d, 13 + i / 10, "milhões")]),
});

test("ABAC: só as séries 'no ano' são acumuladas; posição e média não", () => {
  const por = Object.fromEntries(modelo.abac(fotoAbac(["2026-08-31", "2026-09-30"])).map((a) => [a.serie, a.acumulado]));
  assert.equal(por.abac_cotas_vendidas_no_ano, true);
  assert.equal(por.abac_ticket_medio, false);
  assert.equal(por.abac_participantes_ativos, false);
});

test("ABAC: na virada do ano a série acumulada não tem variação; as outras continuam com a delas", () => {
  const meio = Object.fromEntries(modelo.abac(fotoAbac(["2026-10-31", "2026-11-30", "2026-12-31"])).map((a) => [a.serie, a.delta]));
  assert.equal(meio.abac_cotas_vendidas_no_ano, 1); // dezembro menos novembro
  const janeiro = Object.fromEntries(modelo.abac(fotoAbac(["2026-11-30", "2026-12-31", "2027-01-31"])).map((a) => [a.serie, a.delta]));
  assert.equal(janeiro.abac_cotas_vendidas_no_ano, null); // janeiro recomeça do zero: sem comparação
  assert.equal(janeiro.abac_ticket_medio, 1); // média do mês: janeiro contra dezembro faz sentido
  assert.ok(Math.abs(janeiro.abac_participantes_ativos - 0.1) < 1e-9);
});

test("Selic e inflação: as séries mensais avisam que a data é um mês", () => {
  const por = Object.fromEntries(modelo.seriesDoBanco(foto).map((s) => [s.serie, s.mensal]));
  assert.equal(por.ipca_mensal, true);
  assert.equal(por.ipca_12_meses, true);
  assert.equal(por.selic_acumulada_mes_anualizada, true);
  assert.equal(por.selic_meta, false);
  assert.equal(por.cdi, false);
});

test("um mês no singular, vários no plural", () => {
  assert.equal(comUnidade(1, "meses"), "1 mês");
  assert.equal(comUnidade(167, "meses"), "167 meses");
  assert.equal(deltaComUnidade(1, "meses"), "+1 mês");
  assert.equal(deltaComUnidade(-1, "meses"), "−1 mês");
  assert.equal(deltaComUnidade(-5, "meses"), "−5 meses");
  assert.equal(deltaComUnidade(0, "meses"), "0 meses");
});

test("número de eixo com o sinal de menos de verdade, sem o 'mais' e sem 'menos zero'", () => {
  assert.equal(numComMenos(-10), "−10");
  assert.equal(numComMenos(5), "5");
  assert.equal(numComMenos(0), "0");
  assert.equal(numComMenos(-0.2, 0), "0");
  assert.equal(numComMenos(-1500, 0), "−1.500");
  assert.equal(numComMenos(-2.55, 1), "−2,6");
  assert.equal(numComMenos(null), "—");
});
