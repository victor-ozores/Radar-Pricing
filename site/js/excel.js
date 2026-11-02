// O Excel das premissas do dia. Todas as abas seguem o mesmo padrão (ver folha.js): título, subtítulo com a data e o
// status, uma frase dizendo para que serve a aba, seções e tabelas iguais. As calculadoras são fórmulas de verdade,
// com o valor já calculado guardado: dá para mexer nas células amarelas e tudo se recalcula.

import { anosDoPrazo, cotaAtiva, cotaCancelada, curvaDeSeteDiasAtras, EXEMPLOS, interpola, MAX_MESES_PRECATORIO, MAX_PARCELAS, precatorio, retornoDaOferta, valorPresente } from "./calc.js";
import { COR, E, FORMATO, Folha } from "./folha.js";
import { dataBR, horaBRT, mesAno } from "./formato.js";
import * as modelo from "./modelo.js";
import { DIAS_UTEIS_NO_ANO, diasUteisDoPrazo, listaDeFeriados, numeroDoDia, somaMeses } from "./prazo.js";
import { celulaData, letraDaColuna, montaXlsx, serialDoExcel } from "./xlsx.js";

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
  precatorio: "Precatório",
  custo: "Custo do dinheiro",
  prazos: "Prazos",
  feriados: "Feriados",
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

// O prazo é contado em dias úteis (base 252), como o Tesouro conta: a aba Prazos tem uma linha por mês (de 0 a MESES_NA_ABA)
// e os nomes AnosPrefixado e AnosIPCA apontam para a coluna "Anos úteis" de cada curva (a linha do mês m é a m + 1).
const MESES_NA_ABA = 720;
const NOME_DA_FAIXA = { nominal: "AnosPrefixado", real: "AnosIPCA" };
const NOME_DA_BASE = { nominal: "BasePrefixado", real: "BaseIPCA" };
/** O prazo, em anos de 252 dias úteis, de `m` meses na curva de `id` (nominal ou real). */
const prazoNaCurva = (id, m) => `INDEX(${NOME_DA_FAIXA[id]},${m}+1)`;
/** O mesmo, com a curva escolhida pela célula "Corrigido pela inflação?" (Sim: IPCA+; Não: Prefixado). */
const prazoEscolhido = (corrigido, m) => `IF(${corrigido}="${SIM}",${prazoNaCurva("real", m)},${prazoNaCurva("nominal", m)})`;

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
    const r0 = folha.proxima + 1;
    const t = folha.tabela({
      colunas: [
        { t: "Vencimento", tipo: "data", formato: FORMATO.data },
        { t: "Prazo (anos úteis)", tipo: "numero", formato: FORMATO.num4 },
        { t: "Taxa hoje (% a.a.)", tipo: "numero", formato: FORMATO.taxa },
        { t: "Taxa há 7 dias (% a.a.)", tipo: "numero", formato: FORMATO.taxa },
        { t: "Mudou em 1 dia (p.p.)", tipo: "numero", formato: FORMATO.variacao },
        { t: "Mudou em 7 dias (p.p.)", tipo: "numero", formato: FORMATO.variacao },
        { t: "Mudou em 30 dias (p.p.)", tipo: "numero", formato: FORMATO.variacao },
      ],
      linhas: c.pontos.map((p, i) => [celulaData(p.vencimento), formula(`NETWORKDAYS(${NOME_DA_BASE[c.id]}+1,B${r0 + i},Feriados)/${DIAS_UTEIS_NO_ANO}`, p.anos), p.taxa, p.ref7, p.d1, p.d7, p.d30]),
    });
    folha.nota(`Taxa de compra do Tesouro Direto em ${dataBR(c.base)}. As calculadoras interpolam entre os vencimentos desta tabela. O prazo é de dias úteis ÷ 252, como o Tesouro conta (abas Prazos e Feriados).`, 30);
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

// --------------------------------------------------------------------------------------------- Prazos e Feriados
const CURVAS_DO_PRAZO = [["nominal", "Prefixado"], ["real", "IPCA+"]];

