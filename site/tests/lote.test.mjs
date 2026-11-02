import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { agioDaCota, avaliaPreco, cotaAtiva, cotaCancelada, interpola, MAX_PARCELAS } from "../js/calc.js";
import { calculaLote, EXEMPLO_DE_LOTE, MAX_LINHAS, TIPOS_DE_LOTE } from "../js/lote.js";
import { curvas as curvasDaFoto, observacoesDaFonte, textoDoAviso } from "../js/modelo.js";

const foto = JSON.parse(readFileSync(new URL("./fixtures/foto-2026-10-31.json", import.meta.url), "utf8"));
const lista = curvasDaFoto(foto);
const curvas = { nominal: lista.find((c) => c.id === "nominal"), real: lista.find((c) => c.id === "real") };
const ctx = { curvas, spreadPP: 5 };
const perto = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} contra ${b}`);

// --------------------------------------------------------------------------------------------- cota cancelada com taxa própria
test("taxa própria: o valor de hoje cresce à taxa informada e é descontado pela curva Prefixada mais o spread", () => {
  const meses = 36;
  const c = 4.5;
  const r = cotaCancelada({ valor: 80000, meses, corrigido: true, correcaoPct: c, spreadPP: 5 }, curvas);
  const [ancora] = interpola(curvas.nominal.pontos, meses / 12);
  const noPagamento = 80000 * (1 + c / 100) ** (meses / 12);
  perto(r.valor_no_pagamento, noPagamento);
  perto(r.taxa_ancora, ancora);
  perto(r.valor_presente, noPagamento / (1 + (ancora + 5) / 100) ** (meses / 12));
  perto(r.pct_do_valor, (r.valor_presente / 80000) * 100);
});

test("taxa própria prevalece sobre 'corrigido': a curva usada é a Prefixada mesmo com corrigido ligado", () => {
  const a = cotaCancelada({ valor: 50000, meses: 60, corrigido: true, correcaoPct: 5, spreadPP: 5 }, curvas);
  const b = cotaCancelada({ valor: 50000, meses: 60, corrigido: false, correcaoPct: 5, spreadPP: 5 }, curvas);
  perto(a.valor_presente, b.valor_presente);
});

test("taxa própria de 0% é o mesmo que sem correção, e sem taxa própria nada muda", () => {
  const sem = cotaCancelada({ valor: 50000, meses: 24, corrigido: false, spreadPP: 5 }, curvas);
  perto(cotaCancelada({ valor: 50000, meses: 24, corrigido: false, correcaoPct: 0, spreadPP: 5 }, curvas).valor_presente, sem.valor_presente);
  perto(cotaCancelada({ valor: 50000, meses: 24, corrigido: false, correcaoPct: null, spreadPP: 5 }, curvas).valor_presente, sem.valor_presente);
  perto(sem.valor_no_pagamento, 50000);
});

test("taxa própria: os prazos e os spreads vizinhos usam a mesma conta, e uma taxa inválida dá null", () => {
  const r = cotaCancelada({ valor: 50000, meses: 36, corrigido: false, correcaoPct: 6, spreadPP: 5 }, curvas);
  for (const p of r.prazos) perto(p.valor_no_pagamento, 50000 * 1.06 ** (p.meses / 12));
  for (const s of r.spreads) perto(s.valor_presente, (50000 * 1.06 ** 3) / (1 + (r.taxa_ancora + s.spread) / 100) ** 3);
  assert.equal(cotaCancelada({ valor: 50000, meses: 36, corrigido: false, correcaoPct: Number.NaN, spreadPP: 5 }, curvas), null);
  assert.equal(cotaCancelada({ valor: 50000, meses: 36, corrigido: false, correcaoPct: -100, spreadPP: 5 }, curvas), null);
});

// --------------------------------------------------------------------------------------------- várias cotas
test("cada linha da lista dá exatamente o que a calculadora individual dá", () => {
  const r = calculaLote("50.000;24;ipca;38.000;0\n120.000;60;sem;60.000;1.500\n80.000;36;4,5;;", "cancelada", ctx);
  assert.equal(r.linhas.length, 3);
  const um = cotaCancelada({ valor: 50000, meses: 24, corrigido: true, spreadPP: 5 }, curvas);
  perto(r.linhas[0].vale_hoje, um.valor_presente);
  perto(r.linhas[0].pct_do_valor, um.pct_do_valor);
  const dois = cotaCancelada({ valor: 120000, meses: 60, corrigido: false, spreadPP: 5 }, curvas);
  perto(r.linhas[1].vale_hoje, dois.valor_presente);
  const preco = avaliaPreco({ valorJusto: dois.valor_presente, preco: 60000, custos: 1500 });
  perto(r.linhas[1].folga, preco.folga);
  assert.equal(r.linhas[1].cabe, preco.cabe);
  perto(r.linhas[1].preco_maximo, preco.preco_maximo);
  const tres = cotaCancelada({ valor: 80000, meses: 36, corrigido: false, correcaoPct: 4.5, spreadPP: 5 }, curvas);
  perto(r.linhas[2].vale_hoje, tres.valor_presente);
  assert.equal(r.linhas[2].pago, undefined); // sem preço, sem veredito
});

test("cotas ativas: o valor da cota e o ágio nas duas bases vêm das mesmas contas", () => {
  const r = calculaLote("80.000;1.250;48;0;15.000;800", "ativa", ctx);
  const a = cotaAtiva({ credito: 80000, parcela: 1250, parcelas: 48, contemplacao: 0, spreadPP: 5 }, curvas.real);
  perto(r.linhas[0].vale_hoje, a.valor_da_cota);
  const agio = agioDaCota({ preco: 15000, custos: 800, credito: 80000, saldoDevedor: a.total_das_parcelas });
  perto(r.linhas[0].agio_credito_pct, agio.sobre_credito_pct);
  perto(r.linhas[0].agio_saldo_pct, agio.sobre_saldo_pct);
  perto(r.linhas[0].pago, 15800);
});

test("a lista aceita tabulação (copiada do Excel), título, linhas em branco e números do jeito brasileiro", () => {
  const texto = "Valor\tMeses\tCorreção\n\n50.000,00\t24\tIPCA\n\n80000\t36\t4,5\n";
  const r = calculaLote(texto, "cancelada", ctx);
  assert.equal(r.linhas.length, 2);
  assert.deepEqual(r.linhas.map((l) => l.n), [3, 5]); // o número da linha no texto, para achar o que corrigir
  assert.ok(r.linhas.every((l) => !l.erro));
  perto(r.linhas[0].vale_hoje, cotaCancelada({ valor: 50000, meses: 24, corrigido: true, spreadPP: 5 }, curvas).valor_presente);
});

test("correção em branco vale IPCA; 'sem', 'não' e acentos são entendidos; 0% é o mesmo que sem correção", () => {
  const r = calculaLote("50.000;24\n50.000;24;;\n50.000;24;Inflação\n50.000;24;não\n50.000;24;sem\n50.000;24;0", "cancelada", ctx);
  const v = r.linhas.map((l) => l.vale_hoje);
  perto(v[0], v[1]);
  perto(v[0], v[2]);
  perto(v[3], v[4]);
  perto(v[3], v[5]);
  assert.ok(Math.abs(v[0] - v[3]) > 1); // IPCA e sem correção dão valores diferentes
});

test("linhas ruins viram um aviso claro e não derrubam as outras", () => {
  const r = calculaLote("0;24\n50000;0\n50000;24;xyz\nabc\n50000;24;4,5\n50000;24;ipca;-5\n50000;24;ipca;100;-1\n50000;361", "cancelada", ctx);
  assert.deepEqual(r.linhas.map((l) => [l.n, l.erro ?? "ok"]), [
    [1, "valor a devolver inválido"],
    [2, "prazo: use meses inteiros, de 1 a 360"],
    [3, "correção: use ipca, sem ou uma taxa em % ao ano"],
    [4, "faltam colunas: esta lista precisa de pelo menos 2"],
    [5, "ok"],
    [6, "preço pedido inválido"],
    [7, "custos inválidos"],
    [8, "prazo: use meses inteiros, de 1 a 360"],
  ]);
  assert.equal(r.resumo.calculadas, 1);
  assert.equal(r.resumo.com_erro, 7);
});

test("cotas ativas: parcelas, contemplação e crédito são conferidos", () => {
  const r = calculaLote(`100000;1900;${MAX_PARCELAS + 1};0\n100000;1900;60;61\n100000;1900;60;12.5\n0;1900;60;12\n100000;0;60;12\n100000;1900;60`, "ativa", ctx);
  assert.deepEqual(r.linhas.map((l) => l.erro), [
    `parcelas: use de 1 a ${MAX_PARCELAS}`,
    "contemplação: de 0 até o número de parcelas",
    "contemplação: de 0 até o número de parcelas",
    "crédito inválido",
    "parcela inválida",
    "faltam colunas: esta lista precisa de pelo menos 4",
  ]);
});

test("a lista passa de 500 linhas: calcula as 500 primeiras e avisa", () => {
  const texto = Array.from({ length: MAX_LINHAS + 20 }, (_, i) => `${50000 + i};24;ipca`).join("\n");
  const r = calculaLote(texto, "cancelada", ctx);
  assert.equal(r.linhas.length, MAX_LINHAS);
  assert.equal(r.truncado, true);
});

test("o resumo soma só o que foi calculado, e 'cabem' conta só as linhas com preço", () => {
  const r = calculaLote("50.000;24;ipca;38.000;0\n50.000;24;ipca;45.000;0\nlixo;24\n30.000;18;sem;;", "cancelada", ctx);
  const [a, b, , d] = r.linhas;
  perto(r.resumo.soma_vale_hoje, a.vale_hoje + b.vale_hoje + d.vale_hoje);
  assert.equal(r.resumo.com_preco, 2);
  assert.equal(r.resumo.cabem, 1); // 38.000 cabe contra 39.324; 45.000 não
  perto(r.resumo.soma_pago, 83000);
  assert.equal(r.resumo.com_erro, 1);
});

test("os exemplos que vêm na tela calculam sem erro nos dois tipos", () => {
  for (const { id } of TIPOS_DE_LOTE) {
    const r = calculaLote(EXEMPLO_DE_LOTE[id], id, ctx);
    assert.ok(r.linhas.length >= 3, id);
    assert.equal(r.resumo.com_erro, 0, id);
    assert.ok(r.resumo.soma_vale_hoje > 0, id);
  }
});

test("cada linha com preço traz o lucro e o veredito, pela mesma regra das calculadoras", () => {
  const r = calculaLote("50.000;24;ipca;38.000;0\n120.000;60;ipca;60.000;1.500\n50.000;24;ipca;45.000;0\n30.000;18;sem;;", "cancelada", ctx);
  const [a, b, c, d] = r.linhas;
  assert.equal(a.situacao, "limite");
  perto(a.lucro, 12000);
  assert.equal(b.situacao, "bom");
  perto(b.lucro, 120000 - 61500); // o preço e os custos saem do bolso
  assert.equal(c.situacao, "ruim");
  perto(c.lucro, 5000); // lucra em dinheiro, mas rende menos que o exigido
  assert.equal(d.situacao, undefined); // sem preço, sem veredito
  assert.deepEqual([r.resumo.compensam, r.resumo.no_limite, r.resumo.nao_compensam], [1, 1, 1]);
  perto(r.resumo.soma_lucro, 12000 + 58500 + 5000);
  const ativa = calculaLote("80.000;1.250;48;0;15.000;800\n100.000;1.900;60;12;20.000", "ativa", ctx);
  assert.equal(ativa.linhas[0].situacao, "bom");
  perto(ativa.linhas[0].lucro, 80000 - (60000 + 15800)); // as parcelas também saem do bolso
  assert.equal(ativa.linhas[1].situacao, "ruim");
  perto(ativa.linhas[1].lucro, 100000 - (114000 + 20000));
});

// --------------------------------------------------------------------------------------------- aviso do robô sem nome interno
test("o aviso do robô sobre a ABAC mostra o nome do dado, não o código interno", () => {
  assert.equal(textoDoAviso("Sistema de Consórcios em julho/2026: dados econômicos: não achei abac_ticket_medio"), "Sistema de Consórcios em julho/2026: dados econômicos: não encontrei ticket médio");
  assert.equal(textoDoAviso("X: não achei abac_ticket_medio, abac_participantes_ativos"), "X: não encontrei ticket médio, participantes ativos");
  assert.equal(textoDoAviso("outro aviso qualquer"), "outro aviso qualquer");
  assert.deepEqual(observacoesDaFonte({ avisos: ["Y: não achei abac_ticket_medio"] }), ["Y: não encontrei ticket médio"]);
});
