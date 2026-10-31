// O Excel das premissas do dia: uma aba por bloco do painel, com data e fonte de cada número.

import * as modelo from "./modelo.js";
import { montaXlsx, celulaData } from "./xlsx.js";
import { horaBRT, dataBR } from "./formato.js";

const c = (v, e) => ({ v, e });
const cab = (...titulos) => titulos.map((t) => c(t, "cab"));
const nota = (texto) => [c(texto, "nota")];
const subtitulo = (texto) => [c(texto, "negrito")];
const VAZIA = [];

export const AVISO =
  "Projeto independente, sem vínculo com empresa. Dados públicos. O spread e o perfil do exemplo são de DEMONSTRAÇÃO.";

export function nomeDoArquivo(foto) {
  return `radar-pricing-${foto.data}.xlsx`;
}

function abaResumo(foto) {
  const linhas = [
    [c("Radar Pricing: premissas públicas de mercado", "titulo")],
    nota(AVISO),
    VAZIA,
    [c("Foto de", "negrito"), celulaData(foto.data)],
    [c("Coletada às", "negrito"), `${horaBRT(foto.gerado_em)} (Brasília)`],
    [c("Status do dia", "negrito"), foto.status === "ok" ? "OK: todas as fontes essenciais vieram" : "PARCIAL: veja a aba Fontes"],
    VAZIA,
    cab("Indicador", "Valor", "Unidade", "Data do dado", "Variação em 7 dias (p.p.)", "Fonte"),
  ];
  for (const m of modelo.manchetes(foto)) {
    const porcentagem = m.unidade.startsWith("%");
    linhas.push([
      m.rotulo,
      c(m.valor, porcentagem ? (m.unidade === "% ao dia" ? "n4" : "pct2") : "n2"),
      m.unidade,
      celulaData(m.data),
      m.delta7 ? c(m.delta7.delta, "pp2") : null,
      m.fonte ?? "",
    ]);
  }
  return { nome: "Resumo", colunas: [38, 14, 12, 14, 24, 32], linhas };
}

function abaMudancas(foto) {
  const linhas = [cab("Severidade", "O que mudou", "Variação (p.p.)", "Série")];
  const lista = modelo.mudancas(foto);
  if (lista.length === 0) linhas.push(["", "Sem mudanças relevantes na foto deste dia."]);
  for (const m of lista) {
    linhas.push([modelo.SEVERIDADES[m.severidade] ?? m.severidade, c(m.texto, "texto"), m.delta == null ? null : c(m.delta, "pp2"), m.dimensao || m.serie || ""]);
  }
  return { nome: "Mudanças do dia", colunas: [14, 80, 16, 44], linhas, congelarLinhas: 1 };
}

function abaCusto(foto) {
  const linhas = [[c("Custo do dinheiro", "titulo")], VAZIA];
  for (const curva of modelo.curvas(foto)) {
    linhas.push(subtitulo(`${curva.titulo} (${curva.descricao}). Taxa de compra na data base`), cab("Vencimento", "Prazo (anos)", "Taxa (% a.a.)", "Δ 1 dia", "Δ 7 dias", "Δ 30 dias", "Data base"));
    for (const p of curva.pontos) {
      linhas.push([celulaData(p.vencimento), c(p.anos, "n2"), c(p.taxa, "pct2"), c(p.d1, "pp2"), c(p.d7, "pp2"), c(p.d30, "pp2"), celulaData(curva.base)]);
    }
    linhas.push(VAZIA);
  }
  const f = modelo.focus(foto);
  linhas.push(subtitulo(`Focus: mediana das expectativas do mercado (edição de ${dataBR(f.data)})`), cab("Ano", "Selic ao fim do ano (% a.a.)", "Δ 7 dias", "IPCA do ano (% a.a.)", "Δ 7 dias"));
  const anos = [...new Set([...f.selic, ...f.ipca].map((x) => x.ano))].sort();
  for (const ano of anos) {
    const s = f.selic.find((x) => x.ano === ano);
    const i = f.ipca.find((x) => x.ano === ano);
    linhas.push([ano, s ? c(s.valor, "pct2") : null, s?.d7 ? c(s.d7.delta, "pp2") : null, i ? c(i.valor, "pct2") : null, i?.d7 ? c(i.d7.delta, "pp2") : null]);
  }
  linhas.push(VAZIA, subtitulo("Focus: Selic esperada ao fim de cada reunião do Copom"), cab("Reunião", "Selic (% a.a.)"));
  for (const r of f.reunioes) linhas.push([r.reuniao, c(r.valor, "pct2")]);
  linhas.push(VAZIA, subtitulo("Banco Central (SGS): Selic, CDI e IPCA"), cab("Série", "Valor", "Unidade", "Data do dado", "Δ 7 dias"));
  for (const s of modelo.seriesDoBanco(foto)) {
    linhas.push([s.rotulo, c(s.valor, s.unidade === "% ao dia" ? "n4" : "n2"), s.unidade, celulaData(s.data), s.d7 ? c(s.d7.delta, s.unidade === "% ao dia" ? "n4" : "pp2") : null]);
  }
  return { nome: "Custo do dinheiro", colunas: [34, 28, 16, 20, 14, 14, 14], linhas };
}

