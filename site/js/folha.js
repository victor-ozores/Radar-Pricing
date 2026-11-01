// O padrão visual do Excel: o mesmo título, subtítulo, seções e tabelas em todas as abas. Duas cores (azul-marinho e
// cinza), amarelo só nas células de digitar e azul-claro só nos resultados das calculadoras.

import { celulaData, letraDaColuna, refDe } from "./xlsx.js";

export const COR = {
  marinho: "1F3A5F",
  texto: "262626",
  suave: "6B6B6B",
  linha: "D9D9D9",
  banda: "F5F6F8",
  entrada: "FFF2CC",
  entradaBorda: "BF9000",
  resultado: "E8EEF7",
  resultadoBorda: "8EA9C9",
  branco: "FFFFFF",
  abaPrincipal: "1F3A5F",
  abaDados: "8497B0",
  abaBruta: "A6A6A6",
};

/** Formatos de número (o Excel mostra com a vírgula e o ponto do computador de quem abre). */
export const FORMATO = {
  inteiro: "#,##0",
  num2: "#,##0.00",
  num4: "0.0000",
  taxa: "0.00",
  variacao: "+0.00;-0.00;0.00",
  reais: '"R$" #,##0.00',
  data: "dd/mm/yyyy",
};

const fino = (cor) => ["thin", cor];
const caixa = (cor) => ({ cima: fino(cor), baixo: fino(cor), esq: fino(cor), dir: fino(cor) });

export const E = {
  titulo: { fonte: { n: true, tam: 18, cor: COR.marinho }, v: "center" },
  subtitulo: { fonte: { tam: 10, cor: COR.suave }, v: "center" },
  paraQue: { fonte: { tam: 10, i: true }, h: "left", v: "top", quebra: true },
  secao: { fonte: { n: true, tam: 12, cor: COR.marinho }, v: "bottom", borda: { baixo: ["medium", COR.marinho] } },
  cab: { fonte: { n: true, cor: COR.branco }, fundo: COR.marinho, h: "center", v: "center", quebra: true, borda: { esq: fino(COR.branco), dir: fino(COR.branco) } },
  rotulo: { v: "center", quebra: true, borda: { baixo: ["thin", COR.linha] } },
  nota: { fonte: { tam: 9, i: true, cor: COR.suave }, v: "top", quebra: true },
  link: { fonte: { u: true, cor: "0563C1" }, v: "center", borda: { baixo: ["thin", COR.linha] } },
  entrada: { fundo: COR.entrada, borda: caixa(COR.entradaBorda), h: "right", v: "center", fonte: { n: true } },
  resultado: { fundo: COR.resultado, borda: caixa(COR.resultadoBorda), h: "right", v: "center", fonte: { n: true } },
  calculado: { borda: { baixo: ["thin", COR.linha] }, h: "right", v: "center" },
};

/** Estilo do corpo de uma tabela: linha fina embaixo, faixa cinza-clara nas linhas ímpares. */
export function corpo({ banda = false, h, formato, negrito = false, quebra = false } = {}) {
  return {
    ...(banda ? { fundo: COR.banda } : {}),
    borda: { baixo: ["thin", COR.linha] },
    v: "center",
    ...(h ? { h } : {}),
    ...(formato ? { formato } : {}),
    ...(negrito ? { fonte: { n: true } } : {}),
    ...(quebra ? { quebra: true } : {}),
  };
}

const ALINHAMENTO = { texto: "left", numero: "right", data: "center", centro: "center" };

/**
 * Uma aba sendo montada. A coluna A é uma margem estreita; o conteúdo começa na B. Cada método acrescenta linhas e
 * devolve onde elas ficaram, para as fórmulas poderem apontar para as células certas.
 */
export class Folha {
  constructor(nome, { larguras, corAba = COR.abaPrincipal, retrato = false, ultimaColuna }) {
    this.nome = nome;
    this.colunas = [2, ...larguras];
    this.corAba = corAba;
    this.retrato = retrato;
    this.ultima = ultimaColuna ?? this.colunas.length; // última coluna do conteúdo (1 = A)
    this.linhas = [];
    this.alturas = {};
    this.mesclar = [];
    this.validacoes = [];
    this.links = [];
    this.congelar = undefined;
    this.filtro = undefined;
  }

  get proxima() {
    return this.linhas.length + 1;
  }

