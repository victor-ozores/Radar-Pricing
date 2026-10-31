import assert from "node:assert/strict";
import test from "node:test";

import { celulaData, crc32, escapaXml, letraDaColuna, montaXlsx, serialDoExcel, zip } from "../js/xlsx.js";

const texto = (bytes) => new TextDecoder().decode(bytes);

test("crc32 bate com o valor de referência do padrão", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  assert.equal(crc32(new Uint8Array()), 0);
});

test("letras das colunas do Excel", () => {
  assert.equal(letraDaColuna(0), "A");
  assert.equal(letraDaColuna(25), "Z");
  assert.equal(letraDaColuna(26), "AA");
  assert.equal(letraDaColuna(701), "ZZ");
  assert.equal(letraDaColuna(702), "AAA");
});

test("datas viram o número de série do Excel", () => {
  assert.equal(serialDoExcel("1900-03-01"), 61); // o Excel conta 29/02/1900 que não existiu; a partir daí bate
  assert.equal(serialDoExcel("2026-10-31"), 46326);
  assert.deepEqual(celulaData("2026-10-31"), { v: 46326, e: "data" });
  assert.equal(celulaData(null), null);
});

test("texto sai escapado e sem caractere que o XML proíbe", () => {
  assert.equal(escapaXml('a & b < c > "d"'), "a &amp; b &lt; c &gt; &quot;d&quot;");
  assert.equal(escapaXml("a\u0000b\u001Fc"), "abc");
  assert.equal(escapaXml("ação"), "ação");
});

test("zip: assinaturas, contagem de arquivos e conteúdo guardado como veio", () => {
  const bytes = zip([{ nome: "a.txt", dados: new TextEncoder().encode("olá") }, { nome: "pasta/b.txt", dados: new TextEncoder().encode("x") }]);
  const v = new DataView(bytes.buffer);
  assert.equal(v.getUint32(0, true), 0x04034b50);
  const fim = bytes.length - 22;
  assert.equal(v.getUint32(fim, true), 0x06054b50);
  assert.equal(v.getUint16(fim + 10, true), 2);
  assert.ok(texto(bytes).includes("olá"));
});

test("planilha: nomes inválidos ou repetidos são recusados", () => {
  const aba = (nome) => ({ nome, linhas: [["x"]] });
  assert.throws(() => montaXlsx([]), /pelo menos uma aba/);
  assert.throws(() => montaXlsx([aba("a/b")]), /inválido/);
  assert.throws(() => montaXlsx([aba("x".repeat(32))]), /inválido/);
  assert.throws(() => montaXlsx([aba("")]), /inválido/);
  assert.throws(() => montaXlsx([aba("Dados"), aba("dados")]), /repetido/);
});

test("planilha: o arquivo tem as partes que o Excel exige", () => {
  const bytes = montaXlsx([{ nome: "Resumo", colunas: [20], linhas: [[{ v: "Título", e: "cab" }], ["a & b", 1.5, null, { v: Number.NaN }]], congelarLinhas: 1, filtro: "A1:B2" }]);
  const conteudo = texto(bytes);
  for (const parte of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml"]) {
    assert.ok(conteudo.includes(parte), `falta a parte ${parte}`);
  }
  assert.ok(conteudo.includes("a &amp; b"));
  assert.ok(conteudo.includes('<pane ySplit="1"'));
  assert.ok(conteudo.includes("_xlnm._FilterDatabase"));
  assert.ok(conteudo.includes("'Resumo'!$A$1:$B$2"));
  assert.ok(!conteudo.includes("NaN"), "NaN não pode ir para o arquivo");
});
