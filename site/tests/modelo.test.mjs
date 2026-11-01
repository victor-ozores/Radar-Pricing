import assert from "node:assert/strict";
import test from "node:test";

import { abac, creditos, curvas, focus, manchetes, mediana, movimentos, panorama, percentil, problemas, textoDaMudanca } from "../js/modelo.js";

const registro = (serie, dimensao, data_ref, valor, unidade = "% a.a.") => ({ fonte: "x", serie, dimensao, data_ref, valor, unidade, descricao: "" });

const foto = {
  versao: 1,
  data: "2026-10-30",
  status: "ok",
  fontes: [
    { id: "bcb_sgs", papel: "essencial", situacao: "ok", n_registros: 1, falhas: [], atrasos: [], avisos: [] },
    { id: "ibge", papel: "complementar", situacao: "falhou", n_registros: 0, falhas: [], atrasos: [], avisos: [], erro: "timeout" },
  ],
  mudancas: [],
  registros: [
    registro("taxa_financiamento_veiculos", "banco=A", "2026-10-08", 10),
    registro("taxa_financiamento_veiculos", "banco=B", "2026-10-08", 30),
    registro("taxa_financiamento_veiculos", "banco=C", "2026-10-09", 30),
    registro("taxa_financiamento_veiculos", "banco=A", "2026-10-09", 10),
    registro("taxa_financiamento_veiculos", "banco=B", "2026-10-09", 20),
    registro("taxa_financiamento_veiculos", "banco=D", "2026-10-09", 40),
    registro("taxa_financiamento_imobiliario", "banco=X", "2026-08-01", 11),
    registro("taxa_financiamento_imobiliario", "banco=X", "2026-09-01", 12),
    registro("taxa_financiamento_imobiliario", "banco=Y", "2026-09-01", 16),
    registro("abac_ticket_medio", "", "2026-08-31", 113.57, "R$ mil"),
    registro("abac_ticket_medio", "", "2026-09-30", 116.76, "R$ mil"),
    registro("focus_selic_reuniao", "reuniao=R2/2027", "2026-10-23", 12.5),
    registro("focus_selic_reuniao", "reuniao=R1/2027", "2026-10-23", 13),
    registro("focus_selic_reuniao", "reuniao=R1/2027", "2026-10-16", 99),
  ],
  derivados: {
    ancoras: {
      cdi_anualizado: null,
      curva_nominal: { titulo: "Tesouro Prefixado", base: "2026-10-29", pontos: [{ vencimento: "2029-01-01", anos: 2.2, taxa: 14.8 }, { vencimento: "2031-01-01", anos: 4.2, taxa: 15.1 }] },
      curva_real: null,
    },
    valor_presente: [],
    setor: [
      { serie: "panorama_61", grupo: "Inadimplência", descricao: "Inadimplência", unidade: "%", data: "2026-06-30", valor: 4, data_anterior: "2026-03-31", anterior: 3.5, delta: 0.5 },
      { serie: "panorama_1", grupo: "Administradoras de Consórcio", descricao: "Adm", unidade: "unidade", data: "2026-06-30", valor: 131, data_anterior: "2026-03-31", anterior: 132, delta: -1 },
    ],
    variacoes: [
      { fonte: "tesouro", serie: "tesouro_taxa_compra", dimensao: "titulo=Tesouro Prefixado|vencimento=2029-01-01", valor: 14.8, unidade: "% a.a.", data: "2026-10-29", variacoes: { 1: null, 7: { ref_data: "2026-10-22", dias: 7, valor_ref: 12.75, delta: 2.05 }, 30: null } },
      { fonte: "bcb_taxas", serie: "mediana_taxa_financiamento_veiculos", dimensao: "", valor: 25, unidade: "% a.a.", data: "2026-10-09", variacoes: { 7: { ref_data: "2026-10-02", dias: 7, valor_ref: 24, delta: 1 } } },
      { fonte: "bcb_taxas", serie: "mediana_taxa_financiamento_imobiliario", dimensao: "", valor: 14, unidade: "% a.a.", data: "2026-09-01", variacoes: { 7: null } },
      { fonte: "bcb_focus", serie: "focus_selic_anual", dimensao: "ano=2027", valor: 11.75, unidade: "% a.a.", data: "2026-10-23", variacoes: { 7: { ref_data: "2026-10-16", dias: 7, valor_ref: 12, delta: -0.25 } } },
      { fonte: "bcb_focus", serie: "focus_selic_anual", dimensao: "ano=2026", valor: 13.25, unidade: "% a.a.", data: "2026-10-23", variacoes: {} },
    ],
  },
};