/** A tabela de prazos: uma linha por mês, de hoje (a data-base da curva) até o mesmo dia `m` meses depois, em dias úteis. */
function abaPrazos(ctx) {
  const { foto, curvas } = ctx;
  const ativas = CURVAS_DO_PRAZO.filter(([id]) => curvas[id]);
  const folha = new Folha(NOME.prazos, { larguras: [34, ...ativas.flatMap(() => [16, 14, 14])], corAba: COR.abaBruta });
  folha.cabecalho({
    titulo: "Prazos: dias úteis, como o Tesouro conta",
    subtitulo: subtituloDa(foto),
    paraQue:
      "O Tesouro cota a taxa \"ao ano, base 252 dias úteis\": o preço é valor ÷ (1 + taxa)^(dias úteis ÷ 252). Os dias úteis vão do dia seguinte à data-base até a data do pagamento (a data-base não conta, a do pagamento conta), sem sábados, domingos nem os feriados da aba Feriados. A data do pagamento é o mesmo dia do mês, N meses depois. Todas as calculadoras leem o prazo desta tabela.",
    alturaParaQue: 72,
  });
  const nomes = [];
  folha.secao("Data-base de cada curva");
  for (const [id, rotulo] of ativas) {
    const c = folha.campo(`Data-base do Tesouro ${rotulo}`, celulaData(curvas[id].base), { nota: "O dia da taxa de compra do Tesouro Direto usada na curva" });
    nomes.push({ nome: NOME_DA_BASE[id], ref: `'${NOME.prazos}'!${c.refAbsoluta}` });
  }
  folha.espaco();
  folha.secao("Prazo de cada número de meses");
  const colunas = [{ t: "Meses", tipo: "centro", formato: FORMATO.inteiro }];
  for (const [, rotulo] of ativas) {
    colunas.push(
      { t: `Data do pagamento (${rotulo})`, tipo: "data", formato: FORMATO.data },
      { t: `Dias úteis (${rotulo})`, tipo: "numero", formato: FORMATO.inteiro },
      { t: `Anos úteis (${rotulo})`, tipo: "numero", formato: FORMATO.num4 },
    );
  }
  const r0 = folha.proxima + 1;
  const linhas = [];
  for (let m = 0; m <= MESES_NA_ABA; m++) {
    const row = r0 + m;
    const celulas = [m];
    ativas.forEach(([id], k) => {
      const base = curvas[id].base;
      const letraData = letraDaColuna(2 + 3 * k);
      const letraDias = letraDaColuna(3 + 3 * k);
      const dias = diasUteisDoPrazo(base, m);
      celulas.push(
        formula(`EDATE(${NOME_DA_BASE[id]},B${row})`, serialDoExcel(somaMeses(base, m)), { formato: FORMATO.data }),
        formula(`IF(B${row}=0,0,NETWORKDAYS(${NOME_DA_BASE[id]}+1,${letraData}${row},Feriados))`, dias),
        formula(`${letraDias}${row}/${DIAS_UTEIS_NO_ANO}`, dias / DIAS_UTEIS_NO_ANO),
      );
    });
    linhas.push(celulas);
  }
  const t = folha.tabela({ colunas, linhas });
  folha.congelar = { linhas: t.cab };
  ativas.forEach(([id], k) => {
    const letra = letraDaColuna(4 + 3 * k);
    nomes.push({ nome: NOME_DA_FAIXA[id], ref: `'${NOME.prazos}'!$${letra}$${t.primeira}:$${letra}$${t.ultima}` });
  });
  return { folha, nomes };
}

/** A lista dos feriados nacionais que a aba Prazos desconta (do ano da foto até depois do último mês da tabela). */
function abaFeriados(ctx) {
  const { foto } = ctx;
  const folha = new Folha(NOME.feriados, { larguras: [16, 18, 40], corAba: COR.abaBruta });
  folha.cabecalho({
    titulo: "Feriados nacionais",
    subtitulo: subtituloDa(foto),
    paraQue:
      "Os feriados nacionais que não contam como dia útil: os fixos, o Carnaval (segunda e terça), a Sexta-feira Santa e o Corpus Christi (que seguem a Páscoa) e o Dia da Consciência Negra, nacional desde 2024. É a lista da Anbima. Não entram ponte nem feriado só de banco.",
    alturaParaQue: 44,
  });
  const ano0 = Number(foto.data.slice(0, 4));
  const dias = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  const lista = listaDeFeriados(ano0, ano0 + Math.ceil(MESES_NA_ABA / 12) + 2);
  const t = folha.tabela({
    colunas: [{ t: "Data", tipo: "data", formato: FORMATO.data }, { t: "Dia da semana", tipo: "centro" }, { t: "Feriado", tipo: "texto" }],
    linhas: lista.map((f) => [celulaData(f.data), dias[(((numeroDoDia(f.data) + 4) % 7) + 7) % 7], f.nome]),
  });
  folha.congelar = { linhas: t.cab };
  return { folha, nomes: [{ nome: "Feriados", ref: `'${NOME.feriados}'!$B$${t.primeira}:$B$${t.ultima}` }] };
}

