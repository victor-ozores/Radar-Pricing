// As contas do painel. A primeira parte repete src/radar_pricing/derivados.py (interpola, valor_presente,
// monta_tabela); tests/test_site.py compara os dois lados ao centavo com uma foto de verdade. A segunda parte são
// as calculadoras (cota cancelada, retorno de uma oferta, cota ativa): modelos simples de DEMONSTRAÇÃO, só com o que
// a pessoa digita e as curvas do dia. Taxas em % ao ano (efetivas); 1 mês = 1/12 de ano; capitalização composta.

/**
 * Taxa para o prazo `anos` por interpolação linear entre os dois vencimentos vizinhos.
 * Fora da curva usa a taxa da ponta mais próxima e avisa que extrapolou.
 * @returns {[number, boolean]} [taxa, extrapolado]
 */
export function interpola(pontos, anos) {
  const primeiro = pontos[0];
  const ultimo = pontos[pontos.length - 1];
  if (anos <= primeiro.anos) return [primeiro.taxa, anos < primeiro.anos];
  if (anos >= ultimo.anos) return [ultimo.taxa, anos > ultimo.anos];
  for (let i = 0; i < pontos.length - 1; i++) {
    const a = pontos[i];
    const b = pontos[i + 1];
    if (a.anos <= anos && anos <= b.anos) {
      const peso = (anos - a.anos) / (b.anos - a.anos);
      return [a.taxa + peso * (b.taxa - a.taxa), false];
    }
  }
  throw new Error("prazo dentro da curva sem par de vencimentos vizinhos");
}

/** Valor de hoje de `valor` recebido daqui a `meses`; taxa efetiva ao ano, capitalização composta. */
export function valorPresente(valor, taxaPct, meses) {
  return valor / (1 + taxaPct / 100) ** (meses / 12);
}

/** Arredonda pelo valor binário exato, como o `round` do Python. Só um empate exato (0,125) sai diferente
 *  (JS sobe, Python vai para o par), e as contas de desconto não caem em empate. */
export function arredonda(x, casas) {
  return Number(x.toFixed(casas));
}

/**
 * Uma linha da tabela da foto: taxa da âncora, taxa de desconto (âncora + spread) e os dois valores presentes,
 * arredondados como o robô arredonda. `curva` é um item de derivados.ancoras; null se a foto não tem a curva.
 */
export function desconta(curva, valorFace, meses, spreadPP) {
  if (!curva || !curva.pontos || curva.pontos.length === 0) return null;
  const [taxa, extrapolado] = interpola(curva.pontos, meses / 12);
  const demo = taxa + spreadPP;
  return {
    taxa_ancora: arredonda(taxa, 4),
    taxa_demonstracao: arredonda(demo, 4),
    vp_ancora: arredonda(valorPresente(valorFace, taxa, meses), 2),
    vp_demonstracao: arredonda(valorPresente(valorFace, demo, meses), 2),
    extrapolado,
  };
}

// --------------------------------------------------------------------------------------------- hoje contra 7 dias atrás
/** A curva de 7 dias atrás, montada com a taxa de referência que a foto guarda em cada vencimento (`ref7`). */
export function curvaDeSeteDiasAtras(curva) {
  if (!curva || curva.pontos.length === 0 || curva.pontos.some((p) => p.ref7 == null)) return null;
  return { ...curva, pontos: curva.pontos.map((p) => ({ ...p, taxa: p.ref7 })) };
}

/**
 * O que mudou no preço de um valor a receber em `meses`: o valor presente hoje contra o de 7 dias atrás, na mesma
 * taxa de risco (spread). `curva` vem de modelo.curvas(). Devolve null se a foto não permite comparar.
 */
export function impactoNoPrazo(curva, meses, spreadPP, valor = 1000) {
  const antes = curvaDeSeteDiasAtras(curva);
  if (!antes) return null;
  const [taxaHoje] = interpola(curva.pontos, meses / 12);
  const [taxaAntes] = interpola(antes.pontos, meses / 12);
  const vpHoje = valorPresente(valor, taxaHoje + spreadPP, meses);
  const vpAntes = valorPresente(valor, taxaAntes + spreadPP, meses);
  return {
    meses,
    dias: curva.pontos[0].dias7 ?? 7,
    taxa_hoje: taxaHoje,
    taxa_antes: taxaAntes,
    vp_hoje: vpHoje,
    vp_antes: vpAntes,
    variacao_pct: (vpHoje / vpAntes - 1) * 100,
  };
}

