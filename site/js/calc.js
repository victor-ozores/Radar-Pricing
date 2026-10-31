// A mesma conta de src/radar_pricing/derivados.py (interpola, valor_presente, monta_tabela).
// tests/test_site.py compara os dois lados ao centavo com uma foto de verdade.

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
 * Uma linha da calculadora: taxa da âncora, taxa de desconto (âncora + spread) e os dois valores presentes.
 * `curva` é um item de derivados.ancoras (curva_nominal ou curva_real); devolve null se a foto não tem curva.
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
