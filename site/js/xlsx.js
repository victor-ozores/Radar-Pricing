// Escritor mínimo de arquivos .xlsx (Excel), sem biblioteca: um zip sem compressão com as partes XML que o
// Excel exige. Texto vai como `inlineStr`; números e datas, como números com formato.
// Testado com openpyxl (tests/test_site.py). Não foi aberto no Excel da Microsoft.

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

/** "2026-10-31" -> número de série do Excel (dias desde 30/12/1899). */
export function serialDoExcel(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  return (Date.UTC(a, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000;
}

// --------------------------------------------------------------------------------------------- estilos
const FORMATOS = [
  ["n0", '#,##0'],
  ["n2", '#,##0.00'],
  ["n4", '0.0000'],
  ["pct2", '0.00"%"'],
  ["pp2", '+0.00" p.p.";-0.00" p.p.";0.00" p.p."'],
  ["brl", '"R$" #,##0.00'],
  ["data", 'dd/mm/yyyy'],
];
const ID_FORMATO = Object.fromEntries(FORMATOS.map(([nome], i) => [nome, 164 + i]));

// índice da fonte: 0 normal, 1 negrito, 2 negrito branco, 3 título, 4 nota (itálico cinza)
const ESTILOS = [
  ["padrao", {}],
  ["titulo", { fonte: 3 }],
  ["cab", { fonte: 2, fundo: 2, borda: 1, quebra: true }],
  ["negrito", { fonte: 1 }],
  ["nota", { fonte: 4, quebra: false }],
  ["texto", { quebra: true }],
  ...FORMATOS.map(([nome]) => [nome, { formato: nome }]),
];
const INDICE_ESTILO = Object.fromEntries(ESTILOS.map(([nome], i) => [nome, i]));

function xmlDosEstilos() {
  const formatos = FORMATOS.map(([nome, codigo]) => `<numFmt numFmtId="${ID_FORMATO[nome]}" formatCode="${escapaXml(codigo)}"/>`).join("");
  const celulas = ESTILOS.map(([, e]) => {
    const formato = e.formato ? ID_FORMATO[e.formato] : 0;
    const alinhamento = e.quebra === undefined ? "" : `<alignment vertical="top"${e.quebra ? ' wrapText="1"' : ""}/>`;
    return (
      `<xf numFmtId="${formato}" fontId="${e.fonte ?? 0}" fillId="${e.fundo ?? 0}" borderId="${e.borda ?? 0}" xfId="0"` +
      ` applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"${alinhamento ? ' applyAlignment="1">' + alinhamento + "</xf>" : "/>"}`
    );
  }).join("");
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<numFmts count="${FORMATOS.length}">${formatos}</numFmts>` +
    '<fonts count="5">' +
    '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><b/><sz val="14"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><i/><sz val="10"/><color rgb="FF666666"/><name val="Calibri"/><family val="2"/></font>' +
    "</fonts>" +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF1F3A5F"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border><left/><right/><top/><bottom style="thin"><color rgb="FF999999"/></bottom><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    `<cellXfs count="${ESTILOS.length}">${celulas}</cellXfs>` +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    "</styleSheet>"
  );
}

// --------------------------------------------------------------------------------------------- planilhas
/** Uma célula: texto, número, null (vazia) ou { v, e } com o estilo `e` (nome em ESTILOS). */
export function celulaData(iso) {
  return iso ? { v: serialDoExcel(iso), e: "data" } : null;
}

function xmlDaCelula(celula, linha, coluna) {
  const ref = `${letraDaColuna(coluna)}${linha}`;
  const { v, e } = celula !== null && typeof celula === "object" ? celula : { v: celula, e: undefined };
  const s = e ? ` s="${INDICE_ESTILO[e] ?? 0}"` : "";
  if (v === null || v === undefined || v === "" || (typeof v === "number" && !Number.isFinite(v))) {
    return s ? `<c r="${ref}"${s}/>` : "";
  }
  if (typeof v === "number") return `<c r="${ref}"${s}><v>${v}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapaXml(v)}</t></is></c>`;
}

function xmlDaPlanilha(aba, selecionada) {
  const colunas = aba.colunas ?? [];
  const larguras = colunas.map((l, i) => `<col min="${i + 1}" max="${i + 1}" width="${l}" customWidth="1"/>`).join("");
  const congelar = aba.congelarLinhas ?? 0;
  const painel = congelar
    ? `<pane ySplit="${congelar}" topLeftCell="A${congelar + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/>`
    : "";
  const linhas = aba.linhas
    .map((celulas, i) => {
      const conteudo = celulas.map((c, j) => xmlDaCelula(c, i + 1, j)).join("");
      return conteudo ? `<row r="${i + 1}">${conteudo}</row>` : "";
    })
    .join("");
  const filtro = aba.filtro ? `<autoFilter ref="${aba.filtro}"/>` : "";
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetViews><sheetView${selecionada ? ' tabSelected="1"' : ""} workbookViewId="0">${painel}</sheetView></sheetViews>` +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    (larguras ? `<cols>${larguras}</cols>` : "") +
    `<sheetData>${linhas}</sheetData>${filtro}</worksheet>`
  );
}

const PROIBIDOS_NO_NOME = /[\\/?*[\]:]/;

function confereNomes(abas) {
  const vistos = new Set();
  for (const { nome } of abas) {
    if (!nome || nome.length > 31 || PROIBIDOS_NO_NOME.test(nome)) throw new Error(`Nome de aba inválido no Excel: "${nome}"`);
    if (vistos.has(nome.toLowerCase())) throw new Error(`Nome de aba repetido: "${nome}"`);
    vistos.add(nome.toLowerCase());
  }
}

/**
 * Monta o arquivo. `abas`: [{ nome, colunas: [larguras], linhas: [[célula...]], congelarLinhas, filtro }].
 * Devolve os bytes do .xlsx.
 */
export function montaXlsx(abas) {
  if (abas.length === 0) throw new Error("Um arquivo do Excel precisa de pelo menos uma aba.");
  confereNomes(abas);
  const nomes = abas
    .map((a, i) => `<sheet name="${escapaXml(a.nome)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join("");
  const filtros = abas
    .map((a, i) => {
      if (!a.filtro) return "";
      const [de, ate] = a.filtro.split(":");
      const abs = (r) => r.replace(/([A-Z]+)(\d+)/, "$$$1$$$2");
      return `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${a.nome.replace(/'/g, "''")}'!${abs(de)}:${abs(ate)}</definedName>`;
    })
    .join("");
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
        `<sheets>${nomes}</sheets>` +
        (filtros ? `<definedNames>${filtros}</definedNames>` : "") +
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
    { nome: "xl/styles.xml", texto: xmlDosEstilos() },
    ...abas.map((a, i) => ({ nome: `xl/worksheets/sheet${i + 1}.xml`, texto: xmlDaPlanilha(a, i === 0) })),
  ];
  return zip(arquivos.map(({ nome, texto }) => ({ nome, dados: TEXTO.encode(texto) })));
}
