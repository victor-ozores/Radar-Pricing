import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { fraseDoCapituloDaCurva, fraseDoCapituloDoCredito, fraseDoCapituloDoCusto, fraseDoCapituloDoSetor, manchetePrincipal } from "../js/narrativa.js";
import * as modelo from "../js/modelo.js";

const foto = JSON.parse(readFileSync(new URL("./fixtures/foto-2026-10-31.json", import.meta.url), "utf8"));

const ponto = (anos, taxa, d7) => ({ vencimento: `${2026 + Math.round(anos)}-01-01`, anos, taxa, d7, ref7: d7 === null ? null : taxa - d7, dias7: 7 });
const curva = (pontos) => ({ id: "nominal", nome: "Prefixado", pontos });
const estadoCom = (nominal, spread = 5) => ({ parametros: { prazos_meses: [6, 12, 24, 36, 48], valor_face: 1000 }, curvas: { nominal, real: null }, spread });

test("manchete: taxa que sobe faz o valor de hoje cair", () => {
  const e = estadoCom({ pontos: [{ ...ponto(1, 10, 1) }, { ...ponto(5, 12, 2) }], titulo: "x", base: "2026-10-29" });
  const m = manchetePrincipal(e);
  assert.equal(m.sentido, "caiu");
  assert.match(m.destaque, /^\d+,\d% menos$/);
  assert.match(m.antes, /3 anos/);
});

test("manchete: taxa que cai faz o valor subir; sem mexida, diz que ficou igual; sem 7 dias, só a taxa", () => {
  const cai = manchetePrincipal(estadoCom({ pontos: [ponto(1, 10, -1), ponto(5, 12, -2)] }));
  assert.equal(cai.sentido, "subiu");
  assert.match(cai.destaque, /mais$/);
  const igual = manchetePrincipal(estadoCom({ pontos: [ponto(1, 10, 0), ponto(5, 12, 0)] }));
  assert.equal(igual.sentido, "igual");
  assert.equal(igual.destaque, "praticamente o mesmo");
  const sem = manchetePrincipal(estadoCom({ pontos: [ponto(1, 10, null), ponto(5, 12, null)] }));
  assert.equal(sem.sentido, "neutro");
  assert.match(sem.destaque, /ao ano$/);
  assert.equal(manchetePrincipal({ ...estadoCom(null) }), null);
});

test("capítulo da curva: só diz 'mais nos prazos longos' quando é verdade", () => {
  const longa = fraseDoCapituloDaCurva([curva([ponto(1, 13, 0.1), ponto(3, 14, 1), ponto(5, 15, 2.2)])]);
  assert.match(longa, /subiram até 2,20 p\.p\. em 7 dias, bem mais nos prazos longos/);
  const parecida = fraseDoCapituloDaCurva([curva([ponto(1, 13, 1.0), ponto(5, 15, 1.2)])]);
  assert.doesNotMatch(parecida, /prazos longos/);
  const cai = fraseDoCapituloDaCurva([curva([ponto(1, 13, -0.5), ponto(5, 15, -0.7)])]);
  assert.match(cai, /caíram até 0,70 p\.p\./);
  const mista = fraseDoCapituloDaCurva([curva([ponto(1, 13, -0.5), ponto(5, 15, 0.7)])]);
  assert.match(mista, /mexeram entre −0,50 p\.p\. e \+0,70 p\.p\./);
  assert.match(fraseDoCapituloDaCurva([curva([ponto(1, 13, 0), ponto(5, 15, 0)])]), /ficaram onde estavam/);
  assert.equal(fraseDoCapituloDaCurva([curva([ponto(1, 13, null), ponto(5, 15, null)])]), null);
});

test("crédito: o sentido da diferença acompanha os números", () => {
  const m = (mediana) => ({ resumo: { mediana } });
  assert.match(fraseDoCapituloDoCredito({ imobiliario: m(14), veiculos: m(22) }), /veículo custa 8,0 p\.p\. a mais .* imóvel/);
  assert.match(fraseDoCapituloDoCredito({ imobiliario: m(20), veiculos: m(14) }), /imóvel custa 6,0 p\.p\. a mais .* veículo/);
  assert.match(fraseDoCapituloDoCredito({ imobiliario: m(14), veiculos: null }), /14,00%/);
  assert.equal(fraseDoCapituloDoCredito({ imobiliario: null, veiculos: null }), null);
});

test("setor: de cada 100 cotas, quantas saíram", () => {
  assert.equal(fraseDoCapituloDoSetor({ indice: { valor: 48.8 }, calculado: 48.8 }), "De cada 100 cotas do consórcio (ativas e excluídas), 49 já saíram do grupo.");
  assert.equal(fraseDoCapituloDoSetor(null), null);
});

test("com a foto de verdade, as cinco frases saem e não têm 'undefined' nem 'NaN'", () => {
  const lista = modelo.curvas(foto);
  const par = foto.derivados.parametros;
  const estado = { foto, parametros: par, curvas: { nominal: lista.find((c) => c.id === "nominal"), real: lista.find((c) => c.id === "real") }, spread: par.spread_demonstracao_pp };
  const m = manchetePrincipal(estado);
  const frases = [
    `${m.antes}${m.destaque}${m.depois}`,
    fraseDoCapituloDaCurva(lista),
    fraseDoCapituloDoCusto(foto),
    fraseDoCapituloDoCredito(modelo.creditos(foto)),
    fraseDoCapituloDoSetor(modelo.cotasDoSetor(foto)),
  ];
  for (const f of frases) {
    assert.ok(f && f.length > 20, `frase vazia: ${f}`);
    assert.doesNotMatch(f, /undefined|NaN|null/);
  }
  assert.match(frases[2], /Selic está em 13,75% ao ano; o mercado espera uma Selic menor, 11,75%, no fim de 2027/);
  assert.match(frases[1], /As taxas do Tesouro Prefixado subiram até 2,26 p\.p\. em 7 dias, bem mais nos prazos longos/);
});
