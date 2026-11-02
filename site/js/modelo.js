// Tira da foto o que cada bloco do painel e cada aba do Excel mostra. Só lê a foto: não calcula nada novo
// além de medianas e percentis dos bancos, que o robô não grava por banco.

import { pp } from "./formato.js";

export const NOMES_DAS_FONTES = {
  bcb_sgs: "Banco Central: séries do SGS (Selic, CDI, IPCA)",
  bcb_focus: "Banco Central: expectativas do Focus",
  bcb_taxas: "Banco Central: taxas de juros por banco",
  bcb_panorama: "Banco Central: Panorama de Consórcios",
  tesouro: "Tesouro Transparente: taxas do Tesouro Direto",
  ibge: "IBGE: IPCA (conferência do BCB)",
  abac: "ABAC: boletim mensal do consórcio",
};

export const LINKS_DAS_FONTES = {
  bcb_sgs: "https://dadosabertos.bcb.gov.br/",
  bcb_focus: "https://www.bcb.gov.br/publicacoes/focus",
  bcb_taxas: "https://www.bcb.gov.br/estatisticas/reporttxjuros",
  bcb_panorama: "https://olinda.bcb.gov.br/olinda/servico/PANORAMA_DE_CONSORCIOS/versao/v1/aplicacao",
  tesouro: "https://www.tesourotransparente.gov.br/ckan/dataset/taxas-dos-titulos-ofertados-pelo-tesouro-direto",
  ibge: "https://sidra.ibge.gov.br/tabela/1737",
  abac: "https://abac.org.br/",
};

export const SEVERIDADES = { alta: "Alta", media: "Média", info: "Informação" };

const ABAC_SERIES = [
  ["abac_participantes_ativos", "Participantes ativos"],
  ["abac_cotas_vendidas_no_ano", "Cotas vendidas no ano"],
  ["abac_contemplacoes_no_ano", "Contemplações no ano"],
  ["abac_creditos_comercializados_no_ano", "Créditos comercializados no ano"],
  ["abac_creditos_disponibilizados_no_ano", "Créditos disponibilizados no ano"],
  ["abac_ticket_medio", "Ticket médio"],
];

export const GRUPOS_EM_DESTAQUE = [
  "Inadimplência",
  "Pré Inadimplência",
  "Índice de Exclusão",
  "Taxa de Administração",
  "Prazo Médio",
  "Valor Médio",
];