// --------------------------------------------------------------------------------------------- Hoje
function abaHoje(ctx) {
  const { foto, par, curvas } = ctx;
  const folha = new Folha(NOME.hoje, { larguras: [42, 15, 15, 15, 15, 17, 22, 22, 14] });
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
        { t: "Prazo (anos úteis)", tipo: "numero", formato: FORMATO.num4 },
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
        const anos = anosDoPrazo(curva, m);
        const hoje = pontoDaCurva(curva, anos);
        const ant = antes ? pontoDaCurva(antes, anos) : null;
        const vpHoje = valorPresente(ctx.valorRef, hoje + ctx.spread, anos);
        const vpAntes = ant === null ? null : valorPresente(ctx.valorRef, ant + ctx.spread, anos);
        return [
          m,
          formula(prazoNaCurva(id, `B${r}`), anos),
          hoje,
          ant,
          ant === null ? null : formula(`D${r}-E${r}`, hoje - ant),
          formula(`D${r}+Spread`, hoje + ctx.spread),
          formula(`ValorRef/(1+(D${r}+Spread)/100)^C${r}`, vpHoje),
          ant === null ? null : formula(`ValorRef/(1+(E${r}+Spread)/100)^C${r}`, vpAntes),
          ant === null ? null : formula(`(H${r}/I${r}-1)*100`, (vpHoje / vpAntes - 1) * 100),
        ];
      }),
    });
    folha.nota(
      id === "real"
        ? "Corrigido pelo IPCA: o resultado fica em reais de hoje. Para prazos menores que o primeiro vencimento da curva IPCA+, a taxa desse vencimento é usada."
        : "Em R$ fixos: sem correção pela inflação. Valor presente = valor de referência ÷ (1 + taxa de desconto)^(prazo em anos úteis).",
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
  const valor = folha.campo("Valor a receber (R$)", ex.valor, { estilo: E.entrada, formato: FORMATO.reais, nota: "O que a administradora vai devolver, em reais de hoje" });
  const meses = folha.campo("Meses até receber", ex.meses, { estilo: E.entrada, formato: FORMATO.inteiro, nota: "Prazo até o fim do grupo" });
  const corrigido = folha.campo("Corrigido pela inflação?", ex.corrigido ? SIM : "Não", { estilo: { ...E.entrada, h: "center" }, nota: "Sim: desconta pela curva IPCA+ e o resultado fica em reais de hoje. Não: curva Prefixada." });
  const propria = folha.campo("Taxa própria de correção (% a.a.), se quiser", null, { estilo: E.entrada, formato: FORMATO.taxa, nota: "Para o índice do bem (INCC, tabela FIPE...). Preenchida, prevalece sobre a escolha acima: o valor cresce a essa taxa e desconta pela curva Prefixada." });
  const preco = folha.campo("Preço pedido (R$), se quiser", null, { estilo: E.entrada, formato: FORMATO.reais, nota: "Para ver se o preço cabe (seção 5)" });
  const custos = folha.campo("Custos de transferência (R$)", 0, { estilo: E.entrada, formato: FORMATO.reais, nota: "Taxa da administradora, cartório e o que mais for pago na compra" });
  const spread = folha.campo("Spread de risco (p.p.)", formula("Spread", ctx.spread), { formato: FORMATO.taxa, nota: "Vem da aba Hoje" });
  folha.validacoes.push(
    { ref: valor.ref, min: 0.01, erro: "Digite um valor maior que zero." },
    { ref: meses.ref, inteiro: true, min: 1, max: 600, erro: "Digite de 1 a 600 meses." },
    { ref: corrigido.ref, lista: SIM_NAO, erro: "Escolha Sim ou Não." },
    { ref: propria.ref, min: -50, max: 200, vazioOk: true, erro: "Digite uma taxa em % ao ano, ou deixe em branco." },
    { ref: preco.ref, min: 0.01, vazioOk: true, erro: "Digite um preço maior que zero, ou deixe em branco." },
    { ref: custos.ref, min: 0, erro: "Digite um valor de zero para cima." },
  );
  folha.espaco();

  // a curva certa: com taxa própria, a Prefixada (a correção já embute a inflação)
  const corr = `IF(ISNUMBER(${propria.refAbsoluta}),"Não",${corrigido.refAbsoluta})`;
  const noPagamento = (m) => `IF(ISNUMBER(${propria.refAbsoluta}),${valor.refAbsoluta}*(1+${propria.refAbsoluta}/100)^(${m}/12),${valor.refAbsoluta})`;

  const r = cotaCancelada({ valor: ex.valor, meses: ex.meses, corrigido: ex.corrigido, spreadPP: ctx.spread }, { nominal: curvas.nominal, real: curvas.real });
  folha.secao("2. Resultado");
  const prazo = folha.campo("Prazo até receber (anos úteis)", formula(prazoEscolhido(corr, meses.refAbsoluta), r.prazo_anos), { formato: FORMATO.num4, nota: "Dias úteis até receber ÷ 252, como o Tesouro conta (aba Prazos)" });
  const ancora = folha.campo("Taxa do Tesouro no prazo (% a.a.)", formula(tesouro(corr, prazo.refAbsoluta, faixas), r.taxa_ancora), { formato: FORMATO.taxa, nota: "Interpolada entre os vencimentos da aba Custo do dinheiro" });
  const desconto = folha.campo("Taxa de desconto (% a.a.)", formula(`${ancora.refAbsoluta}+${spread.refAbsoluta}`, r.taxa_desconto), { formato: FORMATO.taxa, nota: "Tesouro + spread" });
  const futuro = folha.campo("Valor no pagamento (R$)", formula(noPagamento(meses.refAbsoluta), r.valor_no_pagamento), { formato: FORMATO.reais, nota: "Com taxa própria, o valor de hoje cresce até a data; sem ela, é o mesmo valor" });
  const vp = folha.campo("Valor presente (R$)", formula(`${futuro.refAbsoluta}/(1+${desconto.refAbsoluta}/100)^${prazo.refAbsoluta}`, r.valor_presente), { estilo: E.resultado, formato: FORMATO.reais, nota: "O que o valor a receber vale hoje" });
  const pct = folha.campo("Em % do valor a receber", formula(`${vp.refAbsoluta}/${valor.refAbsoluta}*100`, r.pct_do_valor), { estilo: E.resultado, formato: FORMATO.taxa });
  folha.campo("Desconto sobre o valor (%)", formula(`100-${pct.refAbsoluta}`, 100 - r.pct_do_valor), { formato: FORMATO.taxa, nota: "O deságio: quanto fica de fora do valor a receber" });
  folha.espaco();

  folha.secao("3. E se o prazo mudar?");
  const r0 = folha.proxima + 1;
  folha.tabela({
    colunas: [
      { t: "Prazo (meses)", tipo: "centro", formato: FORMATO.inteiro },
      { t: "Prazo (anos úteis)", tipo: "numero", formato: FORMATO.num4 },
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
        formula(`IF(B${row}<1,"${TRACO}",${prazoEscolhido(corr, `B${row}`)})`, ok ? um.prazo_anos : TRACO),
        formula(`IF(B${row}<1,"${TRACO}",${tesouro(corr, `C${row}`, faixas)})`, ok ? um.taxa_ancora : TRACO),
        formula(`IF(B${row}<1,"${TRACO}",D${row}+${spread.refAbsoluta})`, ok ? um.taxa_desconto : TRACO),
        formula(`IF(B${row}<1,"${TRACO}",${noPagamento(`B${row}`)}/(1+E${row}/100)^C${row})`, ok ? um.valor_presente : TRACO),
        formula(`IF(B${row}<1,"${TRACO}",F${row}/${valor.refAbsoluta}*100)`, ok ? um.pct_do_valor : TRACO),
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
        formula(`IF(B${row}<0,"${TRACO}",${futuro.refAbsoluta}/(1+C${row}/100)^${prazo.refAbsoluta})`, ok ? um.valor_presente : TRACO),
        formula(`IF(B${row}<0,"${TRACO}",D${row}/${valor.refAbsoluta}*100)`, ok ? um.pct_do_valor : TRACO),
      ];
    }),
  });
  folha.espaco();

  folha.secao("5. O preço pedido cabe?");
  folha.campo("Preço máximo (R$)", formula(`${vp.refAbsoluta}-${custos.refAbsoluta}`, r.valor_presente), { estilo: E.resultado, formato: FORMATO.reais, nota: "O máximo que dá para pagar, já separando os custos de transferência" });
  const folga = folha.campo("Folga (R$)", formula(`IF(ISNUMBER(${preco.refAbsoluta}),${vp.refAbsoluta}-(${preco.refAbsoluta}+${custos.refAbsoluta}),"${TRACO}")`, TRACO), { formato: '"R$" #,##0.00;-"R$" #,##0.00', nota: "Positiva: o preço (com os custos) cabe no valor de hoje" });
  folha.campo(
    "Leitura",
    formula(
      `IF(ISNUMBER(${preco.refAbsoluta}),IF(${folga.refAbsoluta}>=0,"O preço cabe.","O preço não cabe."),"Digite um preço pedido para ver.")`,
      "Digite um preço pedido para ver.",
    ),
    { estilo: { ...E.calculado, h: "left" } },
  );
  folha.espaco();
  folha.nota(exemploAviso, 30);
  folha.nota("Como ler: quanto mais tempo até receber, e quanto maior o spread, menor o valor presente. O deságio é a parte do valor que fica de fora. O reembolso real segue o preço do bem, não o IPCA: se você sabe o índice (INCC, tabela FIPE), use a taxa própria.", 44);
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
  const custos = folha.campo("Custos de transferência (R$)", 0, { estilo: E.entrada, formato: FORMATO.reais, nota: "Taxa da administradora, cartório e o que mais for pago na compra. Somam ao preço." });
  const valor = folha.campo("Valor que vou receber (R$)", ex.valor, { estilo: E.entrada, formato: FORMATO.reais });
  const meses = folha.campo("Meses até receber", ex.meses, { estilo: E.entrada, formato: FORMATO.inteiro });
  const corrigido = folha.campo("Corrigido pela inflação?", ex.corrigido ? SIM : "Não", { estilo: { ...E.entrada, h: "center" }, nota: "Sim: o retorno é acima da inflação e se compara com o IPCA+. Não: compara com o Prefixado e o CDI." });
  const alvo = folha.campo("Retorno-alvo (% a.a.), se quiser", null, { estilo: E.entrada, formato: FORMATO.taxa, nota: "Deixe em branco para usar a taxa do Tesouro no prazo + o spread" });
  const spread = folha.campo("Spread de risco (p.p.)", formula("Spread", ctx.spread), { formato: FORMATO.taxa, nota: "Vem da aba Hoje" });
  folha.validacoes.push(
    { ref: preco.ref, min: 0.01, erro: "Digite um preço maior que zero." },
    { ref: custos.ref, min: 0, erro: "Digite um valor de zero para cima." },
    { ref: valor.ref, min: 0.01, erro: "Digite um valor maior que zero." },
    { ref: meses.ref, inteiro: true, min: 1, max: 600, erro: "Digite de 1 a 600 meses." },
    { ref: corrigido.ref, lista: SIM_NAO, erro: "Escolha Sim ou Não." },
    { ref: alvo.ref, min: -50, max: 200, vazioOk: true, erro: "Digite um retorno em % ao ano, ou deixe em branco." },
  );
  folha.espaco();

  const r = retornoDaOferta({ preco: ex.preco, valor: ex.valor, meses: ex.meses, corrigido: ex.corrigido, spreadPP: ctx.spread, custos: 0 }, curvas, cdi);
  const m = meses.refAbsoluta;
  folha.secao("2. Resultado");
  const pago = folha.campo("Total que sai do bolso (R$)", formula(`${preco.refAbsoluta}+${custos.refAbsoluta}`, r.pago), { formato: FORMATO.reais, nota: "Preço mais custos de transferência" });
  const prazo = folha.campo("Prazo até receber (anos úteis)", formula(prazoEscolhido(corrigido.refAbsoluta, m), r.prazo_anos), { formato: FORMATO.num4, nota: "Dias úteis até receber ÷ 252, como o Tesouro conta (aba Prazos)" });
  const retorno = folha.campo("Retorno ao ano (% a.a.)", formula(`((${valor.refAbsoluta}/${pago.refAbsoluta})^(1/${prazo.refAbsoluta})-1)*100`, r.retorno_aa), { estilo: E.resultado, formato: FORMATO.taxa, nota: "O que a oferta rende por ano de 252 dias úteis, em juros compostos" });
  folha.campo("Retorno no prazo todo (%)", formula(`(${valor.refAbsoluta}/${pago.refAbsoluta}-1)*100`, r.retorno_total), { formato: FORMATO.taxa });
  const ancora = folha.campo("Taxa do Tesouro no prazo (% a.a.)", formula(tesouro(corrigido.refAbsoluta, prazo.refAbsoluta, faixas), r.taxa_ancora), { formato: FORMATO.taxa, nota: "IPCA+ se corrigido, Prefixado se não" });
  folha.campo("Diferença para o Tesouro (p.p.)", formula(`${retorno.refAbsoluta}-${ancora.refAbsoluta}`, r.retorno_aa - r.taxa_ancora), { formato: FORMATO.variacao });
  const cdiCampo = folha.campo("CDI de hoje, anualizado (% a.a.)", cdi, { formato: FORMATO.taxa, nota: "Só se compara quando não é corrigido pela inflação" });
  folha.campo("Diferença para o CDI (p.p.)", formula(`IF(${corrigido.refAbsoluta}="${SIM}","${TRACO}",${retorno.refAbsoluta}-${cdiCampo.refAbsoluta})`, ex.corrigido ? TRACO : r.retorno_aa - cdi), { formato: FORMATO.variacao });
  folha.espaco();

  folha.secao("3. Preço máximo para o retorno-alvo");
  const alvoUsado = folha.campo("Retorno-alvo usado (% a.a.)", formula(`IF(ISNUMBER(${alvo.refAbsoluta}),${alvo.refAbsoluta},${ancora.refAbsoluta}+${spread.refAbsoluta})`, r.alvo), { formato: FORMATO.taxa });
  const bruto = `${valor.refAbsoluta}/(1+${alvoUsado.refAbsoluta}/100)^${prazo.refAbsoluta}`;
  const maximo = folha.campo("Preço máximo (R$)", formula(`${bruto}-${custos.refAbsoluta}`, r.preco_maximo), { estilo: E.resultado, formato: FORMATO.reais, nota: "Pagando até aqui (já separando os custos), o retorno é pelo menos o alvo" });
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
  folha.nota("Como ler: o retorno ao ano é (valor ÷ preço)^(1 ÷ prazo em anos úteis) − 1. Ele só diz se a oferta paga mais ou menos que as alternativas; não mede o risco de a administradora atrasar.", 30);
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
  const preco = folha.campo("Preço pedido (R$), se quiser", null, { estilo: E.entrada, formato: FORMATO.reais, nota: "O que pedem pela cota. Para ver o ágio e se o preço cabe (seção 4)" });
  const custos = folha.campo("Custos de transferência (R$)", 0, { estilo: E.entrada, formato: FORMATO.reais, nota: "Taxa da administradora, cartório e o que mais for pago na compra" });
  const spread = folha.campo("Spread de risco (p.p.)", formula("Spread", ctx.spread), { formato: FORMATO.taxa, nota: "Vem da aba Hoje" });
  folha.validacoes.push(
    { ref: preco.ref, min: 0.01, vazioOk: true, erro: "Digite um preço maior que zero, ou deixe em branco." },
    { ref: custos.ref, min: 0, erro: "Digite um valor de zero para cima." },
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
    const anos = anosDoPrazo(curvas.real, t);
    const taxa = pontoDaCurva(curvas.real, anos);
    const desc = taxa + ctx.spread;
    const parc = t <= ex.parcelas ? ex.parcela : 0;
    linhas.push([
      t,
      formula(prazoNaCurva("real", `B${row}`), anos),
      formula(interpolacao(`C${row}`, faixas.real), taxa),
      formula(`D${row}+Spread`, desc),
      formula(`IF(B${row}<=${doDigitado(parcelas)},${doDigitado(parcela)},0)`, parc),
      formula(`F${row}/(1+E${row}/100)^C${row}`, parc / (1 + desc / 100) ** anos),
    ]);
  }
  const tabelaCalculo = calculo.tabela({
    colunas: [
      { t: "Mês", tipo: "centro", formato: FORMATO.inteiro },
      { t: "Prazo (anos úteis)", tipo: "numero", formato: FORMATO.num4 },
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
  const prazoCredito = folha.campo("Prazo até a contemplação (anos úteis)", formula(prazoNaCurva("real", contemplacao.refAbsoluta), anosDoPrazo(curvas.real, ex.contemplacao)), { formato: FORMATO.num4, nota: "Dias úteis até o mês da contemplação ÷ 252 (aba Prazos); 0 se já contemplada" });
  const vpCredito = `IF(${contemplacao.refAbsoluta}=0,${credito.refAbsoluta},${credito.refAbsoluta}/(1+(${interpolacao(prazoCredito.refAbsoluta, faixas.real)}+${spread.refAbsoluta})/100)^${prazoCredito.refAbsoluta})`;
  const cCredito = folha.campo("Valor presente do crédito (R$)", formula(vpCredito, r.vp_credito), { formato: FORMATO.reais, nota: "O crédito descontado até o mês da contemplação" });
  const cParcelas = folha.campo("Valor presente das parcelas (R$)", formula(`SUM(${colunaVP})`, r.vp_parcelas), { formato: FORMATO.reais, nota: "Todas as parcelas que faltam, descontadas" });
  const cValor = folha.campo("Valor da cota hoje (R$)", formula(`${cCredito.refAbsoluta}-${cParcelas.refAbsoluta}`, r.valor_da_cota), { estilo: E.resultado, formato: '"R$" #,##0.00;-"R$" #,##0.00', nota: "Negativo: nesse cenário as parcelas pesam mais que o crédito" });
  folha.campo("Em % do crédito", formula(`${cValor.refAbsoluta}/${credito.refAbsoluta}*100`, r.pct_do_credito), { estilo: E.resultado, formato: FORMATO.taxa });
  const cTotal = folha.campo("Total das parcelas, sem descontar (R$)", formula(`${parcela.refAbsoluta}*${parcelas.refAbsoluta}`, r.total_das_parcelas), { formato: FORMATO.reais, nota: "É o saldo devedor, sem descontar" });
  folha.espaco();

  folha.secao("3. E se a contemplação for em outro mês?");
  const t0 = folha.proxima + 1;
  folha.tabela({
    colunas: [
      { t: "Contemplação em (meses)", tipo: "centro", formato: FORMATO.inteiro },
      { t: "Prazo (anos úteis)", tipo: "numero", formato: FORMATO.num4 },
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
        formula(`IF(B${row}>${parcelas.refAbsoluta},"${TRACO}",${prazoNaCurva("real", `B${row}`)})`, dentro ? anosDoPrazo(curvas.real, mes) : TRACO),
        formula(
          `IF(B${row}>${parcelas.refAbsoluta},"${TRACO}",IF(B${row}=0,${credito.refAbsoluta},${credito.refAbsoluta}/(1+(${interpolacao(`C${row}`, faixas.real)}+${spread.refAbsoluta})/100)^C${row}))`,
          dentro ? cen.vp_credito : TRACO,
        ),
        formula(`IF(ISNUMBER(D${row}),D${row}-${cParcelas.refAbsoluta},"${TRACO}")`, dentro ? cen.valor_da_cota : TRACO),
        formula(`IF(ISNUMBER(E${row}),E${row}/${credito.refAbsoluta}*100,"${TRACO}")`, dentro ? cen.pct_do_credito : TRACO),
      ];
    }),
  });
  folha.nota("A primeira linha é o mês que você digitou; as outras são cenários fixos. Mês depois da última parcela aparece como —.", 18);
  folha.espaco();

  folha.secao("4. O preço pedido: ágio e se cabe");
  const semPreco = `ISNUMBER(${preco.refAbsoluta})`;
  folha.campo("Ágio sobre o crédito (%)", formula(`IF(${semPreco},${preco.refAbsoluta}/${credito.refAbsoluta}*100,"${TRACO}")`, TRACO), { formato: FORMATO.taxa, nota: "O preço pedido como % do crédito" });
  folha.campo("Ágio sobre o saldo devedor (%)", formula(`IF(${semPreco},${preco.refAbsoluta}/${cTotal.refAbsoluta}*100,"${TRACO}")`, TRACO), { formato: FORMATO.taxa, nota: "O mesmo preço como % do saldo devedor: a base muda o percentual" });
  folha.campo("Custo total de quem compra (R$)", formula(`IF(${semPreco},${cTotal.refAbsoluta}+${preco.refAbsoluta}+${custos.refAbsoluta},"${TRACO}")`, TRACO), { formato: FORMATO.reais, nota: "Saldo devedor + preço + custos, sem descontar no tempo" });
  folha.campo("Preço máximo (R$)", formula(`${cValor.refAbsoluta}-${custos.refAbsoluta}`, r.valor_da_cota), { estilo: E.resultado, formato: '"R$" #,##0.00;-"R$" #,##0.00', nota: "O valor da cota menos os custos de transferência" });
  const folgaAtiva = folha.campo("Folga (R$)", formula(`IF(${semPreco},${cValor.refAbsoluta}-(${preco.refAbsoluta}+${custos.refAbsoluta}),"${TRACO}")`, TRACO), { formato: '"R$" #,##0.00;-"R$" #,##0.00', nota: "Positiva: o preço (com os custos) cabe no valor da cota" });
  folha.campo(
    "Leitura",
    formula(`IF(${semPreco},IF(${folgaAtiva.refAbsoluta}>=0,"O preço cabe.","O preço não cabe."),"Digite um preço pedido para ver.")`, "Digite um preço pedido para ver."),
    { estilo: { ...E.calculado, h: "left" } },
  );
  folha.espaco();
  folha.nota(exemploAviso, 30);
  folha.nota(
    "Como ler: supõe que o crédito e a parcela são corrigidos pelo mesmo índice, então tudo é descontado pela curva IPCA+ (mais o spread) e fica em reais de hoje. Não considera a chance de ser contemplada, lance, seguro nem as regras de cada grupo. Para prazos menores que o 1º vencimento da curva IPCA+, usa a taxa desse vencimento.",
    44,
  );
  return { folha, calculo };
}

