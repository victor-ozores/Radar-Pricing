// Painel do Radar Pricing: baixa a foto do dia da branch `data` e mostra cada bloco.

import { desconta } from "./calc.js";
import { h, limpa, selo, tabela } from "./dom.js";
import { AVISO, excelDaFoto, nomeDoArquivo } from "./excel.js";
import { baseDaFoto, buscaFoto, DIAS_DE_BUSCA, diasEntre, hojeEmBrasilia, procuraFoto, somaDias } from "./foto.js";
import { comUnidade, dataBR, deltaComUnidade, diaDaSemana, horaBRT, idade, mesAno, num, pct, pp, reais } from "./formato.js";
import { curvasDoTesouro } from "./grafico.js";
import * as modelo from "./modelo.js";

const base = baseDaFoto();
const $ = (id) => document.getElementById(id);
const estado = { foto: null, data: null, maisRecente: null, parar: [], aposMontar: [] };

// --------------------------------------------------------------------------------------------- resumo
function tile(m) {
  const casas = m.unidade === "% ao dia" ? 4 : 2;
  const d = m.delta7;
  const seta = !d ? "" : d.delta > 0.0004 ? "▲" : d.delta < -0.0004 ? "▼" : "■";
  const quando = m.dataEhMes ? `ref. ${mesAno(m.data)}` : `dado de ${dataBR(m.data)}`;
  return h(
    "div",
    { classe: "tile" },
    h("p", { classe: "tile-rotulo" }, m.rotulo),
    h("p", { classe: "tile-valor" }, num(m.valor, casas), h("span", { classe: "tile-unidade" }, ` ${m.unidade}`)),
    d && h("p", { classe: "tile-delta" }, h("span", { "aria-hidden": "true" }, `${seta} `), Math.abs(d.delta) < 0.0004 ? `sem variação em ${d.dias} dias` : `${pp(d.delta)} em ${d.dias} dias`),
    h("p", { classe: "tile-nota" }, `${quando} · ${m.nota ? `${m.nota} · ` : ""}${m.fonte}`),
  );
}

const ICONE_SEVERIDADE = { alta: ["serio", "▲"], media: ["aviso", "◆"], info: ["neutro", "●"] };

function listaDeMudancas(foto) {
  const lista = modelo.mudancas(foto);
  if (lista.length === 0) return h("p", { classe: "vazio" }, "Sem mudanças relevantes nesta foto.");
  return h(
    "ul",
    { classe: "mudancas" },
    lista.map((m) => {
      const [tipo, icone] = ICONE_SEVERIDADE[m.severidade] ?? ["neutro", "●"];
      return h("li", {}, selo(tipo, icone, modelo.SEVERIDADES[m.severidade] ?? m.severidade), h("span", { classe: "mudanca-texto" }, m.texto));
    }),
  );
}

function blocoResumo(foto) {
  return [
    h("div", { classe: "tiles" }, modelo.manchetes(foto).map(tile)),
    h("h3", {}, "Mudanças do dia"),
    h("p", { classe: "lead" }, "O que andou mais que o normal desde a foto anterior. Os limites ficam no arquivo de configuração do robô."),
    listaDeMudancas(foto),
  ];
}

