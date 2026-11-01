// As séries no tempo, tiradas dos próprios registros da foto: ela guarda cerca de 35 dias de Tesouro, 60 de Selic e
// 25 semanas de Focus. Só organiza e conta; o que desenha está em src/.

import { interpola } from "./calc.js";
import { mediana, percentil } from "./modelo.js";
import { somaDias } from "./foto.js";

const porData = (a, b) => a.data.localeCompare(b.data);

/** Uma série de uma fonte, em ordem de data: [{ data, valor }]. */
export function serieDe(foto, fonte, serie, dimensao = null) {
  return foto.registros
    .filter((r) => r.fonte === fonte && r.serie === serie && (dimensao === null || r.dimensao === dimensao))
    .map((r) => ({ data: r.data_ref, valor: r.valor }))
    .sort(porData);
}

/** CDI diário (% ao dia) em % ao ano, com 252 dias úteis: a mesma conta que o robô faz para o CDI anualizado. */
export const cdiAnualizado = (diarioPct) => ((1 + diarioPct / 100) ** 252 - 1) * 100;

/** Selic meta, Selic over e CDI (anualizado) lado a lado, uma linha por data em que alguma existe. */
export function custoDoDinheiro(foto) {
  const meta = serieDe(foto, "bcb_sgs", "selic_meta");
  const cdi = serieDe(foto, "bcb_sgs", "cdi");
  const linhas = new Map();
  const poe = (lista, campo, f = (v) => v) => lista.forEach((p) => linhas.set(p.data, { ...(linhas.get(p.data) ?? { data: p.data }), [campo]: f(p.valor) }));
  poe(meta, "meta");
  poe(cdi, "cdi", cdiAnualizado);
  return [...linhas.values()].sort(porData);
}

const SEPARADOR_DO_TITULO = /^titulo=(.+?)\|vencimento=(\d{4})-(\d{2})-(\d{2})$/;

/** Cada título do Tesouro com seu vencimento e sua taxa ao longo do tempo. Ordem: título, depois vencimento. */
export function titulosDoTesouro(foto) {
  const grupos = new Map();
  for (const r of foto.registros) {
    if (r.fonte !== "tesouro" || r.serie !== "tesouro_taxa_compra") continue;
    const m = SEPARADOR_DO_TITULO.exec(r.dimensao);
    if (!m) continue;
    const g = grupos.get(r.dimensao) ?? { chave: r.dimensao, titulo: m[1], vencimento: `${m[2]}-${m[3]}-${m[4]}`, ano: Number(m[2]), pontos: [] };
    g.pontos.push({ data: r.data_ref, valor: r.valor });
    grupos.set(r.dimensao, g);
  }
  const lista = [...grupos.values()];
  lista.forEach((g) => g.pontos.sort(porData));
  return lista.sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR") || a.vencimento.localeCompare(b.vencimento));
}

/** A data da lista mais perto de `alvo` sem passar dele; a mais antiga se todas passam. */
export function dataAteO(datas, alvo) {
  const antes = datas.filter((d) => d <= alvo);
  return antes.length ? antes.at(-1) : (datas[0] ?? null);
}

const DIAS_NO_ANO = 365.25; // o mesmo que o robô usa para medir o prazo de um título (src/radar_pricing/derivados.py)

/**
 * A taxa de um título do Tesouro para o prazo de `meses`, dia a dia: em cada data, interpola a curva daquele dia
 * (a mesma conta da âncora do painel). Só entram os dias em que a curva tem pelo menos dois vencimentos.
 */
export function ancoraNoTempo(foto, titulo, meses) {
  const todos = titulosDoTesouro(foto).filter((t) => t.titulo === titulo);
  const datas = [...new Set(todos.flatMap((t) => t.pontos.map((p) => p.data)))].sort();
  const saida = [];
  for (const data of datas) {
    const pontos = todos
      .map((t) => ({ anos: (new Date(`${t.vencimento}T00:00:00Z`) - new Date(`${data}T00:00:00Z`)) / 86_400_000 / DIAS_NO_ANO, taxa: t.pontos.find((p) => p.data === data)?.valor }))
      .filter((p) => p.anos > 0 && p.taxa !== undefined)
      .sort((a, b) => a.anos - b.anos);
    if (pontos.length < 2) continue;
    saida.push({ data, valor: interpola(pontos, meses / 12)[0] });
  }
  return saida;
}

/** A expectativa do Focus para cada ano, semana a semana: { anos: [2026, ...], linhas: [{ data, "2026": 13,25, ... }] }. */
export function focusNoTempo(foto, serie = "focus_selic_anual") {
  const linhas = new Map();
  const anos = new Set();
  for (const r of foto.registros) {
    if (r.fonte !== "bcb_focus" || r.serie !== serie) continue;
    const ano = r.dimensao.replace("ano=", "");
    anos.add(Number(ano));
    linhas.set(r.data_ref, { ...(linhas.get(r.data_ref) ?? { data: r.data_ref }), [ano]: r.valor });
  }
  return { anos: [...anos].sort((a, b) => a - b), linhas: [...linhas.values()].sort(porData) };
}

/** Taxa de crédito por data: a mediana e o miolo (1º a 3º quartil) dos bancos que a informaram naquele dia. */
export function creditoNoTempo(foto, serie) {
  const porDia = new Map();
  for (const r of foto.registros) {
    if (r.fonte !== "bcb_taxas" || r.serie !== serie) continue;
    porDia.set(r.data_ref, [...(porDia.get(r.data_ref) ?? []), r.valor]);
  }
  return [...porDia.entries()]
    .map(([data, v]) => ({ data, n: v.length, mediana: mediana(v), p25: percentil(v, 0.25), p75: percentil(v, 0.75) }))
    .sort(porData);
}
