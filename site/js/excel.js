// O Excel das premissas do dia. Todas as abas seguem o mesmo padrão (ver folha.js): título, subtítulo com a data e o
// status, uma frase dizendo para que serve a aba, seções e tabelas iguais. As calculadoras são fórmulas de verdade,
// com o valor já calculado guardado: dá para mexer nas células amarelas e tudo se recalcula.

import { cotaAtiva, cotaCancelada, curvaDeSeteDiasAtras, EXEMPLOS, interpola, MAX_PARCELAS, retornoDaOferta, valorPresente } from "./calc.js";
import { COR, E, FORMATO, Folha } from "./folha.js";
import { dataBR, horaBRT, mesAno } from "./formato.js";
import * as modelo from "./modelo.js";
import { celulaData, letraDaColuna, montaXlsx } from "./xlsx.js";

export const AVISO =
  "Projeto independente, sem vínculo com empresa. Dados públicos. O spread e os valores dos exemplos são de DEMONSTRAÇÃO.";

export function nomeDoArquivo(foto) {
  return `radar-pricing-${foto.data}.xlsx`;
}

const NOME = {
  leia: "Leia-me",
  hoje: "Hoje",
  cancelada: "Cota cancelada",
  retorno: "Retorno da oferta",
  ativa: "Cota ativa",
  custo: "Custo do dinheiro",
  credito: "Crédito concorrente",
  setor: "Setor",
  mudancas: "Mudanças",
  fontes: "Fontes",
  observacoes: "Observações",
};
const SIM = "Sim";
const TRACO = "—";

const subtituloDa = (foto) =>
  `Foto de ${dataBR(foto.data)} · coletada às ${horaBRT(foto.gerado_em)} (Brasília) · ${foto.status === "ok" ? "dia completo" : "dia PARCIAL"}`;

// --------------------------------------------------------------------------------------------- fórmulas
/** Taxa por interpolação linear da curva (as mesmas contas de calc.js:interpola), como fórmula do Excel. */
function interpolacao(x, faixa) {
  const { x: X, y: Y } = faixa;
  const i = `MATCH(${x},${X},1)`;
  return (
    `IF(${x}<=INDEX(${X},1),INDEX(${Y},1),IF(${x}>=INDEX(${X},ROWS(${X})),INDEX(${Y},ROWS(${X})),` +
    `INDEX(${Y},${i})+(${x}-INDEX(${X},${i}))*(INDEX(${Y},${i}+1)-INDEX(${Y},${i}))/(INDEX(${X},${i}+1)-INDEX(${X},${i}))))`
  );
}

/** A curva certa conforme a célula "Corrigido pela inflação?" (Sim: IPCA+; Não: Prefixado). */
const tesouro = (corrigido, x, faixas) => `IF(${corrigido}="${SIM}",${interpolacao(x, faixas.real)},${interpolacao(x, faixas.nominal)})`;

const formula = (f, v, e) => ({ f, v, e });
const pontoDaCurva = (curva, anos) => interpola(curva.pontos, anos)[0];

// --------------------------------------------------------------------------------------------- Custo do dinheiro
function abaCusto(ctx) {
  const { foto } = ctx;
  const folha = new Folha(NOME.custo, { larguras: [26, 14, 16, 16, 14, 14, 14], corAba: COR.abaDados });
  folha.cabecalho({
    titulo: "Custo do dinheiro",
    subtitulo: subtituloDa(foto),
    paraQue: "As taxas que servem de base para descontar: as curvas do Tesouro Direto (a taxa sem risco de cada prazo), o que o mercado espera para a Selic e o IPCA, e os números do Banco Central. As calculadoras leem as curvas desta aba.",
  });
  const faixas = {};
  for (const c of modelo.curvas(foto)) {
    folha.secao(`Tesouro ${c.nome}: ${c.descricao}`);
    const t = folha.tabela({
      colunas: [
        { t: "Vencimento", tipo: "data", formato: FORMATO.data },
        { t: "Prazo (anos)", tipo: "numero", formato: FORMATO.num2 },
        { t: "Taxa hoje (% a.a.)", tipo: "numero", formato: FORMATO.taxa },
        { t: "Taxa há 7 dias (% a.a.)", tipo: "numero", formato: FORMATO.taxa },
        { t: "Mudou em 1 dia (p.p.)", tipo: "numero", formato: FORMATO.variacao },
        { t: "Mudou em 7 dias (p.p.)", tipo: "numero", formato: FORMATO.variacao },
        { t: "Mudou em 30 dias (p.p.)", tipo: "numero", formato: FORMATO.variacao },
      ],
      linhas: c.pontos.map((p) => [celulaData(p.vencimento), p.anos, p.taxa, p.ref7, p.d1, p.d7, p.d30]),
    });
    folha.nota(`Taxa de compra do Tesouro Direto em ${dataBR(c.base)}. As calculadoras interpolam entre os vencimentos desta tabela.`, 18);
    faixas[c.id] = { x: `'${NOME.custo}'!$C$${t.primeira}:$C$${t.ultima}`, y: `'${NOME.custo}'!$D$${t.primeira}:$D$${t.ultima}` };
    folha.espaco();
  }

  const f = modelo.focus(foto);
  folha.secao(`Focus: o que o mercado espera (mediana; edição de ${dataBR(f.data)})`);
  const anos = [...new Set([...f.selic, ...f.ipca].map((x) => x.ano))].sort();
  folha.tabela({
    colunas: [
      { t: "Ano (fim do ano)", tipo: "texto" },
      { t: "Selic esperada (% a.a.)", tipo: "numero", formato: FORMATO.taxa },
      { t: "Mudou em 7 dias (p.p.)", tipo: "numero", formato: FORMATO.variacao },
      { t: "IPCA esperado (% a.a.)", tipo: "numero", formato: FORMATO.taxa },
      { t: "Mudou em 7 dias (p.p.)", tipo: "numero", formato: FORMATO.variacao },
    ],
    linhas: anos.map((ano) => {
      const s = f.selic.find((x) => x.ano === ano);
      const i = f.ipca.find((x) => x.ano === ano);
      return [String(ano), s?.valor ?? null, s?.d7?.delta ?? null, i?.valor ?? null, i?.d7?.delta ?? null];
    }),
  });
  folha.espaco();
  if (f.reunioes.length) {
    folha.secao("Focus: Selic esperada ao fim de cada reunião do Copom");
    folha.tabela({
      colunas: [{ t: "Reunião", tipo: "texto" }, { t: "Selic esperada (% a.a.)", tipo: "numero", formato: FORMATO.taxa }],
      linhas: f.reunioes.map((r) => [r.reuniao, r.valor]),
    });
    folha.espaco();
  }

  folha.secao("Banco Central (SGS): Selic, CDI e IPCA");
  const diario = (s) => s.unidade === "% ao dia";
  folha.tabela({
    colunas: [
      { t: "Série", tipo: "texto" },
      { t: "Valor", tipo: "numero", formato: FORMATO.taxa },
      { t: "Unidade", tipo: "centro" },
      { t: "Data do dado", tipo: "data", formato: FORMATO.data },
      { t: "Mudou em 1 dia", tipo: "numero", formato: FORMATO.variacao },
      { t: "Mudou em 7 dias", tipo: "numero", formato: FORMATO.variacao },
      { t: "Mudou em 30 dias", tipo: "numero", formato: FORMATO.variacao },
    ],
    linhas: modelo.seriesDoBanco(foto).map((s) => {
      const fmt = diario(s) ? { e: { formato: FORMATO.num4 } } : {};
      const d = (x) => (x ? { v: x.delta, ...fmt } : null);
      return [s.rotulo, { v: s.valor, ...fmt }, s.unidade, celulaData(s.data), d(s.d1), d(s.d7), d(s.d30)];
    }),
  });
  folha.nota("Variações em pontos percentuais (p.p.), na unidade da série: a Selic over e o CDI diário são em % ao dia.", 18);
  return { folha, faixas };
}