// --------------------------------------------------------------------------------------------- custo do dinheiro
function blocoCusto(foto) {
  const curvas = modelo.curvas(foto);
  const hospedeiro = h("div", { classe: "grafico" });
  const legenda = h(
    "ul",
    { classe: "legenda" },
    curvas.map((c, i) => h("li", {}, h("span", { classe: `chave chave-${i + 1}` }), h("strong", {}, `Tesouro ${c.nome}`), ` ${c.descricao}`)),
  );
  const tabelaCurvas = tabela({
    legenda: "Taxas de compra do Tesouro Direto por vencimento",
    colunas: [{ t: "Título e vencimento" }, { t: "Prazo (anos)", num: true }, { t: "Taxa", num: true }, { t: "Em 1 dia", num: true }, { t: "Em 7 dias", num: true }, { t: "Em 30 dias", num: true }],
    linhas: curvas.flatMap((c) =>
      c.pontos.map((p) => [`${c.nome}, ${dataBR(p.vencimento)}`, num(p.anos, 1), `${pct(p.taxa)} a.a.`, pp(p.d1), pp(p.d7), pp(p.d30)]),
    ),
  });
  const foco = modelo.focus(foto);
  const anos = [...new Set([...foco.selic, ...foco.ipca].map((x) => x.ano))].sort();
  const tabelaFocus = tabela({
    legenda: `Focus, mediana das expectativas do mercado para o fim de cada ano (edição de ${dataBR(foco.data)})`,
    colunas: [{ t: "Ano" }, { t: "Selic esperada", num: true }, { t: "Em 7 dias", num: true }, { t: "IPCA esperado", num: true }, { t: "Em 7 dias", num: true }],
    linhas: anos.map((ano) => {
      const s = foco.selic.find((x) => x.ano === ano);
      const i = foco.ipca.find((x) => x.ano === ano);
      return [String(ano), s ? `${pct(s.valor)} a.a.` : "—", pp(s?.d7?.delta), i ? `${pct(i.valor)} a.a.` : "—", pp(i?.d7?.delta)];
    }),
  });
  const reunioes = foco.reunioes.length
    ? h(
        "details",
        {},
        h("summary", {}, "Selic esperada reunião a reunião do Copom"),
        tabela({ legenda: "Focus, Selic esperada ao fim de cada reunião do Copom", colunas: [{ t: "Reunião" }, { t: "Selic esperada", num: true }], linhas: foco.reunioes.map((r) => [r.reuniao, `${pct(r.valor)} a.a.`]) }),
      )
    : null;
  const sgs = modelo.seriesDoBanco(foto);
  const tabelaSgs = tabela({
    legenda: "Banco Central (SGS): Selic, CDI e IPCA",
    colunas: [{ t: "Série" }, { t: "Valor", num: true }, { t: "Data do dado", num: true }, { t: "Em 1 dia", num: true }, { t: "Em 7 dias", num: true }, { t: "Em 30 dias", num: true }],
    linhas: sgs.map((s) => [s.rotulo, comUnidade(s.valor, s.unidade), dataBR(s.data), deltaComUnidade(s.d1?.delta, s.unidade), deltaComUnidade(s.d7?.delta, s.unidade), deltaComUnidade(s.d30?.delta, s.unidade)]),
  });

  const nota = curvas[0] ? `Taxas de compra de ${dataBR(curvas[0].base)}.` : "";
  const bloco = [
    h("p", { classe: "lead" }, "O ponto de partida do desconto: quanto o governo paga hoje a quem empresta por cada prazo, sem risco de empresa. Acima dele entra o risco de cada operação."),
    h("h3", {}, "Curvas do Tesouro Direto"),
    legenda,
    hospedeiro,
    h("p", { classe: "nota" }, `${nota} Cada ponto é um vencimento; passe o mouse ou use a tecla Tab para ver os detalhes.`),
    h("details", {}, h("summary", {}, "Ver como tabela"), tabelaCurvas),
    h("h3", {}, "O que o mercado espera (Focus)"),
    tabelaFocus,
    reunioes,
    h("h3", {}, "Selic, CDI e IPCA"),
    tabelaSgs,
  ];
  estado.aposMontar.push(() => curvasDoTesouro(hospedeiro, curvas)); // o gráfico mede a caixa: só depois de ela estar na página
  return bloco;
}

// --------------------------------------------------------------------------------------------- crédito concorrente
function cartaoDeCredito(titulo, bloco, tipoDaFonte) {
  if (!bloco) return h("div", { classe: "cartao" }, h("h3", {}, titulo), h("p", { classe: "vazio" }, "A foto deste dia não trouxe estas taxas."));
  const r = bloco.resumo;
  const variacao = bloco.anterior
    ? `Mediana ${pp(r.mediana - bloco.anterior.mediana)} contra ${dataBR(bloco.anterior.data)}`
    : "Sem data anterior na foto para comparar";
  const resumo = h(
    "dl",
    { classe: "resumo-credito" },
    [["Menor", r.menor], ["1º quartil", r.p25], ["Mediana", r.mediana], ["3º quartil", r.p75], ["Maior", r.maior]].map(([rotulo, valor]) =>
      h("div", { classe: rotulo === "Mediana" ? "destaque" : "" }, h("dt", {}, rotulo), h("dd", {}, pct(valor))),
    ),
  );
  const mostrar = bloco.bancos.slice(0, 10);
  const todos = (lista) => tabela({ legenda: `${titulo}: taxa por banco`, colunas: [{ t: "Banco" }, { t: "Taxa", num: true }], linhas: lista.map((b) => [b.banco, `${pct(b.taxa)} a.a.`]) });
  return h(
    "div",
    { classe: "cartao" },
    h("h3", {}, titulo),
    h("p", { classe: "nota" }, `${bloco.n} bancos, dado de ${tipoDaFonte === "mes" ? mesAno(bloco.data) : dataBR(bloco.data)}. ${variacao}.`),
    resumo,
    h("h4", {}, bloco.n > 10 ? "Os 10 mais baratos" : "Todos os bancos"),
    todos(mostrar),
    bloco.n > 10 ? h("details", {}, h("summary", {}, `Ver os ${bloco.n} bancos`), todos(bloco.bancos)) : null,
  );
}

