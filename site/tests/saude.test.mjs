import assert from "node:assert/strict";
import test from "node:test";

import { avaliaSaude, dataEmBrasilia, diasUteisEntre, duracaoEmTexto, ehDiaUtil, fotoEsperada, haQuanto, rodadasDaApi, taxaDeSucesso } from "../js/saude.js";

// horários de Brasília escritos em UTC (BRT = UTC-3)
const quando = (iso) => new Date(iso);

test("dia útil: de segunda a sexta", () => {
  assert.equal(ehDiaUtil("2026-10-30"), true); // sexta
  assert.equal(ehDiaUtil("2026-10-31"), false); // sábado
  assert.equal(ehDiaUtil("2026-11-01"), false); // domingo
  assert.equal(ehDiaUtil("2026-11-02"), true); // segunda
});

test("a data em Brasília de um instante", () => {
  assert.equal(dataEmBrasilia("2026-11-01T02:56:49Z"), "2026-10-31");
  assert.equal(dataEmBrasilia("2026-11-01T03:00:00Z"), "2026-11-01");
});

test("a foto que já deveria existir: de manhã é a do dia útil anterior; depois da folga do agendamento, a de hoje", () => {
  assert.equal(fotoEsperada(quando("2026-11-02T11:00:00Z")), "2026-10-30"); // segunda 08:00: ainda é a de sexta
  assert.equal(fotoEsperada(quando("2026-11-02T19:16:00Z")), "2026-10-30"); // segunda 16:16: ainda dentro da folga
  assert.equal(fotoEsperada(quando("2026-11-02T19:17:00Z")), "2026-11-02"); // segunda 16:17: a de hoje já devia existir
  assert.equal(fotoEsperada(quando("2026-11-03T13:00:00Z")), "2026-11-02"); // terça 10:00
  assert.equal(fotoEsperada(quando("2026-10-31T15:00:00Z")), "2026-10-30"); // sábado
  assert.equal(fotoEsperada(quando("2026-11-01T15:00:00Z")), "2026-10-30"); // domingo
});

test("dias úteis entre duas datas (a primeira não conta, a segunda sim)", () => {
  assert.equal(diasUteisEntre("2026-10-30", "2026-11-03"), 2);
  assert.equal(diasUteisEntre("2026-10-30", "2026-10-30"), 0);
  assert.equal(diasUteisEntre("2026-10-23", "2026-10-30"), 5);
  assert.equal(diasUteisEntre("2026-10-31", "2026-11-01"), 0);
});

const api = (...rodadas) => ({ workflow_runs: rodadas });
const execucao = (n, inicio, extra = {}) => ({ run_number: n, event: "schedule", status: "completed", conclusion: "success", run_started_at: inicio, created_at: inicio, updated_at: new Date(new Date(inicio).getTime() + 67_000).toISOString(), html_url: `https://x/${n}`, ...extra });

test("as rodadas da API viram uma tira da mais velha para a mais nova", () => {
  const corpo = api(
    execucao(3, "2026-11-04T13:20:00Z"),
    execucao(1, "2026-11-02T13:19:00Z", { event: "workflow_dispatch" }),
    execucao(2, "2026-11-03T13:21:00Z", { conclusion: "failure" }),
    execucao(4, "2026-11-05T13:20:00Z", { status: "in_progress", conclusion: null }),
  );
  const r = rodadasDaApi(corpo);
  assert.deepEqual(r.map((x) => x.numero), [1, 2, 3, 4]);
  assert.deepEqual(r.map((x) => x.situacao), ["sucesso", "falha", "sucesso", "andamento"]);
  assert.deepEqual(r.map((x) => x.evento), ["manual", "agendada", "agendada", "agendada"]);
  assert.equal(r[0].duracaoS, 67);
  assert.equal(r[3].duracaoS, null);
  assert.equal(r[0].dia, "2026-11-02");
});