// --------------------------------------------------------------------------------------------- Hoje
function abaHoje(ctx) {
  const { foto, par, curvas } = ctx;
  const folha = new Folha(NOME.hoje, { larguras: [42, 15, 15, 15, 17, 22, 22, 14] });
  folha.cabecalho({
    titulo: "Hoje: o que mudou e quanto isso mexe no preço",
    subtitulo: subtituloDa(foto),
    paraQue: "Qual taxa usar hoje para descontar um valor a receber e quanto isso mudou desde 7 dias atrás. As células amarelas são suas: mude o spread ou o valor de referência e todas as contas deste arquivo se recalculam.",
  });
  folha.secao("Suas premissas");
  const spread = folha.campo("Spread de risco (p.p.)", ctx.spread, { estilo: E.entrada, formato: FORMATO.taxa, nota: "De DEMONSTRAÇÃO: não é de nenhuma empresa. Somado à taxa do Tesouro para formar a taxa de desconto de todas as calculadoras." });
  const valorRef = folha.campo("Valor de referência a receber (R$)", ctx.valorRef, { estilo: E.entrada, formato: FORMATO.reais, nota: "Usado só nas tabelas abaixo." });
  folha.validacoes.push(
    { ref: spread.ref, min: 0, erro: "Digite um spread de zero ou mais (em pontos percentuais)." },
    { ref: valorRef.ref, min: 0.01, erro: "Digite um valor maior que zero." },
  );
  folha.espaco();

  const prazos = par.prazos_meses;
  for (const [id, titulo] of [["nominal", "Em R$ fixos (Tesouro Prefixado)"], ["real", "Corrigido pelo IPCA (Tesouro IPCA+)"]]) {
    const curva = curvas[id];
    if (!curva) continue;
    const antes = curvaDeSeteDiasAtras(curva);
    folha.secao(`${titulo}: quanto vale hoje o valor de referência a receber em cada prazo`);
    const r0 = folha.proxima + 1;
    folha.tabela({
      colunas: [
        { t: "Prazo (meses)", tipo: "centro", formato: FORMATO.inteiro },
        { t: "Taxa hoje (% a.a.)", tipo: "numero", formato: FORMATO.taxa },
        { t: "Taxa há 7 dias (% a.a.)", tipo: "numero", formato: FORMATO.taxa },
        { t: "Mudou (p.p.)", tipo: "numero", formato: FORMATO.variacao },
        { t: "Taxa de desconto com o spread (% a.a.)", tipo: "numero", formato: FORMATO.taxa },
        { t: "Valor presente hoje (R$)", tipo: "numero", formato: FORMATO.num2 },
        { t: "Valor presente há 7 dias (R$)", tipo: "numero", formato: FORMATO.num2 },
        { t: "Mudou (%)", tipo: "numero", formato: FORMATO.variacao },
      ],
      linhas: prazos.map((m, i) => {
        const r = r0 + i;
        const hoje = pontoDaCurva(curva, m / 12);
        const ant = antes ? pontoDaCurva(antes, m / 12) : null;
        const vpHoje = valorPresente(ctx.valorRef, hoje + ctx.spread, m);
        const vpAntes = ant === null ? null : valorPresente(ctx.valorRef, ant + ctx.spread, m);
        return [
          m,
          hoje,
          ant,
          ant === null ? null : formula(`C${r}-D${r}`, hoje - ant),
          formula(`C${r}+Spread`, hoje + ctx.spread),
          formula(`ValorRef/(1+(C${r}+Spread)/100)^(B${r}/12)`, vpHoje),
          ant === null ? null : formula(`ValorRef/(1+(D${r}+Spread)/100)^(B${r}/12)`, vpAntes),
          ant === null ? null : formula(`(G${r}/H${r}-1)*100`, (vpHoje / vpAntes - 1) * 100),
        ];
      }),
    });
    folha.nota(
      id === "real"
        ? "Corrigido pelo IPCA: o resultado fica em reais de hoje. Para prazos menores que o primeiro vencimento da curva IPCA+, a taxa desse vencimento é usada."
        : "Em R$ fixos: sem correção pela inflação. Valor presente = valor de referência ÷ (1 + taxa de desconto)^(prazo em anos).",
      18,
    );
    folha.espaco();
  }

  folha.secao("Para ter em mente");
  folha.tabela({
    colunas: [
      { t: "Indicador", tipo: "texto" },
      { t: "Valor", tipo: "numero", formato: FORMATO.num2 },
      { t: "Unidade", tipo: "centro" },
      { t: "Mudou em 7 dias (p.p.)", tipo: "numero", formato: FORMATO.variacao },
      { t: "Data do dado", tipo: "data", formato: FORMATO.data },
      { t: "Fonte", tipo: "texto" },
    ],
    linhas: modelo.manchetes(foto).map((m) => [m.rotulo, m.valor, m.unidade, m.delta7?.delta ?? null, celulaData(m.data), (m.fonte ?? "").replace("Banco Central", "BCB")]),
  });
  folha.espaco();

  const movs = modelo.movimentos(foto).slice(0, 8);
  folha.secao("O que mais mexeu nesta foto");
  if (movs.length === 0) folha.nota("Sem mudanças relevantes nesta foto.", 18);
  else {
    folha.tabela({
      colunas: [{ t: "O que mudou", tipo: "texto" }, { t: "Peso", tipo: "centro" }],
      linhas: movs.map((m) => [m.texto, modelo.SEVERIDADES[m.severidade] ?? m.severidade]),
    });
    folha.nota("A lista completa está na aba Mudanças.", 18);
  }
  return { folha, spread: spread.refAbsoluta, valorRef: valorRef.refAbsoluta };
}

