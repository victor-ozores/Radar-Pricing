// "Robô em dia": o robô travou? Mostra a foto mais nova, as últimas rodadas do GitHub Actions e o que ele fez.
// As rodadas vêm da API pública do GitHub (60 consultas por hora por endereço); se ela não responder, a página
// continua com o que a própria foto diz e avisa que não conseguiu ver o histórico.

import { dataBR, num } from "./formato.js";
import { avaliaSaude, haQuanto, rodadasDaApi } from "./saude.js";

const REPOSITORIO = "victor-ozores/Radar-Pricing";
export const ENDERECO_DAS_RODADAS = `https://api.github.com/repos/${REPOSITORIO}/actions/workflows/coleta-diaria.yml/runs?per_page=30`;
export const ENDERECO_DAS_RODADAS_NO_GITHUB = `https://github.com/${REPOSITORIO}/actions/workflows/coleta-diaria.yml`;

/** As rodadas do GitHub (da mais velha para a mais nova) ou null se não deu para consultar. */
export async function buscaRodadas(buscar = globalThis.fetch) {
  try {
    const resposta = await buscar(ENDERECO_DAS_RODADAS);
    if (!resposta.ok) return null; // 403: limite de consultas do GitHub
    return rodadasDaApi(await resposta.json());
  } catch {
    return null;
  }
}

/**
 * O monitor junta o que a foto diz com o que o GitHub diz, e avisa quem está inscrito quando chegam as rodadas.
 * `veredito` começa só com a foto e melhora quando as rodadas chegam.
 */
export function criaMonitor({ foto, maisRecente, agora = () => new Date(), buscar = buscaRodadas }) {
  const ouvintes = new Set();
  const monitor = {
    foto,
    maisRecente,
    rodadas: undefined, // undefined: buscando; null: não deu; lista: ok
    veredito: avaliaSaude({ agora: agora(), maisRecente, rodadas: null }),
    ouvir(f) {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    async inicia() {
      monitor.rodadas = await buscar();
      monitor.veredito = avaliaSaude({ agora: agora(), maisRecente, rodadas: monitor.rodadas });
      ouvintes.forEach((f) => f());
    },
  };
  return monitor;
}

/** O texto curto do selo do topo. */
export function textoDoSelo(monitor, agora = new Date()) {
  const v = monitor.veredito;
  if (v.estado === "em_dia") return `Atualizado ${haQuanto(monitor.foto.gerado_em, agora)}`;
  return v.curto;
}

const TOM = { em_dia: "ok", atrasado: "aviso", falhou: "erro" };
export const tomDoVeredito = (v) => TOM[v.estado] ?? "aviso";

export function quandoEmTexto(iso) {
  const brt = new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString();
  return `${dataBR(brt.slice(0, 10))} às ${brt.slice(11, 16)}`;
}

/** Os quatro passos do robô, com o que cada um fez na foto: [ícone, título, detalhe]. */
export function passosDoRobo(foto) {
  const essenciais = foto.fontes.filter((f) => f.papel === "essencial");
  const boas = foto.fontes.filter((f) => f.situacao === "ok").length;
  const registros = foto.fontes.reduce((s, f) => s + (f.n_registros ?? 0), 0);
  const mudancas = (foto.mudancas ?? []).filter((m) => m.severidade !== "info").length;
  return [
    ["relogio", "Leu as fontes", `${boas} de ${foto.fontes.length} responderam (${essenciais.filter((f) => f.situacao === "ok").length} de ${essenciais.length} essenciais)`],
    ["tendencia", "Guardou os números", `${num(registros, 0)} registros na foto de ${dataBR(foto.data)}`],
    ["alerta", "Marcou o que mudou", mudancas ? `${mudancas} mudanças do dia` : "sem mudanças relevantes"],
    ["check", "Publicou a foto", foto.status === "ok" ? "dia completo, na branch data" : "dia parcial, na branch data"],
  ];
}
