// Ponte entre os testes em Python e o código do painel (site/js): roda a mesma conta ou monta o mesmo arquivo
// com uma foto de verdade e devolve o resultado em JSON, para o Python conferir.
// Uso: node ajuda.mjs calc <foto.json> <casos.json> | excel <foto.json> <saida.xlsx> | modelo <foto.json>

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const carrega = (arquivo) => import(pathToFileURL(resolve(raiz, "site", "js", arquivo)).href);
const le = (caminho) => JSON.parse(readFileSync(caminho, "utf-8"));

const [comando, ...args] = process.argv.slice(2);

if (comando === "calc") {
  const { desconta } = await carrega("calc.js");
  const foto = le(args[0]);
  const curvas = { nominal: foto.derivados.ancoras.curva_nominal, real: foto.derivados.ancoras.curva_real };
  const saida = le(args[1]).map((c) => desconta(curvas[c.curva], c.valor, c.meses, c.spread));
  process.stdout.write(JSON.stringify(saida));
} else if (comando === "excel") {
  const { excelDaFoto } = await carrega("excel.js");
  writeFileSync(args[1], excelDaFoto(le(args[0])));
} else if (comando === "modelo") {
  const m = await carrega("modelo.js");
  const foto = le(args[0]);
  const { imobiliario, veiculos } = m.creditos(foto);
  process.stdout.write(
    JSON.stringify({
      mediana_imobiliario: imobiliario?.resumo.mediana,
      mediana_veiculos: veiculos?.resumo.mediana,
      n_veiculos: veiculos?.n,
      manchetes: m.manchetes(foto).map((x) => ({ id: x.id, valor: x.valor, data: x.data })),
      curvas: m.curvas(foto).map((c) => ({ id: c.id, pontos: c.pontos.length, d7: c.pontos.map((p) => p.d7) })),
      panorama_grupos: m.panorama(foto).grupos.length,
      panorama_linhas: m.panorama(foto).grupos.reduce((s, g) => s + g.linhas.length, 0),
    }),
  );
} else {
  console.error("comando desconhecido:", comando);
  process.exit(2);
}