// --------------------------------------------------------------------------------------------- calculadoras
const SIM_NAO = [SIM, "Não"];

function cabecalhoDeCalculadora(folha, foto, titulo, paraQue) {
  folha.cabecalho({ titulo, subtitulo: subtituloDa(foto), paraQue, alturaParaQue: 44 });
}

const exemploAviso = "Exemplo de DEMONSTRAÇÃO com valores inventados: troque pelos seus. Modelo simples, com dados digitados e as taxas públicas do dia; não é preço de verdade.";

function abaCotaCancelada(ctx, faixas) {
  const { foto, curvas } = ctx;
  const ex = EXEMPLOS.cancelada;
  const folha = new Folha(NOME.cancelada, { larguras: [40, 20, 20, 20, 20, 20] });
  cabecalhoDeCalculadora(
    folha,
    foto,
    "Cota cancelada: quanto vale hoje o valor a devolver",
    "Quando alguém cancela a cota, a administradora devolve o que foi pago só no fim do grupo. Aqui você vê quanto esse valor vale hoje, descontando pela taxa do Tesouro do dia mais o spread de risco.",
  );
  folha.secao("1. Digite");
  const valor = folha.campo("Valor a receber (R$)", ex.valor, { estilo: E.entrada, formato: FORMATO.reais, nota: "O que a administradora vai devolver" });
  const meses = folha.campo("Meses até receber", ex.meses, { estilo: E.entrada, formato: FORMATO.inteiro, nota: "Prazo até o fim do grupo" });
  const corrigido = folha.campo("Corrigido pela inflação?", ex.corrigido ? SIM : "Não", { estilo: { ...E.entrada, h: "center" }, nota: "Sim: desconta pela curva IPCA+ e o resultado fica em reais de hoje. Não: curva Prefixada." });
  const spread = folha.campo("Spread de risco (p.p.)", formula("Spread", ctx.spread), { formato: FORMATO.taxa, nota: "Vem da aba Hoje" });
  folha.validacoes.push(
    { ref: valor.ref, min: 0.01, erro: "Digite um valor maior que zero." },
    { ref: meses.ref, inteiro: true, min: 1, max: 600, erro: "Digite de 1 a 600 meses." },
    { ref: corrigido.ref, lista: SIM_NAO, erro: "Escolha Sim ou Não." },
  );
  folha.espaco();

  const r = cotaCancelada({ valor: ex.valor, meses: ex.meses, corrigido: ex.corrigido, spreadPP: ctx.spread }, { nominal: curvas.nominal, real: curvas.real });
  folha.secao("2. Resultado");
  const ancora = folha.campo("Taxa do Tesouro no prazo (% a.a.)", formula(tesouro(corrigido.refAbsoluta, `${meses.refAbsoluta}/12`, faixas), r.taxa_ancora), { formato: FORMATO.taxa, nota: "Interpolada entre os vencimentos da aba Custo do dinheiro" });
  const desconto = folha.campo("Taxa de desconto (% a.a.)", formula(`${ancora.refAbsoluta}+${spread.refAbsoluta}`, r.taxa_desconto), { formato: FORMATO.taxa, nota: "Tesouro + spread" });
  const vp = folha.campo("Valor presente (R$)", formula(`${valor.refAbsoluta}/(1+${desconto.refAbsoluta}/100)^(${meses.refAbsoluta}/12)`, r.valor_presente), { estilo: E.resultado, formato: FORMATO.reais, nota: "O que o valor a receber vale hoje" });
  const pct = folha.campo("Em % do valor a receber", formula(`${vp.refAbsoluta}/${valor.refAbsoluta}*100`, r.pct_do_valor), { estilo: E.resultado, formato: FORMATO.taxa });
  folha.campo("Desconto sobre o valor (%)", formula(`100-${pct.refAbsoluta}`, 100 - r.pct_do_valor), { formato: FORMATO.taxa, nota: "O deságio: quanto fica de fora do valor a receber" });
  folha.espaco();

  folha.secao("3. E se o prazo mudar?");
  const r0 = folha.proxima + 1;
  folha.tabela({
    colunas: [
      { t: "Prazo (meses)", tipo: "centro", formato: FORMATO.inteiro },
      { t: "Taxa do Tesouro (% a.a.)", tipo: "numero", formato: FORMATO.taxa },
      { t: "Taxa de desconto (% a.a.)", tipo: "numero", formato: FORMATO.taxa },
      { t: "Valor presente (R$)", tipo: "numero", formato: FORMATO.num2 },
      { t: "Em % do valor", tipo: "numero", formato: FORMATO.taxa },
    ],
    linhas: [-12, -6, 0, 6, 12].map((d, i) => {
      const row = r0 + i;
      const m = ex.meses + d;
      const ok = m >= 1;
      const um = ok ? cotaCancelada({ valor: ex.valor, meses: m, corrigido: ex.corrigido, spreadPP: ctx.spread }, curvas) : null;
      return [
        formula(`${meses.refAbsoluta}+(${d})`, m),
        formula(`IF(B${row}<1,"${TRACO}",${tesouro(corrigido.refAbsoluta, `B${row}/12`, faixas)})`, ok ? um.taxa_ancora : TRACO),
        formula(`IF(B${row}<1,"${TRACO}",C${row}+${spread.refAbsoluta})`, ok ? um.taxa_desconto : TRACO),
        formula(`IF(B${row}<1,"${TRACO}",${valor.refAbsoluta}/(1+D${row}/100)^(B${row}/12))`, ok ? um.valor_presente : TRACO),
        formula(`IF(B${row}<1,"${TRACO}",E${row}/${valor.refAbsoluta}*100)`, ok ? um.pct_do_valor : TRACO),
      ];
    }),
  });
  folha.espaco();

  folha.secao("4. E se o spread mudar?");
  const s0 = folha.proxima + 1;
  folha.tabela({
    colunas: [
      { t: "Spread (p.p.)", tipo: "centro", formato: FORMATO.taxa },
      { t: "Taxa de desconto (% a.a.)", tipo: "numero", formato: FORMATO.taxa },
      { t: "Valor presente (R$)", tipo: "numero", formato: FORMATO.num2 },
      { t: "Em % do valor", tipo: "numero", formato: FORMATO.taxa },
    ],
    linhas: [-1, 0, 1].map((d, i) => {
      const row = s0 + i;
      const s = ctx.spread + d;
      const ok = s >= 0;
      const um = ok ? cotaCancelada({ valor: ex.valor, meses: ex.meses, corrigido: ex.corrigido, spreadPP: s }, curvas) : null;
      return [
        formula(`${spread.refAbsoluta}+(${d})`, s),
        formula(`IF(B${row}<0,"${TRACO}",${ancora.refAbsoluta}+B${row})`, ok ? um.taxa_desconto : TRACO),
        formula(`IF(B${row}<0,"${TRACO}",${valor.refAbsoluta}/(1+C${row}/100)^(${meses.refAbsoluta}/12))`, ok ? um.valor_presente : TRACO),
        formula(`IF(B${row}<0,"${TRACO}",D${row}/${valor.refAbsoluta}*100)`, ok ? um.pct_do_valor : TRACO),
      ];
    }),
  });
  folha.espaco();
  folha.nota(exemploAviso, 30);
  folha.nota("Como ler: quanto mais tempo até receber, e quanto maior o spread, menor o valor presente. O deságio é a parte do valor que fica de fora.", 30);
  return { folha };
}

