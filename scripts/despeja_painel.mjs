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
    frases: {
      curva: narrativa.fraseDoCapituloDaCurva(lista),
      credito: narrativa.fraseDoCapituloDoCredito(creditos),
    },
  }),
);
