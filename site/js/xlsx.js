// Escritor de arquivos .xlsx (Excel), sem biblioteca: um zip sem compressão com as partes XML que o Excel exige.
// Texto vai como `inlineStr`; números e datas, como números com formato; fórmulas levam o valor já calculado.
// Os estilos são montados sob demanda: cada célula descreve o seu e o escritor reaproveita os iguais.
// Conferido abrindo no Excel de verdade (tests/excel_com.ps1, à mão) e no openpyxl (tests/test_site.py).

const TEXTO = new TextEncoder();

// --------------------------------------------------------------------------------------------- zip
const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = TABELA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Zip sem compressão. `arquivos`: [{ nome, dados: Uint8Array }]. Data fixa (1980-01-01) para o arquivo sair igual. */
export function zip(arquivos) {
  const partes = [];
  const central = [];
  let deslocamento = 0;
  const DATA_DOS = 0x0021;
  for (const { nome, dados } of arquivos) {
    const nomeBytes = TEXTO.encode(nome);
    const crc = crc32(dados);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // nomes em UTF-8
    local.setUint16(8, 0, true); // sem compressão
    local.setUint16(10, 0, true);
    local.setUint16(12, DATA_DOS, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, dados.length, true);
    local.setUint32(22, dados.length, true);
    local.setUint16(26, nomeBytes.length, true);
    local.setUint16(28, 0, true);
    partes.push(new Uint8Array(local.buffer), nomeBytes, dados);

    const reg = new DataView(new ArrayBuffer(46));
    reg.setUint32(0, 0x02014b50, true);
    reg.setUint16(4, 20, true);
    reg.setUint16(6, 20, true);
    reg.setUint16(8, 0x0800, true);
    reg.setUint16(10, 0, true);
    reg.setUint16(12, 0, true);
    reg.setUint16(14, DATA_DOS, true);
    reg.setUint32(16, crc, true);
    reg.setUint32(20, dados.length, true);
    reg.setUint32(24, dados.length, true);
    reg.setUint16(28, nomeBytes.length, true);
    reg.setUint32(42, deslocamento, true);
    central.push(new Uint8Array(reg.buffer), nomeBytes);
    deslocamento += 30 + nomeBytes.length + dados.length;
  }
  const tamanhoCentral = central.reduce((s, p) => s + p.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, arquivos.length, true);
  fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamanhoCentral, true);
  fim.setUint32(16, deslocamento, true);
  const todas = [...partes, ...central, new Uint8Array(fim.buffer)];
  const saida = new Uint8Array(todas.reduce((s, p) => s + p.length, 0));
  let pos = 0;
  for (const p of todas) {
    saida.set(p, pos);
    pos += p.length;
  }
  return saida;
}