function abaRetorno(ctx, faixas) {
  const { foto, curvas } = ctx;
  const ex = EXEMPLOS.retorno;
  const cdi = foto.derivados.ancoras.cdi_anualizado?.taxa ?? null;
  const folha = new Folha(NOME.retorno, { larguras: [40, 20, 20, 20, 20, 20] });
  cabecalhoDeCalculadora(
    folha,
    foto,
    "Retorno de uma oferta: quanto rende e quanto posso pagar",
    "Se eu pagar um preço para receber um valor mais tarde, quanto isso rende ao ano, comparado com o Tesouro e o CDI? E qual o preço máximo para um retorno que eu escolher?",
  );
  folha.secao("1. Digite");
  const preco = folha.campo("Preço que vou pagar (R$)", ex.preco, { estilo: E.entrada, formato: FORMATO.reais });
  const valor = folha.campo("Valor que vou receber (R$)", ex.valor, { estilo: E.entrada, formato: FORMATO.reais });
  const meses = folha.campo("Meses até receber", ex.meses, { estilo: E.entrada, formato: FORMATO.inteiro });
  const corrigido = folha.campo("Corrigido pela inflação?", ex.corrigido ? SIM : "Não", { estilo: { ...E.entrada, h: "center" }, nota: "Sim: o retorno é acima da inflação e se compara com o IPCA+. Não: compara com o Prefixado e o CDI." });
  const alvo = folha.campo("Retorno-alvo (% a.a.), se quiser", null, { estilo: E.entrada, formato: FORMATO.taxa, nota: "Deixe em branco para usar a taxa do Tesouro no prazo + o spread" });
  const spread = folha.campo("Spread de risco (p.p.)", formula("Spread", ctx.spread), { formato: FORMATO.taxa, nota: "Vem da aba Hoje" });
  folha.validacoes.push(
    { ref: preco.ref, min: 0.01, erro: "Digite um preço maior que zero." },
    { ref: valor.ref, min: 0.01, erro: "Digite um valor maior que zero." },
    { ref: meses.ref, inteiro: true, min: 1, max: 600, erro: "Digite de 1 a 600 meses." },
    { ref: corrigido.ref, lista: SIM_NAO, erro: "Escolha Sim ou Não." },
    { ref: alvo.ref, min: -50, max: 200, vazioOk: true, erro: "Digite um retorno em % ao ano, ou deixe em branco." },
  );
  folha.espaco();

  const r = retornoDaOferta({ preco: ex.preco, valor: ex.valor, meses: ex.meses, corrigido: ex.corrigido, spreadPP: ctx.spread }, curvas, cdi);
  const m = meses.refAbsoluta;
  folha.secao("2. Resultado");
  const retorno = folha.campo("Retorno ao ano (% a.a.)", formula(`((${valor.refAbsoluta}/${preco.refAbsoluta})^(12/${m})-1)*100`, r.retorno_aa), { estilo: E.resultado, formato: FORMATO.taxa, nota: "O que a oferta rende por ano, em juros compostos" });
  folha.campo("Retorno no prazo todo (%)", formula(`(${valor.refAbsoluta}/${preco.refAbsoluta}-1)*100`, r.retorno_total), { formato: FORMATO.taxa });
  const ancora = folha.campo("Taxa do Tesouro no prazo (% a.a.)", formula(tesouro(corrigido.refAbsoluta, `${m}/12`, faixas), r.taxa_ancora), { formato: FORMATO.taxa, nota: "IPCA+ se corrigido, Prefixado se não" });
  folha.campo("Diferença para o Tesouro (p.p.)", formula(`${retorno.refAbsoluta}-${ancora.refAbsoluta}`, r.retorno_aa - r.taxa_ancora), { formato: FORMATO.variacao });
  const cdiCampo = folha.campo("CDI de hoje, anualizado (% a.a.)", cdi, { formato: FORMATO.taxa, nota: "Só se compara quando não é corrigido pela inflação" });
  folha.campo("Diferença para o CDI (p.p.)", formula(`IF(${corrigido.refAbsoluta}="${SIM}","${TRACO}",${retorno.refAbsoluta}-${cdiCampo.refAbsoluta})`, ex.corrigido ? TRACO : r.retorno_aa - cdi), { formato: FORMATO.variacao });
  folha.espaco();

  folha.secao("3. Preço máximo para o retorno-alvo");
  const alvoUsado = folha.campo("Retorno-alvo usado (% a.a.)", formula(`IF(ISNUMBER(${alvo.refAbsoluta}),${alvo.refAbsoluta},${ancora.refAbsoluta}+${spread.refAbsoluta})`, r.alvo), { formato: FORMATO.taxa });
  const maximo = folha.campo("Preço máximo (R$)", formula(`${valor.refAbsoluta}/(1+${alvoUsado.refAbsoluta}/100)^(${m}/12)`, r.preco_maximo), { estilo: E.resultado, formato: FORMATO.reais, nota: "Pagando até aqui, o retorno é pelo menos o alvo" });
  const folga = folha.campo("Folga (R$)", formula(`${maximo.refAbsoluta}-${preco.refAbsoluta}`, r.folga), { formato: '"R$" #,##0.00;-"R$" #,##0.00', nota: "Positiva: o preço está abaixo do máximo" });
  folha.campo(
    "Leitura",
    formula(
      `IF(${folga.refAbsoluta}>=0,"Preço dentro do máximo para o alvo.","Preço acima do máximo: o retorno fica abaixo do alvo.")`,
      r.folga >= 0 ? "Preço dentro do máximo para o alvo." : "Preço acima do máximo: o retorno fica abaixo do alvo.",
    ),
    { estilo: { ...E.calculado, h: "left" } },
  );
  folha.espaco();
  folha.nota(exemploAviso, 30);
  folha.nota("Como ler: o retorno ao ano é (valor ÷ preço)^(12 ÷ meses) − 1. Ele só diz se a oferta paga mais ou menos que as alternativas; não mede o risco de a administradora atrasar.", 30);
  return { folha };
}

