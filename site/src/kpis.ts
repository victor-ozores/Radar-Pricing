import { ancoraNoTempo, creditoNoTempo, custoDoDinheiro, focusNoTempo, serieDe } from "../js/historico.js";
import type { Foto } from "./tipos";
import type { TermoDoGlossario } from "./ui/dicas";

/** A forma recente de cada número de manchete (para o mini-gráfico) e o termo do dicionário que o explica. */
export function sparkDoKpi(foto: Foto, id: string): number[] {
  const ano = Number(foto.data.slice(0, 4));
  const valores = (lista: { valor: number }[]) => lista.map((p) => p.valor);
  switch (id) {
    case "selic_meta":
      return valores(serieDe(foto, "bcb_sgs", "selic_meta"));
    case "cdi":
      return (custoDoDinheiro(foto) as { cdi?: number }[]).flatMap((l) => (l.cdi === undefined ? [] : [l.cdi]));
    case "ipca_12m":
      return valores(serieDe(foto, "bcb_sgs", "ipca_12_meses"));
    case "ancora_fixa":
      return valores(ancoraNoTempo(foto, "Tesouro Prefixado", 36));
    case "ancora_ipca":
      return valores(ancoraNoTempo(foto, "Tesouro IPCA+", 36));
    case "fin_veiculos":
      return (creditoNoTempo(foto, "taxa_financiamento_veiculos") as { mediana: number }[]).map((l) => l.mediana);
    case "fin_imobiliario":
      return (creditoNoTempo(foto, "taxa_financiamento_imobiliario") as { mediana: number }[]).map((l) => l.mediana);
    case "focus_selic":
      return (focusNoTempo(foto, "focus_selic_anual").linhas as Record<string, number>[]).flatMap((l) => (typeof l[ano + 1] === "number" ? [l[ano + 1]] : []));
    case "focus_ipca":
      return (focusNoTempo(foto, "focus_ipca_anual").linhas as Record<string, number>[]).flatMap((l) => (typeof l[ano] === "number" ? [l[ano]] : []));
    default:
      return [];
  }
}

export const TERMO_DO_KPI: Record<string, TermoDoGlossario> = {
  selic_meta: "selic",
  cdi: "cdi",
  ipca_12m: "ipca",
  ancora_fixa: "prefixado",
  ancora_ipca: "ipcaMais",
  focus_selic: "focus",
  focus_ipca: "focus",
};

/** Em que período a mudança de cada número é medida, quando a foto traz a mudança. */
export const PERIODO_DO_KPI = "em 7 dias";