// --------------------------------------------------------------------------------------------- xml
const CONTROLES_INVALIDOS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export function escapaXml(texto) {
  return String(texto)
    .replace(CONTROLES_INVALIDOS, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function letraDaColuna(indice) {
  let n = indice + 1;
  let letras = "";
  while (n > 0) {
    const resto = (n - 1) % 26;
    letras = String.fromCharCode(65 + resto) + letras;
    n = Math.floor((n - 1) / 26);
  }
  return letras;
}

/** Linha e coluna (a partir de 1) para "B5". */
export const refDe = (linha, coluna) => `${letraDaColuna(coluna - 1)}${linha}`;

/** "2026-10-31" -> número de série do Excel (dias desde 30/12/1899). */
export function serialDoExcel(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  return (Date.UTC(a, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000;
}

/** Célula de data com o formato de data (o estilo `e` pode ser trocado, por exemplo para a faixa da tabela). */
export function celulaData(iso, e = { formato: "dd/mm/yyyy" }) {
  return iso ? { v: serialDoExcel(iso), e: { ...e, formato: e.formato ?? "dd/mm/yyyy" } } : null;
}

// --------------------------------------------------------------------------------------------- estilos
/**
 * Um estilo é um objeto simples:
 *   fonte: { n: negrito, i: itálico, u: sublinhado, tam: 11, cor: "RRGGBB" }, fundo: "RRGGBB",
 *   borda: { cima|baixo|esq|dir: [estilo, "RRGGBB"] } (estilo: hair | thin | medium),
 *   h: left|center|right, v: top|center|bottom, quebra: true, recuo: 1, formato: "0.00".
 */
function criaRegistroDeEstilos() {
  const fontes = ['{"tam":11,"cor":"262626"}'];
  const fundos = [];
  const bordas = ["{}"];
  const formatos = [];
  const xfs = ["{}"];
  const cache = new Map([["{}", 0]]);
  const indice = (lista, chave) => {
    const i = lista.indexOf(chave);
    if (i >= 0) return i;
    lista.push(chave);
    return lista.length - 1;
  };
  const estilo = (spec) => {
    if (!spec) return 0;
    const chave = JSON.stringify(spec);
    if (cache.has(chave)) return cache.get(chave);
    const f = indice(fontes, JSON.stringify({ tam: 11, cor: "262626", ...(spec.fonte ?? {}) }));
    const fu = spec.fundo ? indice(fundos, spec.fundo) + 2 : 0;
    const b = spec.borda ? indice(bordas, JSON.stringify(spec.borda)) : 0;
    const nf = spec.formato ? indice(formatos, spec.formato) + 164 : 0;
    xfs.push(JSON.stringify({ f, fu, b, nf, h: spec.h, v: spec.v, quebra: spec.quebra, recuo: spec.recuo }));
    cache.set(chave, xfs.length - 1);
    return xfs.length - 1;
  };
  const cor = (rgb) => `<color rgb="FF${rgb}"/>`;
  const xml = () => {
    const xmlFonte = (json) => {
      const f = JSON.parse(json);
      return `<font>${f.n ? "<b/>" : ""}${f.i ? "<i/>" : ""}${f.u ? "<u/>" : ""}<sz val="${f.tam}"/>${cor(f.cor)}<name val="Calibri"/><family val="2"/></font>`;
    };
    const xmlBorda = (json) => {
      const b = JSON.parse(json);
      const lado = (nome, v) => (v ? `<${nome} style="${v[0]}">${cor(v[1])}</${nome}>` : `<${nome}/>`);
      return `<border>${lado("left", b.esq)}${lado("right", b.dir)}${lado("top", b.cima)}${lado("bottom", b.baixo)}<diagonal/></border>`;
    };
    const celulas = xfs.map((json) => {
      const x = JSON.parse(json);
      const alinha = x.h || x.v || x.quebra || x.recuo;
      const atributos =
        `numFmtId="${x.nf ?? 0}" fontId="${x.f ?? 0}" fillId="${x.fu ?? 0}" borderId="${x.b ?? 0}" xfId="0"` +
        ` applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"`;
      if (!alinha) return `<xf ${atributos}/>`;
      const al = `<alignment${x.h ? ` horizontal="${x.h}"` : ""}${x.v ? ` vertical="${x.v}"` : ""}${x.quebra ? ' wrapText="1"' : ""}${x.recuo ? ` indent="${x.recuo}"` : ""}/>`;
      return `<xf ${atributos} applyAlignment="1">${al}</xf>`;
    });
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      (formatos.length ? `<numFmts count="${formatos.length}">${formatos.map((c, i) => `<numFmt numFmtId="${164 + i}" formatCode="${escapaXml(c)}"/>`).join("")}</numFmts>` : "") +
      `<fonts count="${fontes.length}">${fontes.map(xmlFonte).join("")}</fonts>` +
      `<fills count="${fundos.length + 2}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
      fundos.map((rgb) => `<fill><patternFill patternType="solid"><fgColor rgb="FF${rgb}"/><bgColor indexed="64"/></patternFill></fill>`).join("") +
      "</fills>" +
      `<borders count="${bordas.length}">${bordas.map(xmlBorda).join("")}</borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${celulas.length}">${celulas.join("")}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      "</styleSheet>"
    );
  };
  return { estilo, xml };
}

// --------------------------------------------------------------------------------------------- planilhas
/**
 * Uma célula: null, texto, número, ou { v, e, f }: valor `v`, estilo `e` (objeto) e fórmula `f` (sem o "=").
 * Com fórmula, `v` é o resultado já calculado (o Excel recalcula ao abrir, mas outros leitores usam este).
 */
function xmlDaCelula(celula, ref, estilo) {
  const obj = celula !== null && typeof celula === "object" ? celula : { v: celula };
  const { v, e, f } = obj;
  const s = e ? ` s="${estilo(e)}"` : "";
  const vazio = v === null || v === undefined || v === "" || (typeof v === "number" && !Number.isFinite(v));
  if (f) {
    const formula = `<f>${escapaXml(f)}</f>`;
    if (vazio) return `<c r="${ref}"${s}>${formula}</c>`;
    if (typeof v === "number") return `<c r="${ref}"${s}>${formula}<v>${v}</v></c>`;
    return `<c r="${ref}"${s} t="str">${formula}<v>${escapaXml(v)}</v></c>`;
  }
  if (vazio) return s ? `<c r="${ref}"${s}/>` : "";
  if (typeof v === "number") return `<c r="${ref}"${s}><v>${v}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapaXml(v)}</t></is></c>`;
}

function xmlDaValidacao(v) {
  const base = `allowBlank="${v.vazioOk ? 1 : 0}" showErrorMessage="1" errorTitle="Valor inválido" error="${escapaXml(v.erro)}" sqref="${v.ref}"`;
  if (v.lista) return `<dataValidation type="list" ${base}><formula1>"${escapaXml(v.lista.join(","))}"</formula1></dataValidation>`;
  const tipo = v.inteiro ? "whole" : "decimal";
  const entre = v.max !== undefined;
  const operador = entre ? "between" : "greaterThanOrEqual";
  return `<dataValidation type="${tipo}" operator="${operador}" ${base}><formula1>${v.min ?? 0}</formula1>${entre ? `<formula2>${v.max}</formula2>` : ""}</dataValidation>`;
}

function xmlDaPlanilha(aba, selecionada, estilo) {
  const larguras = (aba.colunas ?? []).map((l, i) => `<col min="${i + 1}" max="${i + 1}" width="${l}" customWidth="1"/>`).join("");
  const { linhas: fl = 0, colunas: fc = 0 } = aba.congelar ?? {};
  let painel = "";
  if (fl || fc) {
    const ativo = fl && fc ? "bottomRight" : fl ? "bottomLeft" : "topRight";
    painel =
      `<pane${fc ? ` xSplit="${fc}"` : ""}${fl ? ` ySplit="${fl}"` : ""} topLeftCell="${refDe(fl + 1, fc + 1)}" activePane="${ativo}" state="frozen"/>` +
      `<selection pane="${ativo}"/>`;
  }
  const linhas = aba.linhas
    .map((celulas, i) => {
      const n = i + 1;
      const conteudo = celulas.map((c, j) => xmlDaCelula(c, refDe(n, j + 1), estilo)).join("");
      const altura = aba.alturas?.[n];
      if (!conteudo && !altura) return "";
      return `<row r="${n}"${altura ? ` ht="${altura}" customHeight="1"` : ""}>${conteudo}</row>`;
    })
    .join("");
  const filtro = aba.filtro ? `<autoFilter ref="${aba.filtro}"/>` : "";
  const mesclas = aba.mesclar?.length ? `<mergeCells count="${aba.mesclar.length}">${aba.mesclar.map((r) => `<mergeCell ref="${r}"/>`).join("")}</mergeCells>` : "";
  const validacoes = aba.validacoes?.length ? `<dataValidations count="${aba.validacoes.length}">${aba.validacoes.map(xmlDaValidacao).join("")}</dataValidations>` : "";
  const links = aba.links?.length ? `<hyperlinks>${aba.links.map((l) => `<hyperlink ref="${l.ref}" location="${escapaXml(l.destino)}" display="${escapaXml(l.texto)}"/>`).join("")}</hyperlinks>` : "";
  const cor = aba.corAba ? `<tabColor rgb="FF${aba.corAba}"/>` : "";
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetPr>${cor}<pageSetUpPr fitToPage="1"/></sheetPr>` +
    `<sheetViews><sheetView${aba.grade === false ? ' showGridLines="0"' : ""}${selecionada ? ' tabSelected="1"' : ""} workbookViewId="0">${painel}</sheetView></sheetViews>` +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    (larguras ? `<cols>${larguras}</cols>` : "") +
    `<sheetData>${linhas}</sheetData>${filtro}${mesclas}${validacoes}${links}` +
    '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>' +
    `<pageSetup paperSize="9" orientation="${aba.retrato ? "portrait" : "landscape"}" fitToWidth="1" fitToHeight="0"/>` +
    "</worksheet>"
  );
}

const PROIBIDOS_NO_NOME = /[\\/?*[\]:]/;

function confereNomes(abas) {
  const vistos = new Set();
  for (const { nome } of abas) {
    if (!nome || nome.length > 31 || PROIBIDOS_NO_NOME.test(nome) || nome.startsWith("'") || nome.endsWith("'")) {
      throw new Error(`Nome de aba inválido no Excel: "${nome}"`);
    }
    if (vistos.has(nome.toLowerCase())) throw new Error(`Nome de aba repetido: "${nome}"`);
    vistos.add(nome.toLowerCase());
  }
}

const aspas = (nome) => `'${nome.replace(/'/g, "''")}'`;
const absoluto = (ref) => ref.replace(/([A-Z]+)(\d+)/g, "$$$1$$$2");

/**
 * Monta o arquivo. `abas`: [{ nome, corAba, grade, colunas: [larguras], linhas: [[célula...]], alturas: {linha: pt},
 * congelar: { linhas, colunas }, filtro: "A1:G9", mesclar: ["B2:H2"], validacoes: [...], links: [{ ref, destino, texto }],
 * retrato }]. `nomes`: nomes definidos [{ nome, ref: "'Hoje'!$D$7" }]. Devolve os bytes do .xlsx.
 */
export function montaXlsx(abas, { nomes = [] } = {}) {
  if (abas.length === 0) throw new Error("Um arquivo do Excel precisa de pelo menos uma aba.");
  confereNomes(abas);
  const registro = criaRegistroDeEstilos();
  const planilhas = abas.map((a, i) => xmlDaPlanilha(a, i === 0, registro.estilo));
  const nomesDasAbas = abas.map((a, i) => `<sheet name="${escapaXml(a.nome)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("");
  const definidos = [
    ...nomes.map((n) => `<definedName name="${escapaXml(n.nome)}">${escapaXml(n.ref)}</definedName>`),
    ...abas.flatMap((a, i) => {
      if (!a.filtro) return [];
      const [de, ate] = a.filtro.split(":");
      return [`<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${escapaXml(aspas(a.nome))}!${absoluto(de)}:${absoluto(ate)}</definedName>`];
    }),
  ].join("");
  const arquivos = [
    {
      nome: "[Content_Types].xml",
      texto:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        abas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        "</Types>",
    },
    {
      nome: "_rels/.rels",
      texto:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        "</Relationships>",
    },
    {
      nome: "xl/workbook.xml",
      texto:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<bookViews><workbookView activeTab="0"/></bookViews>' +
        `<sheets>${nomesDasAbas}</sheets>` +
        (definidos ? `<definedNames>${definidos}</definedNames>` : "") +
        '<calcPr calcId="191029" fullCalcOnLoad="1"/>' +
        "</workbook>",
    },
    {
      nome: "xl/_rels/workbook.xml.rels",
      texto:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        abas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
        `<Relationship Id="rId${abas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        "</Relationships>",
    },
    { nome: "xl/styles.xml", texto: registro.xml() }, // depois das planilhas: os estilos só existem depois de montá-las
    ...planilhas.map((texto, i) => ({ nome: `xl/worksheets/sheet${i + 1}.xml`, texto })),
  ];
  return zip(arquivos.map(({ nome, texto }) => ({ nome, dados: TEXTO.encode(texto) })));
}