  /** Acrescenta uma linha; `celulas` começa na coluna B. Devolve o número da linha. */
  linha(celulas = [], altura) {
    this.linhas.push([null, ...celulas]);
    const n = this.linhas.length;
    if (altura) this.alturas[n] = altura;
    return n;
  }

  espaco(altura = 10) {
    return this.linha([], altura);
  }

  /** Texto que ocupa as colunas B até a última do conteúdo, com quebra de linha. */
  paragrafo(texto, estilo, altura) {
    const n = this.linha([{ v: texto, e: estilo }], altura);
    this.mesclar.push(`B${n}:${letraDaColuna(this.ultima - 1)}${n}`);
    return n;
  }

  cabecalho({ titulo, subtitulo, paraQue, alturaParaQue = 32 }) {
    this.linha([{ v: titulo, e: E.titulo }], 34);
    this.linha([{ v: subtitulo, e: E.subtitulo }], 18);
    this.paragrafo(paraQue, E.paraQue, alturaParaQue);
    this.espaco();
  }

  /** Título de seção: texto em azul-marinho com uma linha embaixo, de B até a última coluna. */
  secao(texto) {
    const celulas = [{ v: texto, e: E.secao }];
    for (let c = 3; c < this.ultima + 1; c++) celulas.push({ v: null, e: E.secao });
    const n = this.linha(celulas, 24);
    return n;
  }

  nota(texto, altura = 28) {
    return this.paragrafo(texto, E.nota, altura);
  }

  /**
   * Tabela: `colunas`: [{ t: cabeçalho, tipo: texto|numero|data|centro, formato }], `linhas`: matriz de células.
   * Cada célula pode ser valor simples ou { v, f, e }; o estilo da tabela é aplicado por baixo do `e` dela.
   * Devolve { cab, primeira, ultima } (números das linhas) para as fórmulas e filtros.
   */
  tabela({ colunas, linhas, alturaCab, quebra = false }) {
    // o cabeçalho quebra em quantas linhas o texto precisar na largura da coluna (coluna 0 da folha é a margem)
    const linhasDoTexto = colunas.map((c, j) => Math.ceil(String(c.t).length / Math.max(5, Math.floor(this.colunas[j + 1] / 1.15) - 1)));
    const altura = alturaCab ?? Math.max(24, Math.max(...linhasDoTexto) * 15 + 8);
    const cab = this.linha(colunas.map((c) => ({ v: c.t, e: E.cab })), altura);
    const primeira = this.proxima;
    linhas.forEach((celulas, i) => {
      const banda = i % 2 === 1;
      this.linha(
        colunas.map((col, j) => {
          const bruto = celulas[j];
          const obj = bruto !== null && typeof bruto === "object" && !Array.isArray(bruto) ? bruto : { v: bruto };
          const base = corpo({ banda, h: ALINHAMENTO[col.tipo ?? "texto"], formato: col.formato, quebra: quebra && (col.tipo ?? "texto") === "texto" });
          return { ...obj, e: { ...base, ...(obj.e ?? {}) } };
        }),
      );
    });
    return { cab, primeira, ultima: this.proxima - 1 };
  }

  /** Uma linha "rótulo | valor | explicação" das calculadoras. `estiloValor`: E.entrada, E.resultado ou E.calculado. */
  campo(rotulo, valor, { estilo = E.calculado, formato, nota } = {}) {
    const e = { ...estilo, ...(formato ? { formato } : {}) };
    const celulaValor = valor !== null && typeof valor === "object" && !Array.isArray(valor) ? { ...valor, e: { ...e, ...(valor.e ?? {}) } } : { v: valor, e };
    const n = this.linha([{ v: rotulo, e: E.rotulo }, celulaValor, nota ? { v: nota, e: { ...E.nota, quebra: false, v: "center" } } : null], 22);
    return { linha: n, ref: refDe(n, 3), refAbsoluta: `$C$${n}` };
  }

  /** Marca uma célula para virar link para outra aba. */
  link(linha, coluna, destino, texto) {
    this.links.push({ ref: refDe(linha, coluna), destino, texto });
  }

  paraAba(extras = {}) {
    return {
      nome: this.nome,
      corAba: this.corAba,
      grade: false,
      retrato: this.retrato,
      colunas: this.colunas,
      linhas: this.linhas,
      alturas: this.alturas,
      mesclar: this.mesclar,
      validacoes: this.validacoes,
      links: this.links,
      congelar: this.congelar,
      filtro: this.filtro,
      ...extras,
    };
  }
}

export { celulaData };