function abaCredito(foto) {
  const { imobiliario, veiculos } = modelo.creditos(foto);
  const linhas = [[c("Crédito concorrente: taxas de financiamento por banco (Banco Central)", "titulo")], VAZIA];
  for (const [titulo, bloco] of [["Financiamento imobiliário", imobiliario], ["Financiamento de veículos", veiculos]]) {
    if (!bloco) continue;
    const r = bloco.resumo;
    linhas.push(
      subtitulo(`${titulo}: ${bloco.n} bancos, dado de ${dataBR(bloco.data)}`),
      cab("Menor", "1º quartil", "Mediana", "3º quartil", "Maior"),
      [c(r.menor, "pct2"), c(r.p25, "pct2"), c(r.mediana, "pct2"), c(r.p75, "pct2"), c(r.maior, "pct2")],
      VAZIA,
      cab("Banco", "Taxa (% a.a.)", "Data do dado"),
    );
    for (const b of bloco.bancos) linhas.push([b.banco, c(b.taxa, "pct2"), celulaData(bloco.data)]);
    linhas.push(VAZIA);
  }
  linhas.push(nota("Quartis por interpolação linear entre vizinhos (PERCENTIL.INC do Excel)."));
  return { nome: "Crédito concorrente", colunas: [46, 16, 16, 16, 16], linhas };
}

function abaSetor(foto) {
  const linhas = [[c("Setor de consórcio", "titulo")], VAZIA, subtitulo("ABAC: boletim mensal do sistema de consórcios"), cab("Indicador", "Unidade", "Último dado", "Data", "Dado anterior", "Data anterior", "Variação")];
  for (const a of modelo.abac(foto)) {
    linhas.push([a.rotulo, a.unidade, c(a.ultimo.valor, "n2"), celulaData(a.ultimo.data), a.anterior ? c(a.anterior.valor, "n2") : null, a.anterior ? celulaData(a.anterior.data) : null, a.delta == null ? null : c(a.delta, "n2")]);
  }
  const p = modelo.panorama(foto);
  linhas.push(VAZIA, subtitulo(`Banco Central, Panorama de Consórcios: ${dataBR(p.data)} contra ${dataBR(p.dataAnterior)}`), cab("Grupo", "Métrica", "Unidade", "Valor", "Data", "Anterior", "Data anterior", "Variação"));
  for (const g of p.grupos) {
    for (const l of g.linhas) {
      linhas.push([g.grupo, c(l.descricao, "texto"), l.unidade, c(l.valor, "n2"), celulaData(l.data), c(l.anterior, "n2"), celulaData(l.data_anterior), c(l.delta, "n2")]);
    }
  }
  return { nome: "Setor", colunas: [34, 60, 14, 16, 14, 16, 16, 14], linhas };
}

function abaValorPresente(foto) {
  const par = foto.derivados.parametros;
  const linhas = [
    [c("Valor presente de um valor recebido no futuro", "titulo")],
    nota(par.aviso),
    nota(`Convenção: ${par.convencao}.`),
    VAZIA,
    [c("Valor recebido no futuro (R$)", "negrito"), c(par.valor_face, "brl")],
    [c("Spread de demonstração (p.p.)", "negrito"), c(par.spread_demonstracao_pp, "n2")],
    VAZIA,
    cab("Prazo (meses)", "Tipo", "Taxa da âncora (% a.a.)", "Taxa de desconto (% a.a.)", "Valor presente na âncora (R$)", "Valor presente com spread (R$)", "Fora da curva?"),
  ];
  for (const l of foto.derivados.valor_presente) {
    for (const [chave, rotulo] of [["nominal", "R$ fixos (Tesouro Prefixado)"], ["real", "Corrigido pelo IPCA (Tesouro IPCA+)"]]) {
      const v = l[chave];
      if (!v) continue;
      linhas.push([l.meses, rotulo, c(v.taxa_ancora, "pct2"), c(v.taxa_demonstracao, "pct2"), c(v.vp_ancora, "brl"), c(v.vp_demonstracao, "brl"), v.extrapolado ? "sim: usa a ponta da curva" : "não"]);
    }
  }
  return { nome: "Valor presente", colunas: [30, 38, 22, 24, 28, 28, 26], linhas };
}

function abaFontes(foto) {
  const linhas = [cab("Fonte", "Papel", "Situação", "Registros", "Último dado", "Idade (dias)", "Tempo (s)", "Observações")];
  for (const f of modelo.fontes(foto)) {
    const obs = [f.erro, ...f.falhas, ...f.atrasos, ...f.avisos].filter(Boolean).join(" | ");
    linhas.push([f.nome, f.papel, f.situacao, c(f.n_registros, "n0"), celulaData(f.ultimo_dado), f.idade_dias == null ? null : c(f.idade_dias, "n0"), c(f.tempo_s, "n2"), c(obs, "texto")]);
  }
  return { nome: "Fontes", colunas: [48, 14, 12, 12, 14, 14, 12, 80], linhas, congelarLinhas: 1 };
}

function abaObservacoes(foto) {
  const linhas = [cab("Fonte", "Série", "Dimensão", "Data", "Valor", "Unidade", "Descrição")];
  for (const r of foto.registros) {
    linhas.push([r.fonte, r.serie, r.dimensao || "", celulaData(r.data_ref), c(r.valor, "n4"), r.unidade, r.descricao]);
  }
  return { nome: "Observações", colunas: [14, 38, 50, 14, 14, 12, 90], linhas, congelarLinhas: 1, filtro: `A1:G${linhas.length}` };
}

/** Os bytes do .xlsx de uma foto. */
export function excelDaFoto(foto) {
  return montaXlsx([
    abaResumo(foto),
    abaMudancas(foto),
    abaCusto(foto),
    abaCredito(foto),
    abaSetor(foto),
    abaValorPresente(foto),
    abaFontes(foto),
    abaObservacoes(foto),
  ]);
}
