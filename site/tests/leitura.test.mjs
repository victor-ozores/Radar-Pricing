import assert from "node:assert/strict";
import test from "node:test";

import { fraseDaCurva, fraseDasBarras, heroDoDia, leituraDoDia, metricaDoPanorama, prazoDeReferencia } from "../js/leitura.js";
import { cotasDoSetor } from "../js/modelo.js";
import { anosDoPrazoIngenuo } from "./calendario_ingenuo.mjs";

const ponto = (anos, taxa, ref7) => ({ vencimento: "2030-01-01", anos, taxa, ref7, dias7: ref7 === null ? null : 7 });
/** Uma curva simples: sobe de 13 para 15 e, 7 dias antes, estava 1 ponto abaixo. */
const MESES = [6, 12, 24, 36, 48]; // os prazos da tabela: cada ponto da curva fica em um deles, então a taxa do prazo é a do ponto
const curva = (taxas, ref = (t) => t - 1) => ({ titulo: "t", base: "2026-10-29", pontos: taxas.map((t, i) => ponto(anosDoPrazoIngenuo("2026-10-29", MESES[i]), t, ref(t))) });

const linhaDoSetor = (descricao, valor, delta, unidade = "%", data = "2026-06-30") => ({ serie: "x", grupo: "g", descricao, unidade, data, valor, data_anterior: "2026-03-31", anterior: valor - delta, delta });

const banco = (serie, nome, data_ref, valor) => ({ fonte: "bcb_taxas", serie, dimensao: `banco=${nome}`, data_ref, valor, unidade: "% a.a.", descricao: "" });

function estado(extra = {}) {
  return {
    foto: {
      registros: [banco("taxa_financiamento_imobiliario", "A", "2026-09-01", 14), banco("taxa_financiamento_imobiliario", "B", "2026-09-01", 16), banco("taxa_financiamento_veiculos", "C", "2026-10-09", 22), banco("taxa_financiamento_veiculos", "D", "2026-10-09", 24)],
      derivados: {
        variacoes: [],
        setor: [linhaDoSetor("Índice de Inadimplência - Total", 2.12, -0.13), linhaDoSetor("Índice de Exclusão - Total", 48.8, -0.03)],
      },
    },
    parametros: { prazos_meses: [6, 12, 24, 36, 48], valor_face: 1000 },
    curvas: { nominal: curva([13, 14, 15, 15, 15]), real: curva([6, 7, 7, 7, 7]) },
    spread: 5,
    ...extra,
  };
}

test("o prazo de referência é o que fica mais perto de 3 anos", () => {
  assert.equal(prazoDeReferencia([6, 12, 24, 36, 48]), 36);
  assert.equal(prazoDeReferencia([6, 12, 24, 48]), 24);
  assert.equal(prazoDeReferencia([12]), 12);
});

test("o número grande: quanto o valor de hoje mudou em 7 dias, com o motivo", () => {
  const h = heroDoDia(estado());
  assert.equal(h.sentido, "caiu");
  assert.match(h.numero, /^−\d,\d%$/);
  assert.match(h.legenda, /em 7 dias.*R\$ 1\.000.*3 anos.*R\$ fixos/);
  assert.equal(h.antes.startsWith("R$ "), true);
  assert.match(h.porque, /subiram de 14,00% para 15,00% ao ano/);
  assert.match(h.porque, /Juros mais altos descontam mais/);
});

test("o número grande quando os juros caem sobe o valor", () => {
  const h = heroDoDia(estado({ curvas: { nominal: curva([13, 14, 15, 15, 15], (t) => t + 1), real: null } }));
  assert.equal(h.sentido, "subiu");
  assert.match(h.numero, /^\+\d,\d%$/);
  assert.match(h.porque, /caíram de 16,00% para 15,00%/);
  assert.match(h.porque, /Juros mais baixos descontam menos/);
});