function blocoCredito(foto) {
  const { imobiliario, veiculos } = modelo.creditos(foto);
  return [
    h("p", { classe: "lead" }, "O que os bancos cobram para financiar um imóvel ou um veículo: o crédito que concorre com o consórcio. Quartis por interpolação linear entre os bancos."),
    h("div", { classe: "duas-colunas" }, cartaoDeCredito("Financiamento imobiliário", imobiliario, "mes"), cartaoDeCredito("Financiamento de veículos", veiculos, "dia")),
  ];
}

// --------------------------------------------------------------------------------------------- setor
function tabelaDoPanorama(linhas, comGrupo) {
  return tabela({
    legenda: "Panorama de Consórcios do Banco Central: valor atual contra o trimestre anterior",
    colunas: [{ t: comGrupo ? "Grupo e métrica" : "Métrica" }, { t: "Valor", num: true }, { t: "Trimestre anterior", num: true }, { t: "Variação", num: true }],
    linhas: linhas.map((l) => [comGrupo ? `${l.grupo}: ${l.descricao}` : l.descricao, comUnidade(l.valor, l.unidade), comUnidade(l.anterior, l.unidade), deltaComUnidade(l.delta, l.unidade)]),
  });
}

function blocoSetor(foto) {
  const abac = modelo.abac(foto);
  const pan = modelo.panorama(foto);
  const tabelaAbac = abac.length
    ? tabela({
        legenda: "ABAC: boletim mensal do sistema de consórcios",
        colunas: [{ t: "Indicador" }, { t: "Último dado", num: true }, { t: "Mês", num: true }, { t: "Mês anterior", num: true }, { t: "Variação", num: true }],
        linhas: abac.map((a) => [a.rotulo, comUnidade(a.ultimo.valor, a.unidade), mesAno(a.ultimo.data), a.anterior ? comUnidade(a.anterior.valor, a.unidade) : "—", deltaComUnidade(a.delta, a.unidade)]),
      })
    : h("p", { classe: "vazio" }, "A ABAC está sem dado nesta foto (fonte complementar). O boletim fica em abac.org.br.");

  const alvo = h("div", { "aria-live": "polite" });
  const mostra = (valor) => {
    const linhas = valor === "__destaques" ? pan.destaques.flatMap((g) => g.linhas) : (pan.grupos.find((g) => g.grupo === valor)?.linhas ?? []);
    limpa(alvo).append(tabelaDoPanorama(linhas, valor === "__destaques"));
  };
  const seletor = h(
    "select",
    { id: "grupo-panorama", aochange: (e) => mostra(e.target.value) },
    h("option", { value: "__destaques" }, "Destaques"),
    pan.grupos.map((g) => h("option", { value: g.grupo }, `${g.grupo} (${g.linhas.length})`)),
  );
  mostra("__destaques");
  return [
    h("p", { classe: "lead" }, "Como está o mercado de consórcio. O boletim da ABAC sai todo mês; o Panorama do Banco Central, todo trimestre, por isso estes números mudam devagar."),
    h("h3", {}, "Boletim da ABAC"),
    tabelaAbac,
    h("h3", {}, "Panorama de Consórcios do Banco Central"),
    pan.grupos.length
      ? [
          h("p", { classe: "nota" }, `Trimestre de ${dataBR(pan.data)} contra ${dataBR(pan.dataAnterior)}. ${pan.grupos.reduce((s, g) => s + g.linhas.length, 0)} métricas em ${pan.grupos.length} grupos.`),
          h("div", { classe: "filtro" }, h("label", { for: "grupo-panorama" }, "Grupo de métricas"), seletor),
          alvo,
        ]
      : h("p", { classe: "vazio" }, "O Panorama não veio nesta foto."),
  ];
}