const CONTEMPLACOES = [0, 6, 12, 24, 36, 48, 60, 84, 120, 180];
const NOME_CALCULO = "Cota ativa (cálculo)";

function abaCotaAtiva(ctx, faixas) {
  const { foto, curvas } = ctx;
  const ex = EXEMPLOS.ativa;
  const folha = new Folha(NOME.ativa, { larguras: [40, 20, 20, 20, 20, 24] });
  cabecalhoDeCalculadora(
    folha,
    foto,
    "Cota ativa: crédito que recebo menos parcelas que pago",
    "O comprador de uma cota ativa recebe o crédito quando for contemplada e continua pagando as parcelas que faltam. O valor da cota é o crédito descontado menos as parcelas descontadas, em reais de hoje.",
  );
  folha.secao("1. Digite");
  const credito = folha.campo("Valor do crédito (R$)", ex.credito, { estilo: E.entrada, formato: FORMATO.reais, nota: "A carta de crédito, em reais de hoje" });
  const parcela = folha.campo("Parcela mensal (R$)", ex.parcela, { estilo: E.entrada, formato: FORMATO.reais, nota: "Em reais de hoje" });
  const parcelas = folha.campo("Parcelas que faltam", ex.parcelas, { estilo: E.entrada, formato: FORMATO.inteiro, nota: `De 1 a ${MAX_PARCELAS}` });
  const contemplacao = folha.campo("Contemplação daqui a (meses)", ex.contemplacao, { estilo: E.entrada, formato: FORMATO.inteiro, nota: "0 = já contemplada; não pode passar do número de parcelas" });
  const spread = folha.campo("Spread de risco (p.p.)", formula("Spread", ctx.spread), { formato: FORMATO.taxa, nota: "Vem da aba Hoje" });
  folha.validacoes.push(
    { ref: credito.ref, min: 0.01, erro: "Digite um valor maior que zero." },
    { ref: parcela.ref, min: 0.01, erro: "Digite um valor maior que zero." },
    { ref: parcelas.ref, inteiro: true, min: 1, max: MAX_PARCELAS, erro: `Digite de 1 a ${MAX_PARCELAS} parcelas.` },
    { ref: contemplacao.ref, inteiro: true, min: 0, max: MAX_PARCELAS, erro: `Digite de 0 a ${MAX_PARCELAS} meses.` },
  );
  folha.campo(
    "Conferência",
    formula(`IF(${contemplacao.refAbsoluta}>${parcelas.refAbsoluta},"Atenção: a contemplação é depois da última parcela.","Dados coerentes.")`, "Dados coerentes."),
    { estilo: { ...E.calculado, h: "left" } },
  );
  folha.espaco();

  // O cálculo mês a mês fica em outra aba, montada já agora: as entradas desta aba têm posição conhecida.
  const doDigitado = (c) => `'${NOME.ativa}'!${c.refAbsoluta}`;
  const calculo = new Folha(NOME_CALCULO, { larguras: [10, 14, 24, 24, 16, 24], corAba: COR.abaBruta });
  calculo.cabecalho({
    titulo: "Cota ativa: cálculo mês a mês",
    subtitulo: subtituloDa(foto),
    paraQue: `Alimenta o resultado da aba Cota ativa: uma linha por parcela, até ${MAX_PARCELAS}. Não precisa mexer.`,
    alturaParaQue: 20,
  });
  const c0 = calculo.proxima + 1;
  const linhas = [];
  for (let t = 1; t <= MAX_PARCELAS; t++) {
    const row = c0 + t - 1;
    const anos = t / 12;
    const taxa = pontoDaCurva(curvas.real, anos);
    const desc = taxa + ctx.spread;
    const parc = t <= ex.parcelas ? ex.parcela : 0;
    linhas.push([
      t,
      formula(`B${row}/12`, anos),
      formula(interpolacao(`C${row}`, faixas.real), taxa),
      formula(`D${row}+Spread`, desc),
      formula(`IF(B${row}<=${doDigitado(parcelas)},${doDigitado(parcela)},0)`, parc),
      formula(`F${row}/(1+E${row}/100)^C${row}`, parc / (1 + desc / 100) ** anos),
    ]);
  }
  const tabelaCalculo = calculo.tabela({
    colunas: [
      { t: "Mês", tipo: "centro", formato: FORMATO.inteiro },
      { t: "Prazo (anos)", tipo: "numero", formato: FORMATO.num4 },
      { t: "Taxa do Tesouro IPCA+ (% a.a.)", tipo: "numero", formato: FORMATO.taxa },
      { t: "Taxa de desconto (% a.a.)", tipo: "numero", formato: FORMATO.taxa },
      { t: "Parcela (R$)", tipo: "numero", formato: FORMATO.num2 },
      { t: "Valor presente da parcela (R$)", tipo: "numero", formato: FORMATO.num2 },
    ],
    linhas,
  });
  calculo.congelar = { linhas: tabelaCalculo.cab };
  const colunaVP = `'${NOME_CALCULO}'!$G$${tabelaCalculo.primeira}:$G$${tabelaCalculo.ultima}`;

  const r = cotaAtiva({ ...ex, spreadPP: ctx.spread }, curvas.real);
  folha.secao("2. Resultado");
  const vpCredito = `IF(${contemplacao.refAbsoluta}=0,${credito.refAbsoluta},${credito.refAbsoluta}/(1+(${interpolacao(`${contemplacao.refAbsoluta}/12`, faixas.real)}+${spread.refAbsoluta})/100)^(${contemplacao.refAbsoluta}/12))`;
  const cCredito = folha.campo("Valor presente do crédito (R$)", formula(vpCredito, r.vp_credito), { formato: FORMATO.reais, nota: "O crédito descontado até o mês da contemplação" });
  const cParcelas = folha.campo("Valor presente das parcelas (R$)", formula(`SUM(${colunaVP})`, r.vp_parcelas), { formato: FORMATO.reais, nota: "Todas as parcelas que faltam, descontadas" });
  const cValor = folha.campo("Valor da cota hoje (R$)", formula(`${cCredito.refAbsoluta}-${cParcelas.refAbsoluta}`, r.valor_da_cota), { estilo: E.resultado, formato: '"R$" #,##0.00;-"R$" #,##0.00', nota: "Negativo: nesse cenário as parcelas pesam mais que o crédito" });
  folha.campo("Em % do crédito", formula(`${cValor.refAbsoluta}/${credito.refAbsoluta}*100`, r.pct_do_credito), { estilo: E.resultado, formato: FORMATO.taxa });
  folha.campo("Total das parcelas, sem descontar (R$)", formula(`${parcela.refAbsoluta}*${parcelas.refAbsoluta}`, r.total_das_parcelas), { formato: FORMATO.reais });
  folha.espaco();

  folha.secao("3. E se a contemplação for em outro mês?");
  const t0 = folha.proxima + 1;
  folha.tabela({
    colunas: [
      { t: "Contemplação em (meses)", tipo: "centro", formato: FORMATO.inteiro },
      { t: "Valor presente do crédito (R$)", tipo: "numero", formato: FORMATO.num2 },
      { t: "Valor da cota hoje (R$)", tipo: "numero", formato: "#,##0.00;-#,##0.00" },
      { t: "Em % do crédito", tipo: "numero", formato: FORMATO.taxa },
    ],
    linhas: [null, ...CONTEMPLACOES].map((fixo, i) => {
      const row = t0 + i;
      const mes = i === 0 ? ex.contemplacao : fixo;
      const dentro = mes <= ex.parcelas;
      const cen = dentro ? cotaAtiva({ ...ex, contemplacao: mes, spreadPP: ctx.spread }, curvas.real) : null;
      return [
        i === 0 ? formula(contemplacao.refAbsoluta, mes) : mes,
        formula(
          `IF(B${row}>${parcelas.refAbsoluta},"${TRACO}",IF(B${row}=0,${credito.refAbsoluta},${credito.refAbsoluta}/(1+(${interpolacao(`B${row}/12`, faixas.real)}+${spread.refAbsoluta})/100)^(B${row}/12)))`,
          dentro ? cen.vp_credito : TRACO,
        ),
        formula(`IF(ISNUMBER(C${row}),C${row}-${cParcelas.refAbsoluta},"${TRACO}")`, dentro ? cen.valor_da_cota : TRACO),
        formula(`IF(ISNUMBER(D${row}),D${row}/${credito.refAbsoluta}*100,"${TRACO}")`, dentro ? cen.pct_do_credito : TRACO),
      ];
    }),
  });
  folha.nota("A primeira linha é o mês que você digitou; as outras são cenários fixos. Mês depois da última parcela aparece como —.", 18);
  folha.espaco();
  folha.nota(exemploAviso, 30);
  folha.nota(
    "Como ler: supõe que o crédito e a parcela são corrigidos pelo mesmo índice, então tudo é descontado pela curva IPCA+ (mais o spread) e fica em reais de hoje. Não considera a chance de ser contemplada, lance, seguro nem as regras de cada grupo. Para prazos menores que o 1º vencimento da curva IPCA+, usa a taxa desse vencimento.",
    44,
  );
  return { folha, calculo };
}

