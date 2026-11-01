import assert from "node:assert/strict";
import test from "node:test";

import { celulaData, crc32, escapaXml, letraDaColuna, montaXlsx, refDe, serialDoExcel, zip } from "../js/xlsx.js";

const texto = (bytes) => new TextDecoder().decode(bytes);

test("crc32 bate com o valor de referência do padrão", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  assert.equal(crc32(new Uint8Array()), 0);
});

test("letras e referências das colunas do Excel", () => {
  assert.equal(letraDaColuna(0), "A");
  assert.equal(letraDaColuna(25), "Z");
  assert.equal(letraDaColuna(26), "AA");
  assert.equal(letraDaColuna(701), "ZZ");
  assert.equal(letraDaColuna(702), "AAA");
  assert.equal(refDe(5, 2), "B5");
  assert.equal(refDe(1, 27), "AA1");
});

test("datas viram o número de série do Excel", () => {
  assert.equal(serialDoExcel("1900-03-01"), 61); // o Excel conta 29/02/1900, que não existiu; a partir daí bate
  assert.equal(serialDoExcel("2026-10-31"), 46326);
  assert.deepEqual(celulaData("2026-10-31"), { v: 46326, e: { formato: "dd/mm/yyyy" } });
  assert.deepEqual(celulaData("2026-10-31", { h: "center" }), { v: 46326, e: { h: "center", formato: "dd/mm/yyyy" } });
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
  assert.throws(() => montaXlsx([aba("'Dados")]), /inválido/);
  assert.throws(() => montaXlsx([aba("Dados"), aba("dados")]), /repetido/);
});

test("planilha: o arquivo tem as partes que o Excel exige", () => {
  const bytes = montaXlsx([{ nome: "Resumo", colunas: [20], linhas: [[{ v: "Título", e: { fonte: { n: true } } }], ["a & b", 1.5, null, { v: Number.NaN }]], congelar: { linhas: 1 }, filtro: "A1:B2" }]);
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

test("estilos iguais viram um só; estilos diferentes ganham índices diferentes", () => {
  const verde = { fundo: "00FF00", formato: "0.00", h: "right" };
  const bytes = montaXlsx([{ nome: "A", linhas: [[{ v: 1, e: verde }, { v: 2, e: { ...verde } }, { v: 3, e: { fundo: "FF0000" } }]] }]);
  const xml = texto(bytes);
  const indices = [...xml.matchAll(/<c r="[A-C]1" s="(\d+)"/g)].map((m) => m[1]);
  assert.equal(indices[0], indices[1]);
  assert.notEqual(indices[0], indices[2]);
  assert.match(xml, /<numFmt numFmtId="164" formatCode="0.00"\/>/);
  assert.match(xml, /<fgColor rgb="FF00FF00"\/>/);
  assert.match(xml, /horizontal="right"/);
});

test("fórmula leva o valor calculado junto, de número ou de texto", () => {
  const bytes = montaXlsx([{ nome: "A", linhas: [[{ v: 3, f: "1+2" }, { v: "ok", f: 'IF(1=1,"ok","não")' }, { f: "SUM(A1:B1)" }]] }]);
  const xml = texto(bytes);
  assert.ok(xml.includes('<c r="A1"><f>1+2</f><v>3</v></c>'));
  assert.ok(xml.includes('<c r="B1" t="str"><f>IF(1=1,&quot;ok&quot;,&quot;não&quot;)</f><v>ok</v></c>'));
  assert.ok(xml.includes('<c r="C1"><f>SUM(A1:B1)</f></c>'));
  assert.ok(xml.includes('fullCalcOnLoad="1"'), "o Excel tem de recalcular ao abrir");
});

test("validação de dados, links, mesclagem, nomes definidos, cor da aba e página", () => {
  const bytes = montaXlsx(
    [
      {
        nome: "Calc", corAba: "1F3A5F", grade: false, colunas: [2, 30], linhas: [[null, "x"]], mesclar: ["B2:D2"],
        validacoes: [
          { ref: "C3", lista: ["Sim", "Não"], erro: "Escolha Sim ou Não." },
          { ref: "C4", min: 0, erro: "Digite zero ou mais." },
          { ref: "C5", inteiro: true, min: 1, max: 240, erro: "De 1 a 240." },
        ],
        links: [{ ref: "B7", destino: "'Leia-me'!A1", texto: "Leia-me" }],
      },
      { nome: "Leia-me", linhas: [["x"]] },
    ],
    { nomes: [{ nome: "Spread", ref: "'Calc'!$C$9" }] },
  );
  const xml = texto(bytes);
  assert.ok(xml.includes('<definedName name="Spread">\'Calc\'!$C$9</definedName>'));
  assert.ok(xml.includes('<tabColor rgb="FF1F3A5F"/>'));
  assert.ok(xml.includes('showGridLines="0"'));
  assert.ok(xml.includes('<mergeCell ref="B2:D2"/>'));
  assert.ok(xml.includes('<formula1>"Sim,Não"</formula1>'));
  assert.ok(xml.includes('type="decimal" operator="greaterThanOrEqual"'));
  assert.ok(xml.includes('type="whole" operator="between"') && xml.includes("<formula2>240</formula2>"));
  assert.ok(xml.includes('<hyperlink ref="B7" location="\'Leia-me\'!A1" display="Leia-me"/>'));
  assert.ok(xml.includes('orientation="landscape" fitToWidth="1" fitToHeight="0"'));
});

test("congelar linhas e colunas ao mesmo tempo", () => {
  const xml = texto(montaXlsx([{ nome: "A", linhas: [["x"]], congelar: { linhas: 4, colunas: 1 } }]));
  assert.ok(xml.includes('<pane xSplit="1" ySplit="4" topLeftCell="B5" activePane="bottomRight" state="frozen"/>'));
});