// --------------------------------------------------------------------------------------------- calculadora
function blocoCalculadora(foto) {
  const par = foto.derivados.parametros;
  const { curva_nominal: nominal, curva_real: real } = foto.derivados.ancoras;
  const campo = (id, rotulo, valor, atributos) =>
    h("div", { classe: "campo" }, h("label", { for: id }, rotulo), h("input", { id, type: "number", inputmode: "decimal", value: valor, ...atributos }));
  const entrada = {
    valor: campo("calc-valor", "Valor a receber (R$)", par.valor_face, { min: 0, step: "any" }),
    meses: campo("calc-meses", "Prazo até receber (meses)", 36, { min: 1, max: 600, step: 1 }),
    spread: campo("calc-spread", "Spread de risco (p.p.), de demonstração", par.spread_demonstracao_pp, { min: 0, step: 0.25 }),
  };
  const saida = h("div", { id: "calc-saida", "aria-live": "polite" });

  const coluna = (titulo, curva, sufixo) => {
    const v = Number(entrada.valor.querySelector("input").value);
    const m = Number(entrada.meses.querySelector("input").value);
    const s = Number(entrada.spread.querySelector("input").value);
    const r = desconta(curva, v, m, s);
    if (!r) return h("div", { classe: "resultado" }, h("h4", {}, titulo), h("p", { classe: "vazio" }, "A foto deste dia não trouxe esta curva."));
    return h(
      "div",
      { classe: "resultado" },
      h("h4", {}, titulo),
      h(
        "dl",
        {},
        h("div", {}, h("dt", {}, "Taxa da âncora (Tesouro)"), h("dd", {}, `${pct(r.taxa_ancora)} a.a.${sufixo}`)),
        h("div", {}, h("dt", {}, "Taxa de desconto (âncora + spread)"), h("dd", {}, `${pct(r.taxa_demonstracao)} a.a.${sufixo}`)),
        h("div", { classe: "destaque" }, h("dt", {}, "Valor presente"), h("dd", {}, reais(r.vp_demonstracao))),
        h("div", {}, h("dt", {}, "Só na âncora, sem spread"), h("dd", {}, reais(r.vp_ancora))),
        h("div", {}, h("dt", {}, "Desconto sobre o valor a receber"), h("dd", {}, pct(v > 0 ? (1 - r.vp_demonstracao / v) * 100 : null, 1))),
      ),
      r.extrapolado ? h("p", { classe: "nota" }, "Prazo fora da curva do Tesouro: usei a taxa do vencimento mais próximo.") : null,
    );
  };

  const calcula = () => {
    const v = Number(entrada.valor.querySelector("input").value);
    const m = Number(entrada.meses.querySelector("input").value);
    const s = Number(entrada.spread.querySelector("input").value);
    if (!(v > 0) || !(m >= 1) || !Number.isFinite(s) || s < 0) {
      limpa(saida).append(h("p", { classe: "vazio", role: "alert" }, "Digite um valor e um prazo maiores que zero, e um spread de zero ou mais."));
      return;
    }
    limpa(saida).append(h("div", { classe: "duas-colunas" }, coluna("Em R$ fixos (Tesouro Prefixado)", nominal, ""), coluna("Corrigido pelo IPCA (Tesouro IPCA+)", real, " + IPCA")));
  };
  Object.values(entrada).forEach((c) => c.querySelector("input").addEventListener("input", calcula));
  calcula();

  const tabelaPadrao = tabela({
    legenda: `A tabela da foto: ${reais(par.valor_face, 0)} recebidos em cada prazo, com spread de demonstração de ${num(par.spread_demonstracao_pp)} p.p.`,
    colunas: [{ t: "Prazo" }, { t: "R$ fixos: taxa de desconto", num: true }, { t: "R$ fixos: valor presente", num: true }, { t: "IPCA+: taxa de desconto", num: true }, { t: "IPCA+: valor presente", num: true }],
    linhas: foto.derivados.valor_presente.map((l) => [
      `${l.meses} meses`,
      l.nominal ? `${pct(l.nominal.taxa_demonstracao)} a.a.${l.nominal.extrapolado ? " *" : ""}` : "—",
      l.nominal ? reais(l.nominal.vp_demonstracao) : "—",
      l.real ? `${pct(l.real.taxa_demonstracao)} a.a. + IPCA${l.real.extrapolado ? " *" : ""}` : "—",
      l.real ? reais(l.real.vp_demonstracao) : "—",
    ]),
  });
  return [
    h("p", { classe: "lead" }, "Quanto vale hoje um valor que só será recebido mais tarde. Taxa de desconto = a taxa do Tesouro para o prazo + um spread de risco. Mude os campos e veja o efeito."),
    h("div", { classe: "aviso-demo", role: "note" }, h("strong", {}, "Exemplo de demonstração. "), par.aviso.charAt(0).toUpperCase() + par.aviso.slice(1), `. Convenção: ${par.convencao}.`),
    h("form", { classe: "formulario", aosubmit: (e) => e.preventDefault() }, Object.values(entrada)),
    saida,
    h("h3", {}, "Prazos de referência"),
    tabelaPadrao,
    h("p", { classe: "nota" }, "* prazo fora da curva do Tesouro: usa a taxa do vencimento mais próximo."),
  ];
}