// --------------------------------------------------------------------------------------------- mercado
function abaCredito(ctx) {
  const { foto } = ctx;
  const folha = new Folha(NOME.credito, { larguras: [44, 16, 38], corAba: COR.abaDados });
  folha.cabecalho({
    titulo: "Crédito concorrente",
    subtitulo: subtituloDa(foto),
    paraQue: "O que os bancos cobram para financiar um imóvel ou um veículo: o crédito que concorre com o consórcio. Mostra a faixa de taxas e a lista de bancos (Banco Central).",
  });
  const { imobiliario, veiculos } = modelo.creditos(foto);
  for (const [titulo, bloco, mensal] of [["Financiamento imobiliário", imobiliario, true], ["Financiamento de veículos", veiculos, false]]) {
    if (!bloco) continue;
    const r = bloco.resumo;
    folha.secao(`${titulo}: ${bloco.n} bancos, dado de ${mensal ? mesAno(bloco.data) : dataBR(bloco.data)}`);
    folha.tabela({
      colunas: [{ t: "Medida", tipo: "texto" }, { t: "Taxa (% a.a.)", tipo: "numero", formato: FORMATO.taxa }, { t: "Banco", tipo: "texto" }],
      linhas: [
        ["Menor taxa", r.menor, bloco.bancos[0].banco],
        ["1º quartil", r.p25, null],
        ["Mediana", r.mediana, null],
        ["3º quartil", r.p75, null],
        ["Maior taxa", r.maior, bloco.bancos.at(-1).banco],
      ],
    });
    folha.nota("Quartis por interpolação linear entre os bancos (PERCENTIL.INC do Excel).", 16);
    folha.espaco(6);
    folha.tabela({
      colunas: [{ t: "Banco", tipo: "texto" }, { t: "Taxa (% a.a.)", tipo: "numero", formato: FORMATO.taxa }, { t: "Data do dado", tipo: "centro", formato: FORMATO.data }],
      linhas: bloco.bancos.map((b) => [b.banco, b.taxa, celulaData(bloco.data)]),
    });
    folha.espaco();
  }
  return { folha };
}

