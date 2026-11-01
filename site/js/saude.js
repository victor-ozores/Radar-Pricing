// A saúde do robô: a última foto é a que deveria existir hoje? As últimas rodadas deram certo?
// Só conta: o que vem da rede (as rodadas do GitHub Actions) é buscado em robo.js.

import { somaDias } from "./foto.js";

export const HORA_DO_AGENDAMENTO = 10 + 17 / 60; // 10:17 em Brasília (cron 13:17 UTC)
export const FOLGA_DO_AGENDAMENTO_H = 6; // o cron do GitHub chegou a atrasar 5,5 h no outro radar
export const RODADAS_NA_TIRA = 14;

const diaDaSemana = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay();
export const ehDiaUtil = (iso) => diaDaSemana(iso) >= 1 && diaDaSemana(iso) <= 5;

/** A data (AAAA-MM-DD, Brasília) de uma hora do relógio. */
export function dataEmBrasilia(quando) {
  return new Date(new Date(quando).getTime() - 3 * 3600_000).toISOString().slice(0, 10);
}

/**
 * A foto mais nova que já deveria existir agora: a de hoje, se hoje é dia útil e já passou da hora do
 * agendamento mais a folga; senão, a do último dia útil antes disso. O robô roda de segunda a sexta.
 */
export function fotoEsperada(agora = new Date()) {
  const brt = new Date(agora.getTime() - 3 * 3600_000);
  const hoje = brt.toISOString().slice(0, 10);
  const hora = brt.getUTCHours() + brt.getUTCMinutes() / 60;
  let dia = ehDiaUtil(hoje) && hora >= HORA_DO_AGENDAMENTO + FOLGA_DO_AGENDAMENTO_H ? hoje : somaDias(hoje, -1);
  while (!ehDiaUtil(dia)) dia = somaDias(dia, -1);
  return dia;
}

/** Quantos dias úteis separam duas datas (a primeira não conta, a segunda sim). */
export function diasUteisEntre(de, ate) {
  let n = 0;
  for (let d = somaDias(de, 1); d <= ate; d = somaDias(d, 1)) if (ehDiaUtil(d)) n++;
  return n;
}

/** As rodadas do GitHub Actions em formato simples, da mais velha para a mais nova (a ordem de uma tira). */
export function rodadasDaApi(corpo, quantas = RODADAS_NA_TIRA) {
  const lista = Array.isArray(corpo?.workflow_runs) ? corpo.workflow_runs : [];
  return lista
    .map((r) => {
      const inicio = r.run_started_at ?? r.created_at;
      const duracao = r.status === "completed" && inicio && r.updated_at ? Math.max(0, Math.round((new Date(r.updated_at) - new Date(inicio)) / 1000)) : null;
      const situacao = r.status !== "completed" ? "andamento" : r.conclusion === "success" ? "sucesso" : r.conclusion === "failure" ? "falha" : "outra";
      return { numero: r.run_number, quando: inicio, dia: dataEmBrasilia(inicio), evento: r.event === "schedule" ? "agendada" : "manual", situacao, duracaoS: duracao, endereco: r.html_url };
    })
    .sort((a, b) => new Date(b.quando) - new Date(a.quando))
    .slice(0, quantas)
    .reverse();
}

/** Parte de rodadas concluídas que deram certo (null se ainda não há nenhuma concluída). */
export function taxaDeSucesso(rodadas) {
  const concluidas = rodadas.filter((r) => r.situacao === "sucesso" || r.situacao === "falha");
  return concluidas.length ? (concluidas.filter((r) => r.situacao === "sucesso").length / concluidas.length) * 100 : null;
}

/**
 * O veredito do robô. `maisRecente`: data da foto mais nova (AAAA-MM-DD); `rodadas`: de rodadasDaApi, ou null se a
 * consulta ao GitHub falhou. Estados: em_dia, atrasado, falhou.
 */
export function avaliaSaude({ agora = new Date(), maisRecente, rodadas = null }) {
  const esperada = fotoEsperada(agora);
  const concluidas = (rodadas ?? []).filter((r) => r.situacao === "sucesso" || r.situacao === "falha");
  const ultima = concluidas.at(-1) ?? null;
  const foraDoPrazo = maisRecente < esperada ? diasUteisEntre(maisRecente, esperada) : 0;
  if (foraDoPrazo > 0) {
    return { estado: "atrasado", curto: "Robô atrasado", detalhe: `A última foto é de ${maisRecente.slice(8, 10)}/${maisRecente.slice(5, 7)}, e já deveria existir a de ${esperada.slice(8, 10)}/${esperada.slice(5, 7)}. Faltam ${foraDoPrazo} ${foraDoPrazo === 1 ? "dia útil" : "dias úteis"}.`, foraDoPrazo };
  }
  if (ultima && ultima.situacao === "falha") {
    return { estado: "falhou", curto: "Última rodada falhou", detalhe: "A última rodada terminou com falha. Quando só uma fonte essencial falha, a foto sai publicada como dia parcial.", foraDoPrazo: 0 };
  }
  return { estado: "em_dia", curto: "Robô em dia", detalhe: "A foto mais nova é a que já deveria existir.", foraDoPrazo: 0 };
}

/** "há 12 h", "há 3 dias", "agora há pouco": a idade de um instante. */
export function haQuanto(quando, agora = new Date()) {
  const min = Math.max(0, Math.round((agora - new Date(quando)) / 60_000));
  if (min < 2) return "agora há pouco";
  if (min < 90) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
}

/** "1 min 7 s", "45 s". */
export function duracaoEmTexto(segundos) {
  if (segundos === null || segundos === undefined) return "—";
  if (segundos < 60) return `${segundos} s`;
  const min = Math.floor(segundos / 60);
  const resto = segundos % 60;
  return resto ? `${min} min ${resto} s` : `${min} min`;
}