test("mediana e percentil (interpolação linear, como o PERCENTIL.INC do Excel)", () => {
  assert.equal(mediana([3, 1, 2]), 2);
  assert.equal(mediana([4, 1, 3, 2]), 2.5);
  assert.equal(mediana([]), null);
  assert.equal(percentil([1, 2, 3, 4], 0.25), 1.75);
  assert.equal(percentil([1, 2, 3, 4], 0.75), 3.25);
  assert.equal(percentil([7], 0.5), 7);
  assert.equal(percentil([1, 2, 3, 4], 0), 1);
  assert.equal(percentil([1, 2, 3, 4], 1), 4);
});

test("crédito: usa só os bancos da data mais nova e compara com a mediana de 7 dias do robô", () => {
  const { veiculos, imobiliario } = creditos(foto);
  assert.equal(veiculos.data, "2026-10-09");
  assert.equal(veiculos.n, 4);
  assert.deepEqual(veiculos.bancos.map((b) => b.banco), ["A", "B", "C", "D"]);
  assert.deepEqual(veiculos.resumo, { menor: 10, p25: 17.5, mediana: 25, p75: 32.5, maior: 40 });
  assert.deepEqual(veiculos.anterior, { data: "2026-10-02", mediana: 24 });
  // imobiliário é mensal: sem variação de 7 dias, compara com a data anterior que a foto guarda
  assert.equal(imobiliario.n, 2);
  assert.deepEqual(imobiliario.anterior, { data: "2026-08-01", mediana: 11 });
});

test("crédito: sem registros devolve null, não quebra", () => {
  assert.deepEqual(creditos({ ...foto, registros: [] }), { imobiliario: null, veiculos: null });
});

test("curvas: junta a variação de cada vencimento e ignora a curva que a foto não tem", () => {
  const lista = curvas(foto);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].nome, "Prefixado");
  assert.equal(lista[0].pontos[0].d7, 2.05);
  assert.equal(lista[0].pontos[0].ref7, 12.75); // a taxa deste vencimento 7 dias atrás
  assert.equal(lista[0].pontos[0].dias7, 7);
  assert.equal(lista[0].pontos[1].ref7, null);
  assert.equal(lista[0].pontos[0].d1, null);
  assert.equal(lista[0].pontos[1].d7, null); // vencimento sem entrada de variação
});

test("focus: ordena por ano e usa a edição mais nova das reuniões", () => {
  const f = focus(foto);
  assert.deepEqual(f.selic.map((x) => x.ano), [2026, 2027]);
  assert.deepEqual(f.reunioes, [{ reuniao: "R1/2027", valor: 13 }, { reuniao: "R2/2027", valor: 12.5 }]);
  assert.equal(f.data, "2026-10-23");
});

test("ABAC e Panorama", () => {
  const a = abac(foto);
  assert.equal(a.length, 1);
  assert.equal(a[0].ultimo.valor, 116.76);
  assert.ok(Math.abs(a[0].delta - 3.19) < 1e-9);
  const p = panorama(foto);
  assert.equal(p.grupos.length, 2);
  assert.deepEqual(p.destaques.map((g) => g.grupo), ["Inadimplência"]);
  assert.equal(p.data, "2026-06-30");
});

test("manchetes: só aparece o número que a foto tem", () => {
  const ids = manchetes(foto).map((m) => m.id);
  assert.ok(ids.includes("fin_veiculos") && ids.includes("fin_imobiliario") && ids.includes("focus_selic"));
  assert.ok(!ids.includes("selic_meta") && !ids.includes("cdi") && !ids.includes("ancora_ipca"));
  assert.equal(manchetes(foto).find((m) => m.id === "focus_selic").rotulo, "Selic esperada para 2027");
});

test("problemas: fonte que não está OK, com o nome legível", () => {
  const p = problemas(foto);
  assert.equal(p.length, 1);
  assert.equal(p[0].id, "ibge");
  assert.match(p[0].nome, /IBGE/);
});