// --------------------------------------------------------------------------------------------- estatística
export function mediana(valores) {
  const v = [...valores].sort((a, b) => a - b);
  if (v.length === 0) return null;
  const meio = v.length >> 1;
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

/** Percentil por interpolação linear entre vizinhos (o mesmo do PERCENTIL.INC do Excel). */
export function percentil(valores, p) {
  const v = [...valores].sort((a, b) => a - b);
  if (v.length === 0) return null;
  const pos = (v.length - 1) * p;
  const i = Math.floor(pos);
  return i + 1 < v.length ? v[i] + (pos - i) * (v[i + 1] - v[i]) : v[i];
}

// --------------------------------------------------------------------------------------------- acesso à foto
export function variacaoDe(entrada, dias) {
  return entrada?.variacoes?.[String(dias)] ?? null;
}

export function entradaDeVariacao(foto, fonte, serie, dimensao = "") {
  return foto.derivados.variacoes.find((v) => v.fonte === fonte && v.serie === serie && v.dimensao === dimensao) ?? null;
}

const ano = (iso) => Number(iso.slice(0, 4));

// --------------------------------------------------------------------------------------------- resumo
/** Os números de manchete do topo. Um número que a foto não tem simplesmente não aparece. */
export function manchetes(foto) {
  const { ancoras, valor_presente: tabela } = foto.derivados;
  const doAno = ano(foto.data);
  const itens = [];

  const dosDados = (id, rotulo, entrada, extra = {}) => {
    if (!entrada) return;
    itens.push({ id, rotulo, valor: entrada.valor, unidade: entrada.unidade, data: entrada.data, delta7: variacaoDe(entrada, 7), ...extra });
  };

  dosDados("selic_meta", "Meta Selic", entradaDeVariacao(foto, "bcb_sgs", "selic_meta"), { fonte: "Banco Central (SGS)" });
  if (ancoras.cdi_anualizado) {
    itens.push({
      id: "cdi", rotulo: "CDI anualizado", valor: ancoras.cdi_anualizado.taxa, unidade: "% a.a.",
      data: ancoras.cdi_anualizado.data, delta7: null, fonte: "Banco Central (SGS)", nota: "CDI diário elevado a 252 dias úteis",
    });
  }
  dosDados("ipca_12m", "IPCA em 12 meses", entradaDeVariacao(foto, "bcb_sgs", "ipca_12_meses"), { fonte: "Banco Central (SGS)", dataEhMes: true });

  const prazo3 = tabela.length ? tabela.reduce((a, b) => (Math.abs(b.meses - 36) < Math.abs(a.meses - 36) ? b : a)) : null;
  if (prazo3) {
    for (const [chave, id, rotulo, curva] of [["nominal", "ancora_fixa", "Âncora em R$ fixos", ancoras.curva_nominal], ["real", "ancora_ipca", "Âncora IPCA+", ancoras.curva_real]]) {
      if (prazo3[chave] && curva) {
        itens.push({
          id, rotulo: `${rotulo}, ${prazo3.anos.toLocaleString("pt-BR")} anos`, valor: prazo3[chave].taxa_ancora,
          unidade: "% a.a.", data: curva.base, delta7: null, fonte: "Tesouro Direto", nota: chave === "real" ? "mais o IPCA do período" : "taxa prefixada",
        });
      }
    }
  }
  dosDados("fin_veiculos", "Financiamento de veículos (mediana)", entradaDeVariacao(foto, "bcb_taxas", "mediana_taxa_financiamento_veiculos"), { fonte: "Banco Central (taxas por banco)" });
  const imob = entradaDeVariacao(foto, "bcb_taxas", "mediana_taxa_financiamento_imobiliario");
  dosDados("fin_imobiliario", "Financiamento imobiliário (mediana)", imob, { fonte: "Banco Central (taxas por banco)", dataEhMes: true });
  dosDados("focus_selic", `Selic esperada para ${doAno + 1}`, entradaDeVariacao(foto, "bcb_focus", "focus_selic_anual", `ano=${doAno + 1}`), { fonte: "Focus (Banco Central)" });
  dosDados("focus_ipca", `IPCA esperado para ${doAno}`, entradaDeVariacao(foto, "bcb_focus", "focus_ipca_anual", `ano=${doAno}`), { fonte: "Focus (Banco Central)" });
  return itens;
}

export function mudancas(foto) {
  return foto.mudancas ?? [];
}

// --------------------------------------------------------------------------------------------- custo do dinheiro
/** As duas curvas do Tesouro com a variação de cada vencimento (1, 7 e 30 dias). */
export function curvas(foto) {
  const defs = [
    ["curva_nominal", "nominal", "Prefixado", "paga uma taxa fixa, em R$ fixos"],
    ["curva_real", "real", "IPCA+", "paga o IPCA mais uma taxa fixa"],
  ];
  const saida = [];
  for (const [chave, id, nome, descricao] of defs) {
    const curva = foto.derivados.ancoras[chave];
    if (!curva) continue;
    saida.push({
      id,
      nome,
      descricao,
      titulo: curva.titulo,
      base: curva.base,
      pontos: curva.pontos.map((p) => {
        const e = entradaDeVariacao(foto, "tesouro", "tesouro_taxa_compra", `titulo=${curva.titulo}|vencimento=${p.vencimento}`);
        const sete = variacaoDe(e, 7);
        return {
          ...p,
          d1: variacaoDe(e, 1)?.delta ?? null,
          d7: sete?.delta ?? null,
          d30: variacaoDe(e, 30)?.delta ?? null,
          ref7: sete?.valor_ref ?? null, // a taxa deste vencimento 7 dias atrás
          dias7: sete?.dias ?? null,
        };
      }),
    });
  }
  return saida;
}

/** Expectativas do Focus: Selic e IPCA no fim de cada ano e a Selic por reunião do Copom. */
export function focus(foto) {
  const doTipo = (serie) =>
    foto.derivados.variacoes
      .filter((v) => v.fonte === "bcb_focus" && v.serie === serie)
      .map((v) => ({ ano: Number(v.dimensao.replace("ano=", "")), valor: v.valor, data: v.data, d7: variacaoDe(v, 7), d30: variacaoDe(v, 30) }))
      .sort((a, b) => a.ano - b.ano);
  const reunioes = foto.registros.filter((r) => r.serie === "focus_selic_reuniao");
  const ultima = reunioes.map((r) => r.data_ref).sort().at(-1);
  return {
    selic: doTipo("focus_selic_anual"),
    ipca: doTipo("focus_ipca_anual"),
    data: ultima ?? doTipo("focus_selic_anual")[0]?.data ?? null,
    reunioes: reunioes
      .filter((r) => r.data_ref === ultima)
      .map((r) => ({ reuniao: r.dimensao.replace("reuniao=", ""), valor: r.valor }))
      .sort((a, b) => ordemDaReuniao(a.reuniao) - ordemDaReuniao(b.reuniao)),
  };
}

function ordemDaReuniao(codigo) {
  const m = /^R(\d+)\/(\d{4})$/.exec(codigo);
  return m ? Number(m[2]) * 100 + Number(m[1]) : 0;
}

/**
 * Os caminhos que um valor corrigido pela Selic ou pelo IPCA pode seguir daqui para a frente, tirados da foto:
 * a Selic de cada ano (no ano em curso, a média entre a meta de hoje e a esperada para o fim do ano; nos seguintes,
 * a do Focus, repetindo a última quando o Focus acaba) e o IPCA esperado de cada ano (idem). É uma projeção simples,
 * não uma previsão: serve para dar ordem de grandeza ao que um valor corrigido valerá no pagamento.
 */
export function caminhoDeCorrecao(foto) {
  const f = focus(foto);
  const anoBase = Number(foto.data.slice(0, 4));
  const mesBase = Number(foto.data.slice(5, 7)) - 1;
  const meta = entradaDeVariacao(foto, "bcb_sgs", "selic_meta")?.valor ?? null;
  const mapa = (lista) => new Map(lista.map((x) => [x.ano, x.valor]));
  const selic = mapa(f.selic);
  const ipca = mapa(f.ipca);
  const repete = (m, ano) => {
    if (m.size === 0) return null;
    if (m.has(ano)) return m.get(ano);
    const anos = [...m.keys()].sort((a, b) => a - b);
    return ano > anos.at(-1) ? m.get(anos.at(-1)) : m.get(anos[0]);
  };
  return {
    anoBase,
    mesBase,
    anosDoFocus: { selic: [...selic.keys()].sort((a, b) => a - b), ipca: [...ipca.keys()].sort((a, b) => a - b) },
    selicDoAno(ano) {
      if (ano === anoBase && meta !== null && selic.has(anoBase)) return (meta + selic.get(anoBase)) / 2;
      return repete(selic, ano) ?? meta;
    },
    ipcaDoAno: (ano) => repete(ipca, ano),
  };
}

/** Selic, CDI e IPCA do SGS, uma linha por série, com a data do último dado. */
export function seriesDoBanco(foto) {
  const ordem = [
    ["selic_meta", "Meta Selic"],
    ["selic_over", "Selic over"],
    ["cdi", "CDI diário"],
    ["selic_acumulada_mes_anualizada", "Selic do mês, anualizada"],
    ["ipca_mensal", "IPCA do mês"],
    ["ipca_12_meses", "IPCA em 12 meses"],
  ];
  const mensais = new Set(["selic_acumulada_mes_anualizada", "ipca_mensal", "ipca_12_meses"]);
  return ordem
    .map(([serie, rotulo]) => {
      const e = entradaDeVariacao(foto, "bcb_sgs", serie);
      return e && { serie, rotulo, mensal: mensais.has(serie), valor: e.valor, unidade: e.unidade, data: e.data, d1: variacaoDe(e, 1), d7: variacaoDe(e, 7), d30: variacaoDe(e, 30) };
    })
    .filter(Boolean);
}

// --------------------------------------------------------------------------------------------- crédito concorrente
/**
 * As taxas por banco na data mais nova da série e a mediana de comparação: a de 7 dias atrás, que o robô já
 * calculou (veículos, semanal); sem ela (imobiliário, mensal), a mediana da data anterior que a foto guarda.
 */
function porBanco(foto, serie, serieDaMediana) {
  const linhas = foto.registros.filter((r) => r.serie === serie);
  if (linhas.length === 0) return null;
  const datas = [...new Set(linhas.map((r) => r.data_ref))].sort();
  const ultima = datas.at(-1);
  const bancos = linhas
    .filter((r) => r.data_ref === ultima)
    .map((r) => ({ banco: r.dimensao.replace("banco=", ""), taxa: r.valor }))
    .sort((a, b) => a.taxa - b.taxa || a.banco.localeCompare(b.banco, "pt-BR"));
  const taxas = bancos.map((b) => b.taxa);
  const dosSeteDias = variacaoDe(entradaDeVariacao(foto, "bcb_taxas", serieDaMediana), 7);
  let anterior = dosSeteDias && { data: dosSeteDias.ref_data, mediana: dosSeteDias.valor_ref };
  if (!anterior && datas.length > 1) {
    const data = datas.at(-2);
    anterior = { data, mediana: mediana(linhas.filter((r) => r.data_ref === data).map((r) => r.valor)) };
  }
  return {
    data: ultima,
    n: bancos.length,
    bancos,
    resumo: { menor: taxas[0], p25: percentil(taxas, 0.25), mediana: mediana(taxas), p75: percentil(taxas, 0.75), maior: taxas.at(-1) },
    anterior,
  };
}

export function creditos(foto) {
  return {
    imobiliario: porBanco(foto, "taxa_financiamento_imobiliario", "mediana_taxa_financiamento_imobiliario"),
    veiculos: porBanco(foto, "taxa_financiamento_veiculos", "mediana_taxa_financiamento_veiculos"),
  };
}

// --------------------------------------------------------------------------------------------- setor
export function abac(foto) {
  return ABAC_SERIES.map(([serie, rotulo]) => {
    const pontos = foto.registros
      .filter((r) => r.serie === serie)
      .map((r) => ({ data: r.data_ref, valor: r.valor }))
      .sort((a, b) => a.data.localeCompare(b.data));
    if (pontos.length === 0) return null;
    const ultimo = pontos.at(-1);
    const anterior = pontos.length > 1 ? pontos.at(-2) : null;
    const unidade = foto.registros.find((r) => r.serie === serie).unidade;
    // "…no ano" é acumulado do ano e recomeça em janeiro: de dezembro para janeiro não há variação para mostrar
    const acumulado = serie.endsWith("_no_ano");
    const viradaDoAno = acumulado && anterior !== null && ano(anterior.data) !== ano(ultimo.data);
    return { serie, rotulo, unidade, acumulado, pontos, ultimo, anterior, delta: anterior && !viradaDoAno ? ultimo.valor - anterior.valor : null };
  }).filter(Boolean);
}

/** Panorama de Consórcios do BCB: cada métrica contra o trimestre anterior, agrupada como o BCB agrupa. */
export function panorama(foto) {
  const setor = foto.derivados.setor ?? [];
  const grupos = new Map();
  for (const linha of setor) {
    if (!grupos.has(linha.grupo)) grupos.set(linha.grupo, []);
    grupos.get(linha.grupo).push(linha);
  }
  const lista = [...grupos.entries()].map(([grupo, linhas]) => ({ grupo, linhas }));
  return {
    data: setor[0]?.data ?? null,
    dataAnterior: setor[0]?.data_anterior ?? null,
    grupos: lista,
    destaques: GRUPOS_EM_DESTAQUE.map((g) => lista.find((x) => x.grupo === g)).filter(Boolean),
  };
}

// --------------------------------------------------------------------------------------------- fontes
/** O erro de uma fonte em uma frase curta (o texto cru traz o endereço e a exceção de rede). */
export function resumoDoErro(erro) {
  if (!erro) return "";
  if (/timed out|timeout|tempo/i.test(erro)) return "Sem resposta no tempo limite";
  const http = /HTTP (\d{3})/i.exec(erro);
  if (http) return `A fonte respondeu com erro ${http[1]}`;
  return erro.length > 120 ? `${erro.slice(0, 117)}...` : erro;
}

/** O que dizer de cada fonte: o erro em uma frase (sem repetir o texto cru que vem em `falhas`) e os avisos. */
export function observacoesDaFonte(f) {
  const erro = resumoDoErro(f.erro);
  return [...(erro ? [erro] : f.falhas ?? []), ...(f.atrasos ?? []), ...(f.avisos ?? [])].filter(Boolean);
}

export function fontes(foto) {
  return foto.fontes.map((f) => ({ ...f, nome: NOMES_DAS_FONTES[f.id] ?? f.id, link: LINKS_DAS_FONTES[f.id] ?? null, erroCurto: resumoDoErro(f.erro), observacoes: observacoesDaFonte(f) }));
}

export function problemas(foto) {
  return fontes(foto).filter((f) => f.situacao !== "ok");
}

// --------------------------------------------------------------------------------------------- o que mexeu
const SITUACAO_FALADA = { FALHOU: "sem resposta", ATRASADO: "com dado atrasado", PARCIAL: "só em parte" };

/** O texto de uma mudança do dia sem o miolo técnico (por exemplo, o erro cru de rede de uma fonte que falhou). */
export function textoDaMudanca(m) {
  const t = /^Fonte (\w+) \((essencial|complementar)\): (FALHOU|ATRASADO|PARCIAL)/.exec(m.texto ?? "");
  if (!t) return m.texto ?? "";
  return `${NOMES_DAS_FONTES[t[1]] ?? t[1]}: fonte ${t[2]} ${SITUACAO_FALADA[t[3]]}`;
}

/**
 * As mudanças do dia em linguagem simples, as maiores primeiro. Os vencimentos do mesmo título do Tesouro viram uma
 * linha só ("Tesouro Prefixado subiu de +2,05 a +2,26 p.p. em 7 dias").
 * @returns {{ texto: string, severidade: string, peso: number }[]}
 */
export function movimentos(foto) {
  const grupos = new Map();
  const itens = [];
  for (const m of mudancas(foto)) {
    const t = m.serie === "tesouro_taxa_compra" && /^titulo=(.+?)\|vencimento=(\d{4})/.exec(m.dimensao ?? "");
    if (!t) {
      itens.push({ texto: textoDaMudanca(m), severidade: m.severidade, peso: Math.abs(m.delta ?? 0) });
      continue;
    }
    const g = grupos.get(t[1]) ?? { titulo: t[1], deltas: [], anos: [], severidade: m.severidade, dias: /em (\d+) dias/.exec(m.texto ?? "")?.[1] ?? "7" };
    g.deltas.push(m.delta);
    g.anos.push(Number(t[2]));
    grupos.set(t[1], g);
  }
  for (const g of grupos.values()) {
    const sobe = g.deltas.every((d) => d > 0);
    const desce = g.deltas.every((d) => d < 0);
    const ordenados = [...g.deltas].sort((a, b) => Math.abs(a) - Math.abs(b));
    const faixa = g.deltas.length === 1 ? pp(ordenados[0]) : `de ${pp(ordenados[0])} a ${pp(ordenados.at(-1))}`;
    const anos = [...g.anos].sort();
    const quando = anos[0] === anos.at(-1) ? `vencimento ${anos[0]}` : `vencimentos ${anos[0]} a ${anos.at(-1)}`;
    itens.push({
      texto: `${g.titulo} ${sobe ? "subiu" : desce ? "caiu" : "mexeu"} ${faixa} em ${g.dias} dias (${quando})`,
      severidade: g.severidade,
      peso: Math.max(...g.deltas.map(Math.abs)),
    });
  }
  return itens.sort((a, b) => b.peso - a.peso);
}

// --------------------------------------------------------------------------------------------- cotas do setor
const SEGMENTOS_EXCLUIDOS = [
  [/^Cotas exclu[ií]das - Total - Im[oó]veis/i, "Imóveis"],
  [/^Cotas exclu[ií]das - Total - Autom[oó]veis/i, "Automóveis"],
  [/^Cotas exclu[ií]das - Total - Motocicletas/i, "Motocicletas"],
  [/^Cotas exclu[ií]das - Total - Outros/i, "Outros bens e serviços"],
];

/**
 * Cotas ativas e excluídas (canceladas) do Panorama do Banco Central, em milhares: o total, a mudança no trimestre
 * e a mudança por segmento. O índice de exclusão do próprio Panorama é excluídas ÷ (ativas + excluídas); confere
 * com estes números (12.751,82 ÷ 26.128,08 = 48,80% no Panorama de jun/2026).
 */
export function cotasDoSetor(foto) {
  const linhas = foto.derivados.setor ?? [];
  const acha = (re) => linhas.find((l) => re.test(l.descricao)) ?? null;
  const resume = (l) => l && { valor: l.valor, anterior: l.anterior, delta: l.delta, data: l.data, dataAnterior: l.data_anterior, unidade: l.unidade };
  const ativas = resume(acha(/^Cotas ativas - Total$/i));
  const excluidas = resume(acha(/^Cotas exclu[ií]das - Total$/i));
  const porSegmento = SEGMENTOS_EXCLUIDOS.map(([re, segmento]) => {
    const l = acha(re);
    return l && { segmento, valor: l.valor, delta: l.delta, unidade: l.unidade };
  })
    .filter(Boolean)
    .sort((a, b) => b.delta - a.delta);
  const indice = resume(acha(/Índice de Exclusão - Total/i));
  if (!ativas && !excluidas && porSegmento.length === 0) return null;
  return { ativas, excluidas, porSegmento, indice, calculado: ativas && excluidas ? (excluidas.valor / (ativas.valor + excluidas.valor)) * 100 : null };
}