// --------------------------------------------------------------------------------------------- calculadoras
const positivo = (x) => Number.isFinite(x) && x > 0;

function escolheCurva(curvas, corrigido) {
  const c = corrigido ? curvas.real : curvas.nominal;
  return c && c.pontos && c.pontos.length ? c : null;
}

/**
 * Cota cancelada: a administradora devolve `valor` daqui a `meses` (no fim do grupo). Quanto isso vale hoje?
 * `corrigido`: o valor sobe com a inflação até a data (usa a curva IPCA+, resultado em reais de hoje); senão usa a
 * curva Prefixada. Devolve também o mesmo cálculo em prazos vizinhos e com o spread um ponto abaixo e acima.
 */
export function cotaCancelada({ valor, meses, corrigido, spreadPP }, curvas) {
  const curva = escolheCurva(curvas, corrigido);
  if (!curva || !positivo(valor) || !(meses >= 1) || !(spreadPP >= 0)) return null;
  const um = (m, s) => {
    const [ancora, extrapolado] = interpola(curva.pontos, m / 12);
    const desconto = ancora + s;
    const vp = valorPresente(valor, desconto, m);
    return { meses: m, spread: s, taxa_ancora: ancora, taxa_desconto: desconto, valor_presente: vp, pct_do_valor: (vp / valor) * 100, extrapolado };
  };
  return {
    ...um(meses, spreadPP),
    prazos: [-12, -6, 0, 6, 12].map((d) => meses + d).filter((m) => m >= 1).map((m) => um(m, spreadPP)),
    spreads: [-1, 0, 1].map((d) => spreadPP + d).filter((s) => s >= 0).map((s) => um(meses, s)),
  };
}

/**
 * Retorno de uma oferta: pagando `preco` para receber `valor` daqui a `meses`, quanto rende ao ano? Compara com o
 * Tesouro do mesmo prazo (e o CDI, se não for corrigido pela inflação) e calcula o preço máximo para um retorno-alvo
 * (`alvoPct`; sem ele, usa a taxa do Tesouro no prazo + o spread). Corrigido: o retorno é acima da inflação.
 */
export function retornoDaOferta({ preco, valor, meses, corrigido, alvoPct, spreadPP }, curvas, cdiAnualPct) {
  const curva = escolheCurva(curvas, corrigido);
  if (!curva || !positivo(preco) || !positivo(valor) || !(meses >= 1) || !(spreadPP >= 0)) return null;
  const [ancora, extrapolado] = interpola(curva.pontos, meses / 12);
  const retorno = ((valor / preco) ** (12 / meses) - 1) * 100;
  const alvo = Number.isFinite(alvoPct) ? alvoPct : ancora + spreadPP;
  const precoMaximo = valor / (1 + alvo / 100) ** (meses / 12);
  const referencias = [{ nome: corrigido ? "Tesouro IPCA+ no prazo (acima do IPCA)" : "Tesouro Prefixado no prazo", taxa: ancora }];
  if (!corrigido && Number.isFinite(cdiAnualPct)) referencias.push({ nome: "CDI de hoje (anualizado)", taxa: cdiAnualPct });
  return {
    retorno_aa: retorno,
    retorno_total: (valor / preco - 1) * 100,
    taxa_ancora: ancora,
    extrapolado,
    alvo,
    alvo_padrao: !Number.isFinite(alvoPct),
    preco_maximo: precoMaximo,
    folga: precoMaximo - preco,
    referencias: referencias.map((r) => ({ ...r, diferenca_pp: retorno - r.taxa })),
  };
}

/** Os exemplos que já vêm preenchidos nas calculadoras do painel e do Excel (valores inventados, só para mostrar). */
export const EXEMPLOS = {
  cancelada: { valor: 50000, meses: 24, corrigido: true },
  retorno: { preco: 38000, valor: 50000, meses: 24, corrigido: true },
  ativa: { credito: 100000, parcela: 1900, parcelas: 60, contemplacao: 12 },
};