test("sem a taxa de 7 dias atrás o número grande é a taxa do dia e diz que não há comparação", () => {
  const h = heroDoDia(estado({ curvas: { nominal: curva([13, 14, 15, 15, 15], () => null), real: null } }));
  assert.equal(h.sentido, "neutro");
  assert.equal(h.numero, "15,00%");
  assert.match(h.porque, /não traz a taxa de 7 dias/);
  assert.equal(heroDoDia(estado({ curvas: { nominal: null, real: null } })), null);
});

test("o resumo de hoje tem as três frases, só com o que a foto traz", () => {
  const frases = leituraDoDia(estado());
  assert.deepEqual(frases.map((f) => f.icone), ["tendencia", "banco", "grupo"]);
  assert.match(frases[0].texto, /^Tesouro de 3 anos: de 14,00% para 15,00% ao ano em R\$ fixos \(\+1,00 p\.p\.\) e de 6,00% para 7,00% ao ano acima do IPCA/);
  assert.match(frases[1].texto, /^Financiar um imóvel custa 15,00% ao ano na mediana de 2 bancos; um veículo, 23,00% \(2 bancos\)\. É o crédito que concorre com o consórcio\.$/);
  assert.match(frases[2].texto, /inadimplência está em 2,12% \(−0,13 p\.p\. no trimestre\) e o índice de exclusão, em 48,80%.*jun\/2026/);
});

test("o resumo pula a frase que a foto não permite", () => {
  const sem = estado();
  sem.foto = { ...sem.foto, registros: [], derivados: { variacoes: [], setor: [] } };
  const frases = leituraDoDia(sem);
  assert.deepEqual(frases.map((f) => f.icone), ["tendencia"]);
  assert.deepEqual(leituraDoDia({ ...sem, curvas: { nominal: null, real: null } }), []);
});

test("as frases dos gráficos dizem o que está no desenho", () => {
  const e = estado();
  assert.match(fraseDaCurva(e), /^Em 7 dias, a curva subiu: \+1,00 p\.p\. em 6 meses e \+1,00 p\.p\. em 4 anos\.$/);
  assert.match(fraseDasBarras(e), /^Quanto mais longe o prazo, maior o efeito: −\d,\d% em 6 meses e −\d,\d% em 4 anos\.$/);
  assert.equal(fraseDaCurva(estado({ curvas: { nominal: null, real: null } })), null);
  // nem toda curva sobe junto: a frase não promete o que não vê
  const mista = estado({ curvas: { nominal: curva([13, 14, 15, 15, 15], (t) => (t === 13 ? t + 1 : t - 1)), real: null } });
  assert.match(fraseDaCurva(mista), /a curva mexeu:/);
});

test("métrica do Panorama pela descrição", () => {
  const f = estado().foto;
  assert.equal(metricaDoPanorama(f, /Inadimplência - Total/).valor, 2.12);
  assert.equal(metricaDoPanorama(f, /não existe/), null);
});

test("cotas do setor: ativas, excluídas por segmento (as maiores primeiro) e o índice de exclusão que confere", () => {
  const foto = {
    derivados: {
      setor: [
        linhaDoSetor("Cotas ativas - Total", 13376.26, 374.16, "mil"),
        linhaDoSetor("Cotas excluídas - Total", 12751.82, 342.74, "mil"),
        linhaDoSetor("Cotas excluídas - Total - Imóveis", 3808.66, 195.84, "mil"),
        linhaDoSetor("Cotas excluídas - Total - Automóveis", 4724.69, 58.63, "mil"),
        linhaDoSetor("Cotas excluídas - Total - Motocicletas", 3135.09, 44.1, "mil"),
        linhaDoSetor("Cotas excluídas - Total - Outros Bens Móveis e Serviços", 1083.6, 44.12, "mil"),
        linhaDoSetor("Índice de Exclusão - Total", 48.8, -0.03),
      ],
    },
  };
  const c = cotasDoSetor(foto);
  assert.deepEqual(c.porSegmento.map((s) => s.segmento), ["Imóveis", "Automóveis", "Outros bens e serviços", "Motocicletas"]);
  assert.equal(c.excluidas.delta, 342.74);
  assert.ok(Math.abs(c.calculado - c.indice.valor) < 0.01, `índice calculado ${c.calculado} contra ${c.indice.valor}`);
  assert.equal(cotasDoSetor({ derivados: { setor: [] } }), null);
});