// --------------------------------------------------------------------------------------------- precatório
function abaPrecatorio(ctx, faixas) {
  const { foto, curvas } = ctx;
  const ex = EXEMPLOS.precatorio;
  const caminho = modelo.caminhoDeCorrecao(foto);
  const r = precatorio({ ...ex, spreadPP: ctx.spread }, curvas.nominal, caminho);
  const folha = new Folha(NOME.precatorio, { larguras: [40, 20, 20, 20, 20, 20, 20] });
  cabecalhoDeCalculadora(
    folha,
    foto,
    "Precatório: quanto vale hoje o valor corrigido até receber",
    "Um precatório é um valor que o governo reconheceu dever e só paga mais tarde. Aqui o valor de hoje cresce até o pagamento, perde as retenções e é descontado pela curva do Tesouro Prefixado mais o spread. Se houver uma oferta de compra, mostra o retorno de quem compra.",
  );
  folha.secao("1. Digite");
  const valor = folha.campo("Valor atualizado hoje (R$)", ex.valor, { estilo: E.entrada, formato: FORMATO.reais, nota: "O crédito já corrigido até hoje (o que consta no ofício ou no extrato do tribunal)" });
  const meses = folha.campo("Meses até o pagamento", ex.meses, { estilo: E.entrada, formato: FORMATO.inteiro, nota: "A fila é incerta: teste mais de um prazo" });
  const taxa = folha.campo("Correção média até o pagamento (% a.a.)", r.correcao_aa_pct, { estilo: E.entrada, formato: FORMATO.taxa, nota: "Já vem com a média que o painel calcula mês a mês (Selic do Focus). Troque pela sua: Selic, IPCA mais juros, taxa própria ou 0 para sem correção." });
  const retencao = folha.campo("Retenções e descontos (%)", ex.retencaoPct, { estilo: E.entrada, formato: FORMATO.taxa, nota: "Imposto de renda, PSS, honorários e o que mais sair do valor: digite o total" });
  const desagio = folha.campo("Deságio da oferta de compra (%), se houver", ex.desagioPct, { estilo: E.entrada, formato: FORMATO.taxa, nota: "Deixe em branco se não há oferta" });
  const custos = folha.campo("Custos de transferência (R$)", 0, { estilo: E.entrada, formato: FORMATO.reais, nota: "Cartório, advogado da cessão e o que mais o comprador pagar" });
  const spread = folha.campo("Spread de risco (p.p.)", formula("Spread", ctx.spread), { formato: FORMATO.taxa, nota: "Vem da aba Hoje" });
  folha.validacoes.push(
    { ref: valor.ref, min: 0.01, erro: "Digite um valor maior que zero." },
    { ref: meses.ref, inteiro: true, min: 1, max: MAX_MESES_PRECATORIO, erro: `Digite de 1 a ${MAX_MESES_PRECATORIO} meses.` },
    { ref: taxa.ref, min: -50, max: 200, erro: "Digite uma taxa em % ao ano (0 para sem correção)." },
    { ref: retencao.ref, min: 0, max: 99, erro: "Digite de 0 a 99." },
    { ref: desagio.ref, min: 0, max: 99, vazioOk: true, erro: "Digite de 0 a 99, ou deixe em branco." },
    { ref: custos.ref, min: 0, erro: "Digite um valor de zero para cima." },
  );
  folha.espaco();

  const m = meses.refAbsoluta;
  const fator = (mm) => `(1+${taxa.refAbsoluta}/100)^(${mm}/12)`;
  folha.secao("2. Resultado");
  const esperado = folha.campo("Valor esperado no pagamento (R$)", formula(`${valor.refAbsoluta}*${fator(m)}`, r.valor_esperado), { formato: FORMATO.reais, nota: "O valor de hoje corrigido até a data" });
  const liquido = folha.campo("Depois das retenções (R$)", formula(`${esperado.refAbsoluta}*(1-${retencao.refAbsoluta}/100)`, r.liquido_esperado), { formato: FORMATO.reais });
  const prazo = folha.campo("Prazo até o pagamento (anos úteis)", formula(prazoNaCurva("nominal", m), r.prazo_anos), { formato: FORMATO.num4, nota: "Dias úteis até o pagamento ÷ 252, como o Tesouro conta (aba Prazos). A correção segue o calendário." });
  const ancora = folha.campo("Taxa do Tesouro Prefixado no prazo (% a.a.)", formula(interpolacao(prazo.refAbsoluta, faixas.nominal), r.taxa_ancora), { formato: FORMATO.taxa, nota: "Prefixada porque a correção já embute inflação" });
  const desconto = folha.campo("Taxa de desconto (% a.a.)", formula(`${ancora.refAbsoluta}+${spread.refAbsoluta}`, r.taxa_desconto), { formato: FORMATO.taxa, nota: "Tesouro + spread" });
  const vp = folha.campo("Vale hoje (R$)", formula(`${liquido.refAbsoluta}/(1+${desconto.refAbsoluta}/100)^${prazo.refAbsoluta}`, r.valor_presente), { estilo: E.resultado, formato: FORMATO.reais, nota: "O valor presente do que será pago" });
  const pct = folha.campo("Em % do valor atualizado", formula(`${vp.refAbsoluta}/${valor.refAbsoluta}*100`, r.pct_do_valor), { estilo: E.resultado, formato: FORMATO.taxa });
  folha.campo("Deságio justo (%)", formula(`100-${pct.refAbsoluta}`, r.desagio_justo_pct), { formato: FORMATO.taxa, nota: "Quanto abaixo do valor atualizado o preço teria de ficar para quem compra ganhar o Tesouro mais o spread" });
  folha.espaco();

  const o = r.oferta;
  folha.secao("3. A oferta de compra");
  const tem = `ISNUMBER(${desagio.refAbsoluta})`;
  const preco = folha.campo("Preço da oferta (R$)", formula(`IF(${tem},${valor.refAbsoluta}*(1-${desagio.refAbsoluta}/100),"${TRACO}")`, o.preco), { formato: FORMATO.reais });
  const pago = folha.campo("Total que sai do bolso (R$)", formula(`IF(${tem},${preco.refAbsoluta}+${custos.refAbsoluta},"${TRACO}")`, o.pago), { formato: FORMATO.reais, nota: "Preço mais custos de transferência" });
  folha.campo("Retorno de quem compra (% a.a.)", formula(`IF(${tem},((${liquido.refAbsoluta}/${pago.refAbsoluta})^(1/${prazo.refAbsoluta})-1)*100,"${TRACO}")`, o.retorno_aa), { estilo: E.resultado, formato: FORMATO.taxa, nota: "Compare com a taxa de desconto acima" });
  const folga = folha.campo("Folga (R$)", formula(`IF(${tem},${vp.refAbsoluta}-${pago.refAbsoluta},"${TRACO}")`, o.folga), { formato: '"R$" #,##0.00;-"R$" #,##0.00', nota: "Positiva: a oferta cabe no valor de hoje" });
  folha.campo("Preço máximo (R$)", formula(`${vp.refAbsoluta}-${custos.refAbsoluta}`, o.preco_maximo), { estilo: E.resultado, formato: FORMATO.reais, nota: "O máximo que dá para pagar, já separando os custos" });
  folha.campo("Deságio mínimo (%)", formula(`(1-(${vp.refAbsoluta}-${custos.refAbsoluta})/${valor.refAbsoluta})*100`, o.desagio_minimo_pct), { formato: FORMATO.taxa, nota: "O menor deságio que ainda paga a conta" });
  folha.campo(
    "Leitura",
    formula(`IF(${tem},IF(${folga.refAbsoluta}>=0,"A oferta cabe.","A oferta não cabe."),"Digite um deságio para ver.")`, "A oferta cabe."),
    { estilo: { ...E.calculado, h: "left" } },
  );
  folha.espaco();

  folha.secao("4. E se o prazo mudar?");
  const r0 = folha.proxima + 1;
  const ancoraEm = (mm) => interpola(curvas.nominal.pontos, anosDoPrazo(curvas.nominal, mm))[0];
  const taxaEx = r.correcao_aa_pct;
  folha.tabela({
    colunas: [
      { t: "Prazo (meses)", tipo: "centro", formato: FORMATO.inteiro },
      { t: "Prazo (anos úteis)", tipo: "numero", formato: FORMATO.num4 },
      { t: "Valor esperado (R$)", tipo: "numero", formato: FORMATO.num2 },
      { t: "Taxa do Tesouro (% a.a.)", tipo: "numero", formato: FORMATO.taxa },
      { t: "Taxa de desconto (% a.a.)", tipo: "numero", formato: FORMATO.taxa },
      { t: "Vale hoje (R$)", tipo: "numero", formato: FORMATO.num2 },
      { t: "Em % do valor", tipo: "numero", formato: FORMATO.taxa },
    ],
    linhas: [null, 12, 24, 36, 48, 60].map((fixo, i) => {
      const row = r0 + i;
      const mm = i === 0 ? ex.meses : fixo;
      const esp = ex.valor * (1 + taxaEx / 100) ** (mm / 12);
      const anc = ancoraEm(mm);
      const desc = anc + ctx.spread;
      const anosM = anosDoPrazo(curvas.nominal, mm);
      const vpm = (esp * (1 - ex.retencaoPct / 100)) / (1 + desc / 100) ** anosM;
      return [
        i === 0 ? formula(m, mm) : mm,
        formula(prazoNaCurva("nominal", `B${row}`), anosM),
        formula(`${valor.refAbsoluta}*(1+${taxa.refAbsoluta}/100)^(B${row}/12)`, esp),
        formula(interpolacao(`C${row}`, faixas.nominal), anc),
        formula(`E${row}+${spread.refAbsoluta}`, desc),
        formula(`D${row}*(1-${retencao.refAbsoluta}/100)/(1+F${row}/100)^C${row}`, vpm),
        formula(`G${row}/${valor.refAbsoluta}*100`, (vpm / ex.valor) * 100),
      ];
    }),
  });
  folha.nota("A primeira linha é o prazo que você digitou; as outras são prazos fixos. Todas usam a mesma correção média (a do painel muda mês a mês com o Focus, então os prazos fixos aqui são uma aproximação).", 30);
  folha.espaco();
  folha.nota(exemploAviso, 30);
  folha.nota(
    "Como ler: a regra de correção dos precatórios mudou em 2025 e varia por caso (ente devedor, ano de expedição, natureza do crédito). Por isso a correção é um número seu: digite a taxa que vale no seu caso. Não considera ordem de pagamento, risco do ente devedor nem litígios, e as retenções são um percentual que você informa.",
    58,
  );
  return { folha };
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
    ["Taxas", "Em % ao ano, efetivas, com juros compostos."],
    ["Prazo", "Contado em dias úteis (sem fins de semana nem feriados nacionais) e dividido por 252, como o Tesouro conta. O prazo de N meses vai até o mesmo dia do mês, N meses depois. Veja as abas Prazos e Feriados."],
    ["p.p.", "Pontos percentuais: a diferença entre duas taxas (de 13,00% para 13,25% são +0,25 p.p.)."],
    ["Mudou em 7 dias", "Compara com o mesmo número 7 dias antes, que a própria fonte informa."],
    ["Valor presente", "Quanto um valor a receber no futuro vale hoje: valor ÷ (1 + taxa de desconto)^(prazo em anos úteis)."],
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
  const prazos = curvas.nominal || curvas.real ? abaPrazos(ctx) : null;
  const feriados = prazos ? abaFeriados(ctx) : null;
  const hoje = abaHoje(ctx);
  const calculadoras =
    curvas.nominal && curvas.real
      ? { cancelada: abaCotaCancelada(ctx, custo.faixas), retorno: abaRetorno(ctx, custo.faixas), ativa: abaCotaAtiva(ctx, custo.faixas), precatorio: abaPrecatorio(ctx, custo.faixas) }
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
          { folha: calculadoras.precatorio.folha, oQue: "Quanto vale hoje um precatório corrigido até o pagamento, e o retorno de quem compra com um deságio.", quando: "Para precificar um precatório ou avaliar uma cessão." },
        ]
      : []),
    { folha: custo.folha, oQue: "Curvas do Tesouro Prefixado e IPCA+, expectativas do Focus, Selic, CDI e IPCA.", quando: "Para ver de onde vêm as taxas." },
    ...(prazos
      ? [
          { folha: prazos.folha, oQue: "O prazo de 0 a 720 meses em dias úteis (÷ 252), como o Tesouro conta. Todas as calculadoras leem esta tabela.", quando: "Para conferir o prazo de uma conta." },
          { folha: feriados.folha, oQue: "Os feriados nacionais que não contam como dia útil.", quando: "Para conferir a contagem de dias úteis." },
        ]
      : []),
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
    ...(prazos ? [...prazos.nomes, ...feriados.nomes] : []),
  ];
  const abas = [leia.folha, ...indice.map((x) => x.folha)].map((f) => f.paraAba());
  return montaXlsx(abas, { nomes });
}