const CONTEMPLACOES_PADRAO = [0, 6, 12, 24, 36, 48, 60, 84, 120, 180];
export const MAX_PARCELAS = 240; // 20 anos: o maior prazo de um grupo de imóveis

/**
 * Cota ativa: o comprador recebe o crédito (`credito`) no mês `contemplacao` (0 = já contemplada) e paga as
 * `parcelas` que faltam (`parcela` por mês, no 1º, 2º... mês). Valor da cota = crédito descontado - parcelas
 * descontadas. Supõe crédito e parcela corrigidos pelo mesmo índice, então desconta tudo pela curva IPCA+ (mais o
 * spread) e o resultado fica em reais de hoje. Não considera probabilidade de contemplação, lance, seguro nem as
 * regras de cada grupo.
 */
export function cotaAtiva({ credito, parcela, parcelas, contemplacao, spreadPP }, curvaReal) {
  const curva = curvaReal && curvaReal.pontos && curvaReal.pontos.length ? curvaReal : null;
  if (
    !curva || !positivo(credito) || !positivo(parcela) || !(spreadPP >= 0) ||
    !Number.isInteger(parcelas) || parcelas < 1 || parcelas > MAX_PARCELAS ||
    !Number.isInteger(contemplacao) || contemplacao < 0 || contemplacao > parcelas
  ) {
    return null;
  }
  let extrapolado = false;
  const fator = (m, s) => {
    const [ancora, ext] = interpola(curva.pontos, m / 12);
    extrapolado ||= ext;
    return (1 + (ancora + s) / 100) ** (m / 12);
  };
  const vpDasParcelas = (s) => {
    let soma = 0;
    for (let t = 1; t <= parcelas; t++) soma += parcela / fator(t, s);
    return soma;
  };
  const vpDoCredito = (k, s) => (k === 0 ? credito : credito / fator(k, s));
  const valorDaCota = (k, s) => vpDoCredito(k, s) - vpDasParcelas(s);

  const vpParcelas = vpDasParcelas(spreadPP);
  const vpCredito = vpDoCredito(contemplacao, spreadPP);
  const ks = [...new Set([...CONTEMPLACOES_PADRAO.filter((k) => k <= parcelas), contemplacao])].sort((a, b) => a - b);
  return {
    valor_da_cota: vpCredito - vpParcelas,
    pct_do_credito: ((vpCredito - vpParcelas) / credito) * 100,
    vp_credito: vpCredito,
    vp_parcelas: vpParcelas,
    total_das_parcelas: parcela * parcelas,
    cenarios: ks.map((k) => ({ contemplacao: k, valor_da_cota: valorDaCota(k, spreadPP), pct_do_credito: (valorDaCota(k, spreadPP) / credito) * 100 })),
    spreads: [-1, 0, 1].map((d) => spreadPP + d).filter((s) => s >= 0).map((s) => ({ spread: s, valor_da_cota: valorDaCota(contemplacao, s), pct_do_credito: (valorDaCota(contemplacao, s) / credito) * 100 })),
    extrapolado,
  };
}

// --------------------------------------------------------------------------------------------- sensibilidade
export const CHOQUES_PP = [-3, -2, -1, 0, 1, 2, 3];

/**
 * E se a taxa do Tesouro andar `choque` pontos percentuais em todos os prazos? O valor de hoje de `valor` a receber
 * em cada prazo e quanto ele muda contra o dia de hoje (choque 0). `curva` vem de modelo.curvas().
 * @returns {{ meses: number, taxa: number, base: number, celulas: { choque: number, valor: number, variacao_pct: number }[] }[] | null}
 */
export function sensibilidade(curva, prazos, spreadPP, valor = 1000, choques = CHOQUES_PP) {
  if (!curva || !curva.pontos || curva.pontos.length === 0 || !positivo(valor) || !(spreadPP >= 0)) return null;
  return prazos.map((meses) => {
    const [taxa] = interpola(curva.pontos, meses / 12);
    const base = valorPresente(valor, taxa + spreadPP, meses);
    return {
      meses,
      taxa,
      base,
      celulas: choques.map((choque) => {
        const v = valorPresente(valor, Math.max(0, taxa + spreadPP + choque), meses);
        return { choque, valor: v, variacao_pct: (v / base - 1) * 100 };
      }),
    };
  });
}