test("a tira guarda só as 14 mais novas; corpo estranho vira lista vazia", () => {
  const muitas = api(...Array.from({ length: 30 }, (_, i) => execucao(i + 1, new Date(Date.UTC(2026, 9, 1 + i, 13, 20)).toISOString())));
  const r = rodadasDaApi(muitas);
  assert.equal(r.length, 14);
  assert.equal(r.at(-1).numero, 30);
  assert.equal(r[0].numero, 17);
  assert.deepEqual(rodadasDaApi(null), []);
  assert.deepEqual(rodadasDaApi({ message: "rate limit" }), []);
});

test("taxa de sucesso só conta rodadas concluídas", () => {
  const r = rodadasDaApi(api(execucao(1, "2026-11-02T13:00:00Z"), execucao(2, "2026-11-03T13:00:00Z", { conclusion: "failure" }), execucao(3, "2026-11-04T13:00:00Z", { status: "in_progress", conclusion: null }), execucao(4, "2026-11-05T13:00:00Z")));
  assert.equal(taxaDeSucesso(r), (2 / 3) * 100);
  assert.equal(taxaDeSucesso([]), null);
});

test("robô em dia, atrasado ou com a última rodada falha", () => {
  const agora = quando("2026-11-03T13:00:00Z"); // terça 10:00: a esperada é a de segunda 02/11
  const boas = rodadasDaApi(api(execucao(1, "2026-11-02T13:19:00Z")));
  assert.equal(avaliaSaude({ agora, maisRecente: "2026-11-02", rodadas: boas }).estado, "em_dia");
  assert.equal(avaliaSaude({ agora, maisRecente: "2026-11-02", rodadas: null }).estado, "em_dia"); // sem o GitHub, vale a foto

  const atrasado = avaliaSaude({ agora, maisRecente: "2026-10-30", rodadas: boas });
  assert.equal(atrasado.estado, "atrasado");
  assert.equal(atrasado.foraDoPrazo, 1);
  assert.match(atrasado.detalhe, /30\/10.*02\/11/);

  const falha = rodadasDaApi(api(execucao(1, "2026-11-02T13:19:00Z", { conclusion: "failure" })));
  assert.equal(avaliaSaude({ agora, maisRecente: "2026-11-02", rodadas: falha }).estado, "falhou");
  // atrasar pesa mais que a falha: a pessoa precisa saber que falta foto
  assert.equal(avaliaSaude({ agora, maisRecente: "2026-10-30", rodadas: falha }).estado, "atrasado");
  // rodada em andamento não conta como falha
  const rodando = rodadasDaApi(api(execucao(1, "2026-11-02T13:19:00Z"), execucao(2, "2026-11-03T13:00:00Z", { status: "in_progress", conclusion: null })));
  assert.equal(avaliaSaude({ agora, maisRecente: "2026-11-02", rodadas: rodando }).estado, "em_dia");
});

test("fim de semana: a foto de sexta basta", () => {
  assert.equal(avaliaSaude({ agora: quando("2026-11-01T15:00:00Z"), maisRecente: "2026-10-30" }).estado, "em_dia");
  assert.equal(avaliaSaude({ agora: quando("2026-11-01T15:00:00Z"), maisRecente: "2026-10-29" }).estado, "atrasado");
});

test("idade e duração em palavras", () => {
  const agora = quando("2026-10-31T15:00:00Z");
  assert.equal(haQuanto("2026-10-31T14:59:30Z", agora), "agora há pouco");
  assert.equal(haQuanto("2026-10-31T14:15:00Z", agora), "há 45 min");
  assert.equal(haQuanto("2026-10-31T03:00:00Z", agora), "há 12 h");
  assert.equal(haQuanto("2026-10-26T15:00:00Z", agora), "há 5 dias");
  assert.equal(duracaoEmTexto(45), "45 s");
  assert.equal(duracaoEmTexto(67), "1 min 7 s");
  assert.equal(duracaoEmTexto(120), "2 min");
  assert.equal(duracaoEmTexto(null), "—");
});