test("mudança de fonte que falhou perde o miolo técnico", () => {
  const m = { texto: "Fonte ibge (complementar): FALHOU (IBGE IPCA: URLError: <urlopen error timed out> em https://x (depois de 2 tentativas))" };
  assert.equal(textoDaMudanca(m), "IBGE: IPCA (conferência do BCB): fonte complementar sem resposta");
  assert.equal(textoDaMudanca({ texto: "Focus: Selic esperada para 2028 foi de 10,50% para 10,00%" }), "Focus: Selic esperada para 2028 foi de 10,50% para 10,00%");
  assert.equal(textoDaMudanca({}), "");
});

test("movimentos: vencimentos do mesmo título viram uma linha, os maiores primeiro", () => {
  const t = (venc, delta, titulo = "Tesouro Prefixado") => ({ regra: "tesouro", severidade: "media", serie: "tesouro_taxa_compra", dimensao: `titulo=${titulo}|vencimento=${venc}-01-01`, delta, texto: `${titulo} ${venc}: taxa (+${delta} p.p. em 7 dias)` });
  const lista = movimentos({
    mudancas: [
      t(2029, 2.05), t(2031, 2.26), t(2032, 2.23),
      t(2032, 1.03, "Tesouro IPCA+"),
      { severidade: "media", serie: "focus", delta: -0.5, texto: "Focus: Selic esperada para 2028 foi de 10,50% para 10,00% (-0,50 p.p. em 7 dias)" },
      { severidade: "info", texto: "Fonte ibge (complementar): FALHOU (timeout)" },
    ],
  });
  assert.equal(lista[0].texto, "Tesouro Prefixado subiu de +2,05 p.p. a +2,26 p.p. em 7 dias (vencimentos 2029 a 2032)");
  assert.equal(lista[1].texto, "Tesouro IPCA+ subiu +1,03 p.p. em 7 dias (vencimento 2032)");
  assert.match(lista[2].texto, /^Focus: Selic esperada para 2028/);
  assert.equal(lista.at(-1).texto, "IBGE: IPCA (conferência do BCB): fonte complementar sem resposta");
  assert.equal(lista.length, 4);
  assert.deepEqual(movimentos({}), []);
});

test("movimentos: título que sobe em um vencimento e cai em outro 'mexeu'", () => {
  const t = (venc, delta) => ({ severidade: "media", serie: "tesouro_taxa_compra", dimensao: `titulo=Tesouro IPCA+|vencimento=${venc}-05-15`, delta, texto: "x em 7 dias" });
  assert.match(movimentos({ mudancas: [t(2029, 0.3), t(2035, -0.4)] })[0].texto, /^Tesouro IPCA\+ mexeu de \+0,30 p\.p\. a −0,40 p\.p\. em 7 dias/);
});

import { fontes, resumoDoErro } from "../js/modelo.js";

test("o erro de uma fonte vira uma frase curta, sem endereço nem exceção de rede", () => {
  assert.equal(resumoDoErro("IBGE IPCA: URLError: <urlopen error timed out> em https://x/y (depois de 2 tentativas)"), "Sem resposta no tempo limite");
  assert.equal(resumoDoErro("BCB: HTTP 503 em https://x"), "A fonte respondeu com erro 503");
  assert.equal(resumoDoErro("a".repeat(200)).length, 120);
  assert.equal(resumoDoErro(null), "");
  const lista = fontes({ fontes: [{ id: "ibge", papel: "complementar", situacao: "falhou", erro: "timed out em https://x", falhas: [], atrasos: [], avisos: [] }] });
  assert.equal(lista[0].erroCurto, "Sem resposta no tempo limite");
});

test("observações da fonte: o erro vem em uma frase e não repete o texto cru; sem erro, valem as falhas", () => {
  const com = fontes({ fontes: [{ id: "ibge", papel: "complementar", situacao: "falhou", erro: "timed out em https://x", falhas: ["IBGE IPCA: URLError timed out em https://x"], atrasos: [], avisos: ["aviso"] }] });
  assert.deepEqual(com[0].observacoes, ["Sem resposta no tempo limite", "aviso"]);
  const sem = fontes({ fontes: [{ id: "abac", papel: "complementar", situacao: "ok", erro: null, falhas: ["faltou uma série"], atrasos: ["atrasou"], avisos: [] }] });
  assert.deepEqual(sem[0].observacoes, ["faltou uma série", "atrasou"]);
});
