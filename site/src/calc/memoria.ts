import { useCallback, useState } from "react";
import { mesesEntre } from "../../js/foto.js";

/** As calculadoras, na ordem em que aparecem em todo lugar (menu do topo, barra do celular e a própria tela). */
export const CALCULADORAS = [
  { id: "cancelada", nome: "Cota cancelada", resumo: "Quanto vale hoje o que o grupo vai devolver" },
  { id: "ativa", nome: "Cota ativa", resumo: "O crédito menos as parcelas, em valor de hoje" },
  { id: "oferta", nome: "Retorno de uma oferta", resumo: "Quanto rende e qual o preço máximo" },
  { id: "precatorio", nome: "Precatório", resumo: "O valor corrigido até receber, em valor de hoje" },
  { id: "lote", nome: "Várias cotas", resumo: "Cole uma lista e calcule todas de uma vez" },
] as const;

export type IdDaCalculadora = (typeof CALCULADORAS)[number]["id"];

const CHAVE_DA_ULTIMA = "radar-ultima-calculadora";
const PREFIXO = "radar-calc-";

function ler(chave: string): string | null {
  try {
    return globalThis.localStorage?.getItem(chave) ?? null;
  } catch {
    return null; // sem armazenamento (janela privada, bloqueio): a página funciona do mesmo jeito, sem lembrar
  }
}

function gravar(chave: string, valor: string | null) {
  try {
    if (valor === null) globalThis.localStorage?.removeItem(chave);
    else globalThis.localStorage?.setItem(chave, valor);
  } catch {
    /* vale só nesta visita */
  }
}

/** A calculadora que a pessoa usou por último: o menu e a barra do celular levam direto para ela. */
export function ultimaCalculadora(): IdDaCalculadora {
  const id = ler(CHAVE_DA_ULTIMA);
  return CALCULADORAS.find((c) => c.id === id)?.id ?? CALCULADORAS[0].id;
}

export const guardaUltimaCalculadora = (id: IdDaCalculadora) => gravar(CHAVE_DA_ULTIMA, id);

const CHAVE_DO_SPREAD = "radar-spread";

/** O spread que a pessoa escolheu para o painel todo (null se nunca mudou ou se o valor guardado não presta). */
export function spreadGuardado(): number | null {
  const texto = ler(CHAVE_DO_SPREAD);
  const v = Number(texto);
  return texto !== null && texto.trim() !== "" && Number.isFinite(v) && v >= 0 && v <= 30 ? v : null;
}

/** Guarda o spread escolhido; null volta ao padrão do painel. */
export const guardaSpread = (v: number | null) => gravar(CHAVE_DO_SPREAD, v === null ? null : String(v));

/** " (exemplo)" enquanto o spread é o de demonstração do painel; vazio quando a pessoa pôs o dela. */
export const notaDoSpread = (spread: number, padrao: number) => (spread === padrao ? " (exemplo)" : "");

/** O que vem depois de "p.p." no fim de uma frase: "(exemplo)." com o spread de demonstração; nada com o da pessoa (o ponto de "p.p." já fecha). */
export const fimDoSpread = (spread: number, padrao: number) => (spread === padrao ? " (exemplo)." : "");

/**
 * Junta o que estava guardado com os valores de exemplo: cada campo só vale se tem o mesmo tipo do exemplo (e, sendo
 * número, se é finito). O que faltar ou vier estragado volta ao exemplo, então um valor antigo nunca derruba a tela.
 */
export function mesclaValido<T extends Record<string, string | number | boolean>>(exemplo: T, lido: unknown): T {
  if (typeof lido !== "object" || lido === null) return exemplo;
  const saida: Record<string, unknown> = { ...exemplo };
  for (const [chave, padrao] of Object.entries(exemplo)) {
    const v = (lido as Record<string, unknown>)[chave];
    if (typeof v === typeof padrao && (typeof v !== "number" || Number.isFinite(v))) saida[chave] = v;
  }
  return saida as T;
}

/** O estado de uma calculadora, lembrado entre as visitas (neste navegador). Devolve também o "voltar aos exemplos". */
export function usePersistido<T extends Record<string, string | number | boolean>>(id: IdDaCalculadora, exemplo: T) {
  const [estado, setEstado] = useState<T>(() => {
    const guardado = ler(PREFIXO + id);
    try {
      return mesclaValido(exemplo, guardado ? JSON.parse(guardado) : null);
    } catch {
      return exemplo;
    }
  });
  const muda = useCallback(
    (parte: Partial<T>) =>
      setEstado((atual) => {
        const novo = { ...atual, ...parte };
        gravar(PREFIXO + id, JSON.stringify(novo));
        return novo;
      }),
    [id],
  );
  const volta = useCallback(() => {
    gravar(PREFIXO + id, null);
    setEstado(exemplo);
  }, [id, exemplo]);
  return [estado, muda, volta] as const;
}

/** O prazo da conta em meses: o número digitado ou os meses até a data escolhida (AAAA-MM). null se não serve. */
export function mesesDaConta(e: { meses: number; prazoEmData: boolean; prazoData: string }, baseIso: string, max = 360): number | null {
  if (!e.prazoEmData) return Number.isInteger(e.meses) && e.meses >= 1 && e.meses <= max ? e.meses : null;
  if (!/^\d{4}-\d{2}$/.test(e.prazoData)) return null;
  const m = mesesEntre(baseIso, e.prazoData);
  return m >= 1 && m <= max ? m : null;
}

/** Copia um texto para a área de transferência. Devolve false se o navegador não deixou. */
export async function copiaTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    try {
      const el = document.createElement("textarea");
      el.value = texto;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.append(el);
      el.select();
      const ok = document.execCommand("copy");
      el.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