import { fraseDasCurvas, fraseDasExcluidas, fraseDoCreditoComparado, fraseDoFocus } from "../js/leitura.js";

test("frase das curvas: do prazo mais curto ao mais longo de cada título", () => {
  const frase = fraseDasCurvas([
    { nome: "Prefixado", pontos: [{ anos: 5.17, taxa: 15.17 }, { anos: 0.18, taxa: 13.45 }, { anos: 2.18, taxa: 14.8 }] },
    { nome: "IPCA+", pontos: [{ anos: 2.54, taxa: 7.76 }, { anos: 23.79, taxa: 7.13 }] },
    { nome: "Só um ponto", pontos: [{ anos: 1, taxa: 9 }] },
  ]);
  assert.equal(frase, "Prefixado: de 13,45% em 0,2 anos a 15,17% em 5,2 anos. IPCA+: de 7,76% em 2,5 anos a 7,13% em 23,8 anos.");
  assert.equal(fraseDasCurvas([]), null);
});

test("frase do Focus: Selic e IPCA do primeiro ao último ano", () => {
  const foco = { selic: [{ ano: 2029, valor: 10 }, { ano: 2026, valor: 13.25 }], ipca: [{ ano: 2026, valor: 5.19 }, { ano: 2029, valor: 3.5 }] };
  assert.equal(fraseDoFocus(foco), "O mercado espera a Selic em 13,25% no fim de 2026 e 10,00% em 2029; o IPCA em 5,19% no fim de 2026 e 3,50% em 2029.");
  assert.equal(fraseDoFocus({ selic: [{ ano: 2026, valor: 13 }], ipca: [] }), null);
});

test("frase do crédito: veículo contra imóvel, com a diferença em p.p.", () => {
  const credito = { imobiliario: { resumo: { mediana: 14.805 } }, veiculos: { resumo: { mediana: 23.63 } } };
  assert.equal(fraseDoCreditoComparado(credito), "Pela mediana, financiar um veículo (23,63%) é 8,8 p.p. mais caro que financiar um imóvel (14,81%).");
  assert.match(fraseDoCreditoComparado({ imobiliario: { resumo: { mediana: 20 } }, veiculos: { resumo: { mediana: 18 } } }), /2,0 p\.p\. mais barato/);
  assert.equal(fraseDoCreditoComparado({ imobiliario: null, veiculos: credito.veiculos }), null);
});

test("frase das cotas excluídas: o segmento que mais concentra", () => {
  const cotas = { excluidas: { delta: 342.74 }, porSegmento: [{ segmento: "Imóveis", delta: 195.84 }, { segmento: "Automóveis", delta: 58.63 }] };
  assert.equal(fraseDasExcluidas(cotas), "No trimestre, 343 mil cotas foram excluídas. Imóveis concentra 57% disso (196 mil).");
  assert.equal(fraseDasExcluidas({ excluidas: { delta: -5 }, porSegmento: [{ segmento: "Imóveis", delta: 1 }] }), null);
  assert.equal(fraseDasExcluidas(null), null);
});

test("a frase das barras não promete 'quanto mais longe, maior' quando não é verdade", () => {
  // no prazo curto a taxa andou 3 p.p.; nos longos, só 1 p.p.: o efeito não cresce com o prazo
  const irregular = estado({ curvas: { nominal: curva([13, 14, 15, 15, 15], (t) => (t === 13 ? t - 3 : t - 1)), real: null } });
  const frase = fraseDasBarras(irregular);
  assert.match(frase, /^O valor mudou /);
  assert.doesNotMatch(frase, /Quanto mais longe/);
});