// --------------------------------------------------------------------------------------------- fontes
function baixaExcel(foto) {
  const blob = new Blob([excelDaFoto(foto)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: nomeDoArquivo(foto) });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const SITUACOES = { ok: ["ok", "✓", "OK"], atrasado: ["aviso", "◆", "Atrasado"], parcial: ["aviso", "◆", "Parcial"], falhou: ["serio", "▲", "Falhou"] };

function blocoFontes(foto, data) {
  const fontes = modelo.fontes(foto);
  const linhas = fontes.map((f) => {
    const [tipo, icone, texto] = SITUACOES[f.situacao] ?? ["neutro", "●", f.situacao];
    const obs = [f.erro, ...f.falhas, ...f.atrasos, ...f.avisos].filter(Boolean);
    return [
      f.link ? h("a", { href: f.link, target: "_blank", rel: "noopener noreferrer" }, f.nome) : f.nome,
      f.papel === "essencial" ? "Essencial" : "Complementar",
      selo(tipo, icone, texto),
      String(f.n_registros),
      f.ultimo_dado ? `${dataBR(f.ultimo_dado)} (${idade(f.idade_dias)})` : "sem dado",
      { v: obs.length ? h("ul", { classe: "obs" }, obs.map((o) => h("li", {}, o))) : "—", classe: "obs-celula" },
    ];
  });
  return [
    h("p", { classe: "lead" }, "De onde vêm os números, se cada fonte respondeu e quão velho é o último dado. Uma fonte essencial atrasada ou fora do ar deixa o dia como parcial; uma complementar só aparece aqui."),
    tabela({
      legenda: "Situação das fontes nesta foto",
      colunas: [{ t: "Fonte" }, { t: "Papel" }, { t: "Situação" }, { t: "Registros", num: true }, { t: "Último dado" }, { t: "Observações" }],
      linhas,
    }),
    ...(foto.conferencias?.length ? [h("h3", {}, "Conferências entre fontes"), h("ul", {}, foto.conferencias.map((c) => h("li", {}, c)))] : []),
    h("h3", {}, "Levar os números"),
    h(
      "div",
      { classe: "acoes" },
      h("button", { type: "button", classe: "botao", aoclick: () => baixaExcel(foto) }, `Baixar o Excel de ${dataBR(data)}`),
      h("a", { classe: "botao secundario", href: `${base}/${data}.json`, target: "_blank", rel: "noopener noreferrer" }, "Abrir a foto completa (JSON)"),
      h("a", { classe: "botao secundario", href: `${base}/${data}.csv`, target: "_blank", rel: "noopener noreferrer" }, "Abrir as observações (CSV)"),
    ),
    h("p", { classe: "nota" }, "O Excel tem uma aba por bloco desta página, com a data e a fonte de cada número, e uma aba com todas as observações da foto."),
  ];
}

// --------------------------------------------------------------------------------------------- cabeçalho do dia
function barraDoDia(foto, data) {
  const semProx = !estado.maisRecente || data >= estado.maisRecente;
  const complementares = modelo.problemas(foto).filter((f) => f.papel === "complementar");
  const essenciais = modelo.problemas(foto).filter((f) => f.papel === "essencial");
  const hoje = hojeEmBrasilia();
  const defasagem = diasEntre(data, hoje);
  const avisos = [];
  if (!semProx) {
    avisos.push(h("p", { classe: "faixa" }, `Você está vendo uma foto antiga. A mais recente é de ${dataBR(estado.maisRecente)}. `, h("button", { type: "button", classe: "link", aoclick: () => navega(estado.maisRecente) }, "Ver a mais recente")));
  } else if (defasagem > 4) {
    avisos.push(h("p", { classe: "faixa faixa-aviso", role: "status" }, `A foto mais recente é de ${dataBR(data)}, há ${defasagem} dias. O robô pode ter parado.`));
  }
  if (essenciais.length) avisos.push(h("p", { classe: "faixa faixa-aviso" }, `Fontes essenciais com problema: ${essenciais.map((f) => f.nome).join("; ")}.`));
  if (complementares.length) avisos.push(h("p", { classe: "faixa" }, `Fonte complementar sem dado nesta foto: ${complementares.map((f) => f.nome).join("; ")}.`));
  return [
    h(
      "div",
      { classe: "dia" },
      h("button", { type: "button", classe: "botao secundario", aoclick: () => vai(-1), id: "dia-anterior" }, "← Foto anterior"),
      h(
        "div",
        { classe: "dia-centro" },
        h("p", { classe: "dia-data" }, `${diaDaSemana(data)}, ${dataBR(data)}`),
        h("p", { classe: "dia-detalhe" }, `Coletada às ${horaBRT(foto.gerado_em)} (Brasília) · `, foto.status === "ok" ? selo("ok", "✓", "Dia completo") : selo("aviso", "◆", "Dia parcial")),
      ),
      h("button", { type: "button", classe: "botao secundario", aoclick: () => vai(+1), id: "dia-seguinte", disabled: semProx }, "Próxima foto →"),
    ),
    ...avisos,
  ];
}

// --------------------------------------------------------------------------------------------- orquestração
function mostraMensagem(texto, comTentar) {
  limpa($("barra-dia"));
  for (const id of ["resumo", "custo", "credito", "setor", "calculadora", "fontes"]) limpa($(`c-${id}`));
  limpa($("estado")).append(
    h("div", { classe: "erro", role: "alert" }, h("p", {}, texto), comTentar ? h("button", { type: "button", classe: "botao", aoclick: inicia }, "Tentar de novo") : null),
  );
}

function renderiza(foto, data) {
  estado.parar.splice(0).forEach((f) => f());
  limpa($("estado"));
  estado.foto = foto;
  estado.data = data;
  limpa($("barra-dia")).append(...barraDoDia(foto, data));
  const blocos = { resumo: blocoResumo, custo: blocoCusto, credito: blocoCredito, setor: blocoSetor, calculadora: blocoCalculadora };
  for (const [id, monta] of Object.entries(blocos)) limpa($(`c-${id}`)).append(...[monta(foto)].flat(Infinity).filter(Boolean));
  limpa($("c-fontes")).append(...blocoFontes(foto, data).flat(Infinity));
  estado.aposMontar.splice(0).forEach((desenha) => estado.parar.push(desenha()));
  const url = new URL(location.href);
  url.searchParams.set("data", data);
  history.replaceState(null, "", url);
  document.title = `Radar Pricing: ${dataBR(data)}`;
}

async function navega(data) {
  const foto = await buscaFoto(data, base);
  if (foto) renderiza(foto, data);
}

async function vai(sentido) {
  const botao = $(sentido < 0 ? "dia-anterior" : "dia-seguinte");
  if (botao) botao.disabled = true;
  try {
    const inicio = somaDias(estado.data, sentido);
    const limite = sentido < 0 ? DIAS_DE_BUSCA : Math.max(0, diasEntre(inicio, estado.maisRecente ?? inicio));
    const achada = await procuraFoto(inicio, sentido, limite, base);
    if (achada) renderiza(achada.foto, achada.data);
    else if (botao) botao.textContent = sentido < 0 ? "Sem foto mais antiga" : "Sem foto mais nova"; // fica desligado
  } catch (erro) {
    mostraMensagem(erro.message, true);
  }
}

async function inicia() {
  limpa($("estado")).append(h("p", { classe: "carregando", role: "status" }, "Baixando a foto do dia…"));
  try {
    const hoje = hojeEmBrasilia();
    const maisRecente = await procuraFoto(hoje, -1, DIAS_DE_BUSCA, base);
    if (!maisRecente) {
      mostraMensagem(`Não achei nenhuma foto nos últimos ${DIAS_DE_BUSCA + 1} dias. O robô pode ter parado ou o GitHub pode estar fora do ar.`, true);
      return;
    }
    estado.maisRecente = maisRecente.data;
    const pedida = new URLSearchParams(location.search).get("data");
    if (pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) && pedida !== maisRecente.data) {
      const foto = await buscaFoto(pedida, base);
      if (foto) return renderiza(foto, pedida);
    }
    renderiza(maisRecente.foto, maisRecente.data);
  } catch (erro) {
    mostraMensagem(erro.message, true);
  }
}

$("aviso-fixo")?.append(AVISO);
inicia();
