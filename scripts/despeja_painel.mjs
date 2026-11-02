// Despeja em JSON tudo o que o painel calcula a partir de uma foto, chamando as mesmas funções que as telas chamam.
// Quem confere o resultado é scripts/audita_painel.py, que refaz as contas em Python só com os registros brutos.
// Uso: node scripts/despeja_painel.mjs <foto.json> <saida.json>

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const carrega = (arquivo) => import(pathToFileURL(resolve(raiz, "site", "js", arquivo)).href);
const [entrada, saida] = process.argv.slice(2);
if (!entrada || !saida) {
  console.error("uso: node despeja_painel.mjs <foto.json> <saida.json>");
  process.exit(2);
}

const calc = await carrega("calc.js");
const modelo = await carrega("modelo.js");
const hist = await carrega("historico.js");
const leitura = await carrega("leitura.js");
const narrativa = await carrega("narrativa.js");
const lote = await carrega("lote.js");

const foto = JSON.parse(readFileSync(entrada, "utf-8"));
const lista = modelo.curvas(foto);
const par = foto.derivados.parametros;
const curvas = { nominal: lista.find((c) => c.id === "nominal"), real: lista.find((c) => c.id === "real") };
const spread = par.spread_demonstracao_pp;
const estado = { foto, parametros: par, curvas, spread };

const impacto = {};
const sensibilidade = {};
for (const id of ["nominal", "real"]) {
  impacto[id] = par.prazos_meses.map((m) => calc.impactoNoPrazo(curvas[id], m, spread, par.valor_face));
  sensibilidade[id] = calc.sensibilidade(curvas[id], par.prazos_meses, spread, par.valor_face);
}

const cdi = foto.derivados.ancoras.cdi_anualizado?.taxa;
const ex = calc.EXEMPLOS;
const creditos = modelo.creditos(foto);
const cotas = modelo.cotasDoSetor(foto);