function abaSetor(ctx) {
  const { foto } = ctx;
  const folha = new Folha(NOME.setor, { larguras: [34, 58, 12, 14, 14, 14, 14], corAba: COR.abaDados });
  folha.cabecalho({
    titulo: "Setor de consórcio",
    subtitulo: subtituloDa(foto),
    paraQue: "Como está o mercado de consórcio: o boletim mensal da ABAC e as métricas trimestrais do Panorama de Consórcios do Banco Central. Mudam devagar. A tabela do Panorama tem filtro.",
  });
  const colunas = [
    { t: "Grupo", tipo: "texto" },
    { t: "Indicador", tipo: "texto" },
    { t: "Unidade", tipo: "centro" },
    { t: "Valor", tipo: "numero", formato: FORMATO.num2 },
    { t: "Data", tipo: "data", formato: FORMATO.data },
    { t: "Valor anterior", tipo: "numero", formato: FORMATO.num2 },
    { t: "Variação", tipo: "numero", formato: FORMATO.variacao },
  ];
  const abac = modelo.abac(foto);
  folha.secao("ABAC: boletim mensal do sistema de consórcios");
  if (abac.length === 0) folha.nota("A ABAC está sem dado nesta foto (fonte complementar).", 18);
  else {
    folha.tabela({
      colunas,
      linhas: abac.map((a) => ["ABAC (mensal)", a.rotulo, a.unidade, a.ultimo.valor, celulaData(a.ultimo.data), a.anterior?.valor ?? null, a.delta]),
    });
  }
  folha.espaco();
  const pan = modelo.panorama(foto);
  folha.secao(`Banco Central, Panorama de Consórcios: ${dataBR(pan.data)} contra ${dataBR(pan.dataAnterior)}`);
  const t = folha.tabela({
    colunas,
    linhas: pan.grupos.flatMap((g) => g.linhas.map((l) => [g.grupo, { v: l.descricao, e: { quebra: true } }, l.unidade, l.valor, celulaData(l.data), l.anterior, l.delta])),
  });
  folha.filtro = `B${t.cab}:H${t.ultima}`;
  return { folha };
}

function abaMudancas(ctx) {
  const { foto } = ctx;
  const folha = new Folha(NOME.mudancas, { larguras: [16, 100, 18], corAba: COR.abaDados });
  folha.cabecalho({
    titulo: "Mudanças do dia",
    subtitulo: subtituloDa(foto),
    paraQue: "Tudo que o robô marcou como mudança nesta foto, do mais para o menos importante. Os limites ficam no arquivo de configuração do robô; a aba Hoje resume as maiores.",
    alturaParaQue: 30,
  });
  const lista = [...modelo.mudancas(foto)].sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0));
  if (lista.length === 0) folha.nota("Sem mudanças relevantes nesta foto.", 18);
  else {
    folha.tabela({
      colunas: [{ t: "Peso", tipo: "centro" }, { t: "O que mudou", tipo: "texto" }, { t: "Variação (p.p.)", tipo: "numero", formato: FORMATO.variacao }],
      linhas: lista.map((m) => [modelo.SEVERIDADES[m.severidade] ?? m.severidade, modelo.textoDaMudanca(m), m.delta ?? null]),
    });
  }
  return { folha };
}

function abaFontes(ctx) {
  const { foto } = ctx;
  const folha = new Folha(NOME.fontes, { larguras: [50, 15, 13, 12, 16, 12, 12, 60], corAba: COR.abaBruta });
  folha.cabecalho({
    titulo: "Fontes e frescor dos dados",
    subtitulo: subtituloDa(foto),
    paraQue: "De onde vêm os números, se cada fonte respondeu e quão velho é o último dado. Fonte essencial atrasada ou fora do ar deixa o dia como parcial; a complementar só aparece aqui.",
    alturaParaQue: 30,
  });
  const situacao = { ok: "OK", atrasado: "Atrasado", parcial: "Parcial", falhou: "Falhou" };
  folha.tabela({
    colunas: [
      { t: "Fonte", tipo: "texto" },
      { t: "Papel", tipo: "centro" },
      { t: "Situação", tipo: "centro" },
      { t: "Registros", tipo: "numero", formato: FORMATO.inteiro },
      { t: "Último dado", tipo: "data", formato: FORMATO.data },
      { t: "Idade (dias)", tipo: "numero", formato: FORMATO.inteiro },
      { t: "Tempo (s)", tipo: "numero", formato: FORMATO.num2 },
      { t: "Observações", tipo: "texto" },
    ],
    quebra: true,
    linhas: modelo.fontes(foto).map((f) => {
      const obs = f.observacoes.join(" | ");
      return [f.nome, f.papel === "essencial" ? "Essencial" : "Complementar", situacao[f.situacao] ?? f.situacao, f.n_registros, celulaData(f.ultimo_dado), f.idade_dias ?? null, f.tempo_s, obs.length > 220 ? `${obs.slice(0, 217)}...` : obs];
    }),
  });
  return { folha };
}

function abaObservacoes(ctx) {
  const { foto } = ctx;
  const folha = new Folha(NOME.observacoes, { larguras: [14, 38, 50, 14, 14, 14, 90], corAba: COR.abaBruta });
  folha.cabecalho({
    titulo: "Observações: os dados brutos da foto",
    subtitulo: subtituloDa(foto),
    paraQue: "Uma linha por número que o robô coletou, com a fonte, a série e a data. É a base de todas as outras abas. Use o filtro dos cabeçalhos para achar o que precisa.",
    alturaParaQue: 30,
  });
  const t = folha.tabela({
    colunas: [
      { t: "Fonte", tipo: "texto" },
      { t: "Série", tipo: "texto" },
      { t: "Dimensão", tipo: "texto" },
      { t: "Data", tipo: "data", formato: FORMATO.data },
      { t: "Valor", tipo: "numero", formato: FORMATO.num4 },
      { t: "Unidade", tipo: "centro" },
      { t: "Descrição", tipo: "texto" },
    ],
    linhas: foto.registros.map((r) => [r.fonte, r.serie, r.dimensao || "", celulaData(r.data_ref), r.valor, r.unidade, r.descricao]),
  });
  folha.filtro = `B${t.cab}:H${t.ultima}`;
  folha.congelar = { linhas: t.cab };
  return { folha };
}

