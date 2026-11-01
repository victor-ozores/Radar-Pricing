import assert from "node:assert/strict";
import test from "node:test";

import { buscaRodadas, criaMonitor, textoDoSelo, tomDoVeredito } from "../js/robo.js";

const execucao = (n, inicio, extra = {}) => ({ run_number: n, event: "schedule", status: "completed", conclusion: "success", run_started_at: inicio, created_at: inicio, updated_at: new Date(new Date(inicio).getTime() + 67_000).toISOString(), html_url: `https://x/${n}`, ...extra });
const respostaCom = (corpo, ok = true) => async () => ({ ok, status: ok ? 200 : 403, json: async () => corpo });

test("buscaRodadas: lista da API, ou null quando o GitHub recusa ou a rede cai", async () => {
  const r = await buscaRodadas(respostaCom({ workflow_runs: [execucao(1, "2026-11-02T13:19:00Z")] }));
  assert.equal(r.length, 1);
  assert.equal(r[0].situacao, "sucesso");
  assert.equal(await buscaRodadas(respostaCom({ message: "rate limit" }, false)), null);
  assert.equal(await buscaRodadas(async () => { throw new Error("offline"); }), null);
});

const fotoDe = (gerado) => ({ gerado_em: gerado, data: gerado.slice(0, 10), fontes: [] });

test("o monitor começa só com a foto e melhora quando as rodadas chegam", async () => {
  const agora = () => new Date("2026-11-03T13:00:00Z"); // terça 10:00: a esperada é a de segunda
  const rodadas = [{ situacao: "falha", quando: "2026-11-02T13:19:00Z", dia: "2026-11-02", evento: "agendada", duracaoS: 30 }];
  const monitor = criaMonitor({ foto: fotoDe("2026-11-02T10:20:00-03:00"), maisRecente: "2026-11-02", agora, buscar: async () => rodadas });
  assert.equal(monitor.rodadas, undefined);
  assert.equal(monitor.veredito.estado, "em_dia");
  let avisos = 0;
  monitor.ouvir(() => avisos++);
  await monitor.inicia();
  assert.equal(avisos, 1);
  assert.equal(monitor.veredito.estado, "falhou");
  assert.equal(tomDoVeredito(monitor.veredito), "erro");
});

test("monitor sem o GitHub continua valendo pela foto", async () => {
  const agora = () => new Date("2026-11-03T13:00:00Z");
  const monitor = criaMonitor({ foto: fotoDe("2026-10-30T10:20:00-03:00"), maisRecente: "2026-10-30", agora, buscar: async () => null });
  await monitor.inicia();
  assert.equal(monitor.rodadas, null);
  assert.equal(monitor.veredito.estado, "atrasado");
  assert.equal(tomDoVeredito(monitor.veredito), "aviso");
});

test("texto do selo do topo", () => {
  const agora = new Date("2026-11-02T22:00:00Z");
  const emDia = criaMonitor({ foto: fotoDe("2026-11-02T10:20:00-03:00"), maisRecente: "2026-11-02", agora: () => agora });
  assert.equal(textoDoSelo(emDia, agora), "Atualizado há 9 h");
  assert.equal(tomDoVeredito(emDia.veredito), "ok");
  const atrasado = criaMonitor({ foto: fotoDe("2026-10-29T10:20:00-03:00"), maisRecente: "2026-10-29", agora: () => agora });
  assert.equal(textoDoSelo(atrasado, agora), "Robô atrasado");
});