// Os negócios que as telas julgam (veredito): cada um com o que o painel calculou. Quem refaz tudo é a auditoria em Python.
const caminho = modelo.caminhoDeCorrecao(foto);
const negocios = [];
const nCancelada = (id, e, preco, custos) => {
  const r = calc.cotaCancelada({ ...e, spreadPP: spread }, curvas);
  const l = calc.leituraDoNegocio({ pagoHoje: preco + custos, recebe: r.valor_no_pagamento, valorJusto: r.valor_presente, anos: r.prazo_anos });
  negocios.push({ id, tipo: "cancelada", entrada: { ...e, preco, custos }, resultado: r, leitura: l });
};
const nOferta = (id, e) => {
  const r = calc.retornoDaOferta({ ...e, spreadPP: spread }, curvas, cdi);
  const l = calc.leituraDoNegocio({ pagoHoje: r.pago, recebe: e.valor, valorJusto: r.preco_maximo + (e.custos ?? 0), anos: r.prazo_anos });
  negocios.push({ id, tipo: "oferta", entrada: e, resultado: r, leitura: l });
};
const nAtiva = (id, e, preco, custos) => {
  const r = calc.cotaAtiva({ ...e, spreadPP: spread }, curvas.real);
  const l = calc.leituraDoNegocio({ pagoHoje: preco + custos, saidasFuturas: e.parcela * e.parcelas, recebe: e.credito, valorJusto: r.valor_da_cota });
  negocios.push({ id, tipo: "ativa", entrada: { ...e, preco, custos }, resultado: r, leitura: l });
};
const nPrecatorio = (id, e) => {
  const r = calc.precatorio({ ...e, spreadPP: spread }, curvas.nominal, caminho);
  const l = calc.leituraDoNegocio({ pagoHoje: r.oferta.pago, recebe: r.liquido_esperado, valorJusto: r.valor_presente, anos: r.prazo_anos });
  negocios.push({ id, tipo: "precatorio", entrada: e, resultado: r, leitura: l });
};
nCancelada("cancelada: exemplo da tela", { valor: ex.cancelada.valor, meses: ex.cancelada.meses, corrigido: true }, 38000, 0);
nCancelada("cancelada: com custos", { valor: 50000, meses: 24, corrigido: true }, 38000, 1500);
nCancelada("cancelada: taxa própria de 4,5%", { valor: 80000, meses: 36, corrigido: false, correcaoPct: 4.5 }, 50000, 800);
nCancelada("cancelada: taxa própria negativa", { valor: 50000, meses: 60, corrigido: true, correcaoPct: -2 }, 28000, 0);
nCancelada("cancelada: sem correção", { valor: 50000, meses: 24, corrigido: false }, 30000, 0);
nCancelada("cancelada: preço acima do valor", { valor: 50000, meses: 24, corrigido: true }, 45000, 0);
{
  // preços colados na fronteira de 5% de folga (calculados do valor do dia): um acima e outro abaixo da margem
  const vp = calc.cotaCancelada({ valor: 50000, meses: 24, corrigido: true, spreadPP: spread }, curvas).valor_presente;
  const cents = (x) => Math.round(x * 100) / 100;
  nCancelada("cancelada: folga de 5,5% (acima da margem)", { valor: 50000, meses: 24, corrigido: true }, cents(vp / 1.055), 0);
  nCancelada("cancelada: folga de 4,5% (abaixo da margem)", { valor: 50000, meses: 24, corrigido: true }, cents(vp / 1.045), 0);
}
nOferta("oferta: exemplo da tela", { preco: ex.retorno.preco, valor: ex.retorno.valor, meses: ex.retorno.meses, corrigido: true, custos: 0 });
nOferta("oferta: com custos, sem correção e alvo de 18%", { preco: 42000, valor: 60000, meses: 36, corrigido: false, alvoPct: 18, custos: 1200 });
nOferta("oferta: com custos e alvo padrão", { preco: 38000, valor: 50000, meses: 24, corrigido: true, custos: 1200 });
nAtiva("ativa: exemplo da tela", { credito: ex.ativa.credito, parcela: ex.ativa.parcela, parcelas: ex.ativa.parcelas, contemplacao: ex.ativa.contemplacao }, 20000, 0);
nAtiva("ativa: já contemplada, com custos", { credito: 80000, parcela: 1250, parcelas: 48, contemplacao: 0 }, 15000, 800);
nAtiva("ativa: preço baixo", { credito: 100000, parcela: 1900, parcelas: 60, contemplacao: 12 }, 2500, 0);
nPrecatorio("precatório: exemplo da tela", { valor: 100000, meses: 36, indice: "selic", jurosPP: 2, propriaPct: 8, retencaoPct: 0, desagioPct: 40, custos: 0 });
nPrecatorio("precatório: retenção, custos e outro prazo", { valor: 250000, meses: 60, indice: "selic", jurosPP: 2, propriaPct: 8, retencaoPct: 11, desagioPct: 35, custos: 1500 });
nPrecatorio("precatório: taxa própria e deságio pequeno", { valor: 70000, meses: 120, indice: "propria", jurosPP: 2, propriaPct: 6.25, retencaoPct: 5, desagioPct: 20, custos: 0 });
const lotes = {};
for (const tipo of ["cancelada", "ativa"]) lotes[tipo] = { texto: lote.EXEMPLO_DE_LOTE[tipo], resultado: lote.calculaLote(lote.EXEMPLO_DE_LOTE[tipo], tipo, { curvas, spreadPP: spread }) };

writeFileSync(
  saida,
  JSON.stringify({
    data: foto.data,
    spread,
    manchetes: modelo.manchetes(foto),
    manchete: narrativa.manchetePrincipal(estado),
    hero: leitura.heroDoDia(estado),
    leitura: leitura.leituraDoDia(estado),
    impacto,
    sensibilidade,
    curvas: lista,
    creditos,
    cotas,
    abac: modelo.abac(foto),
    focus: modelo.focus(foto),
    panorama: modelo.panorama(foto).grupos.flatMap((g) => g.linhas),
    ancora36: {
      nominal: hist.ancoraNoTempo(foto, "Tesouro Prefixado", 36).at(-1),
      real: hist.ancoraNoTempo(foto, "Tesouro IPCA+", 36).at(-1),
    },
    cdiNoTempo: hist.custoDoDinheiro(foto).filter((l) => l.cdi !== undefined).at(-1),
    cdi,
    exemplos: {
      cancelada: calc.cotaCancelada({ ...ex.cancelada, spreadPP: spread }, curvas),
      retorno: calc.retornoDaOferta({ ...ex.retorno, alvoPct: undefined, spreadPP: spread }, curvas, cdi),
      ativa: calc.cotaAtiva({ ...ex.ativa, spreadPP: spread }, curvas.real),
      precatorio: calc.precatorio({ ...ex.precatorio, spreadPP: spread }, curvas.nominal, modelo.caminhoDeCorrecao(foto)),
    },
    negocios,
    lotes,
    frases: {
      curva: narrativa.fraseDoCapituloDaCurva(lista),
      credito: narrativa.fraseDoCapituloDoCredito(creditos),
    },
  }),
);