// --------------------------------------------------------------------------------------------- Leia-me
function abaLeiaMe(ctx, abas) {
  const { foto } = ctx;
  const folha = new Folha(NOME.leia, { larguras: [26, 66, 54] });
  folha.cabecalho({
    titulo: "Radar Pricing: premissas públicas de mercado",
    subtitulo: subtituloDa(foto),
    paraQue:
      "Para quem precifica cotas de consórcio. Responde, todo dia útil, três perguntas: qual taxa uso hoje para descontar; o que mudou desde a semana passada e quanto isso mexe no preço; quanto vale ou rende esta cota. Tudo vem de fontes públicas (Banco Central, Tesouro Nacional, ABAC). O spread e os exemplos são de DEMONSTRAÇÃO.",
    alturaParaQue: 58,
  });
  folha.secao("O que tem em cada aba");
  const t = folha.tabela({
    colunas: [{ t: "Aba", tipo: "texto" }, { t: "O que mostra", tipo: "texto" }, { t: "Quando usar", tipo: "texto" }],
    quebra: true,
    linhas: abas.map((a) => [{ v: a.nome, e: { fonte: { u: true, cor: "0563C1" } } }, a.oQue, a.quando]),
  });
  abas.forEach((a, i) => folha.link(t.primeira + i, 2, `'${a.nome}'!A1`, a.nome));
  folha.espaco();

  folha.secao("Como ler");
  const legenda = (estilo, texto, explicacao) => folha.linha([{ v: texto, e: { ...estilo, h: "center", quebra: false } }, { v: explicacao, e: { ...E.rotulo, quebra: true } }], 22);
  legenda(E.entrada, "Amarelo", "Células amarelas são suas: digite ou troque o valor e as contas se recalculam.");
  legenda(E.resultado, "Azul-claro", "Células azul-claras são o resultado das calculadoras.");
  legenda({ fundo: COR.marinho, fonte: { n: true, cor: COR.branco } }, "Azul-marinho", "Cabeçalhos das tabelas. Cinza claro alterna as linhas.");
  folha.espaco();
  folha.secao("Convenções");
  for (const [rotulo, texto] of [
    ["Taxas", "Em % ao ano, efetivas, com juros compostos. Um mês vale 1/12 de ano."],
    ["p.p.", "Pontos percentuais: a diferença entre duas taxas (de 13,00% para 13,25% são +0,25 p.p.)."],
    ["Mudou em 7 dias", "Compara com o mesmo número 7 dias antes, que a própria fonte informa."],
    ["Valor presente", "Quanto um valor a receber no futuro vale hoje: valor ÷ (1 + taxa de desconto)^(prazo em anos)."],
    ["Taxa de desconto", "A taxa do Tesouro para o prazo mais o spread de risco (que você pode trocar na aba Hoje)."],
  ]) folha.linha([{ v: rotulo, e: { ...E.rotulo, fonte: { n: true } } }, { v: texto, e: { ...E.rotulo, quebra: true } }], 22);
  folha.espaco();
  folha.secao("Limites e avisos");
  folha.paragrafo(AVISO, E.paraQue, 30);
  folha.paragrafo(
    "As calculadoras são modelos simples, só com o que você digita e as taxas públicas do dia. Não consideram a chance de contemplação, lance, seguro, taxas do grupo nem a regra de cada administradora, e não são preço de verdade.",
    E.paraQue,
    44,
  );
  folha.paragrafo("Este arquivo foi gerado pelo painel a partir da foto do dia guardada na branch data do repositório. As fotos já publicadas nunca são reescritas.", E.paraQue, 30);
  return { folha };
}

// --------------------------------------------------------------------------------------------- o arquivo
/** Os bytes do .xlsx de uma foto. */
export function excelDaFoto(foto) {
  const par = foto.derivados.parametros;
  const lista = modelo.curvas(foto);
  const curvas = { nominal: lista.find((c) => c.id === "nominal") ?? null, real: lista.find((c) => c.id === "real") ?? null };
  const ctx = { foto, par, curvas, spread: par.spread_demonstracao_pp, valorRef: par.valor_face };
  const custo = abaCusto(ctx);
  const hoje = abaHoje(ctx);
  const calculadoras =
    curvas.nominal && curvas.real
      ? { cancelada: abaCotaCancelada(ctx, custo.faixas), retorno: abaRetorno(ctx, custo.faixas), ativa: abaCotaAtiva(ctx, custo.faixas) }
      : null;
  const credito = abaCredito(ctx);
  const setor = abaSetor(ctx);
  const mudancas = abaMudancas(ctx);
  const fontes = abaFontes(ctx);
  const observacoes = abaObservacoes(ctx);

  const indice = [
    { folha: hoje.folha, oQue: "A taxa de hoje por prazo, o que mudou em 7 dias e quanto isso mexe no valor presente. Aqui fica o spread de risco.", quando: "Toda manhã, primeiro." },
    ...(calculadoras
      ? [
          { folha: calculadoras.cancelada.folha, oQue: "Quanto vale hoje o valor que a administradora vai devolver de uma cota cancelada.", quando: "Para precificar uma cota cancelada." },
          { folha: calculadoras.retorno.folha, oQue: "Quanto rende ao ano pagar um preço para receber um valor, e o preço máximo para um retorno-alvo.", quando: "Para avaliar uma oferta ou uma contraproposta." },
          { folha: calculadoras.ativa.folha, oQue: "Valor da cota ativa: crédito que se recebe menos as parcelas que faltam, por mês de contemplação.", quando: "Para precificar uma cota ativa." },
          { folha: calculadoras.ativa.calculo, oQue: "O cálculo mês a mês que alimenta a cota ativa.", quando: "Só para conferir a conta." },
        ]
      : []),
    { folha: custo.folha, oQue: "Curvas do Tesouro Prefixado e IPCA+, expectativas do Focus, Selic, CDI e IPCA.", quando: "Para ver de onde vêm as taxas." },
    { folha: credito.folha, oQue: "Taxas de financiamento imobiliário e de veículos, por banco.", quando: "Para comparar com o crédito concorrente." },
    { folha: setor.folha, oQue: "ABAC e Panorama de Consórcios do Banco Central.", quando: "Para ler o setor (inadimplência, exclusão, prazos)." },
    { folha: mudancas.folha, oQue: "A lista completa das mudanças do dia.", quando: "Quando a aba Hoje chamar atenção." },
    { folha: fontes.folha, oQue: "Cada fonte, se respondeu e a idade do último dado.", quando: "Para saber se pode confiar no dia." },
    { folha: observacoes.folha, oQue: "Todos os números brutos da foto, com filtro.", quando: "Para buscar um número específico." },
  ].map((x) => ({ ...x, nome: x.folha.nome }));
  const leia = abaLeiaMe(ctx, indice);

  const nomes = [
    { nome: "Spread", ref: `'${NOME.hoje}'!${hoje.spread}` },
    { nome: "ValorRef", ref: `'${NOME.hoje}'!${hoje.valorRef}` },
  ];
  const abas = [leia.folha, ...indice.map((x) => x.folha)].map((f) => f.paraAba());
  return montaXlsx(abas, { nomes });
}
