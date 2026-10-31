import assert from "node:assert/strict";
import test from "node:test";

import { BASE_PADRAO, baseDaFoto, buscaFoto, diasEntre, hojeEmBrasilia, procuraFoto, somaDias, validaFoto } from "../js/foto.js";

const fotoMinima = (extra = {}) => ({ versao: 1, data: "2026-10-30", fontes: [], registros: [], derivados: {}, ...extra });

/** Um `fetch` falso: `fotos` mapeia a data para a resposta (objeto = 200, número = status). */
function buscaFalsa(fotos, chamadas = []) {
  return async (url) => {
    chamadas.push(url);
    const data = /(\d{4}-\d{2}-\d{2})\.json$/.exec(url)[1];
    const r = fotos[data];
    if (r instanceof Error) throw r;
    if (r === undefined || typeof r === "number") {
      const status = r ?? 404;
      return { status, ok: status < 400, json: async () => ({}) };
    }
    return { status: 200, ok: true, json: async () => r };
  };
}

test("hoje em Brasília: três horas antes do UTC", () => {
  assert.equal(hojeEmBrasilia(new Date("2026-10-31T02:59:59Z")), "2026-10-30"); // ainda é dia 30 em Brasília
  assert.equal(hojeEmBrasilia(new Date("2026-10-31T03:00:00Z")), "2026-10-31");
  assert.equal(hojeEmBrasilia(new Date("2026-01-01T02:00:00Z")), "2025-12-31");
});

test("soma de dias atravessa mês e ano", () => {
  assert.equal(somaDias("2026-10-31", 1), "2026-11-01");
  assert.equal(somaDias("2026-01-01", -1), "2025-12-31");
  assert.equal(somaDias("2028-02-28", 1), "2028-02-29");
  assert.equal(diasEntre("2026-10-24", "2026-10-31"), 7);
});

test("a origem dos números só pode ser trocada numa máquina local", () => {
  const local = (hostname, search) => ({ hostname, search });
  assert.equal(baseDaFoto(local("victor-ozores.github.io", "?base=https://evil.example/x")), BASE_PADRAO);
  assert.equal(baseDaFoto(local("localhost", "?base=/data_local/")), "/data_local");
  assert.equal(baseDaFoto(local("127.0.0.1", "")), BASE_PADRAO);
  assert.equal(baseDaFoto(local("localhost.evil.com", "?base=/x")), BASE_PADRAO);
});

test("valida a versão e o formato da foto", () => {
  assert.equal(validaFoto(fotoMinima()).versao, 1);
  assert.throws(() => validaFoto(fotoMinima({ versao: 2 })), /versão 2/);
  assert.throws(() => validaFoto(null), /formato esperado/);
  assert.throws(() => validaFoto({ versao: 1, fontes: [] }), /formato esperado/);
});

test("buscaFoto: 404 vira null; erro do GitHub, de rede e JSON ruim viram mensagem clara", async () => {
  assert.equal(await buscaFoto("2026-10-30", "/b", buscaFalsa({})), null);
  const foto = fotoMinima();
  assert.deepEqual(await buscaFoto("2026-10-30", "/b", buscaFalsa({ "2026-10-30": foto })), foto);
  await assert.rejects(buscaFoto("2026-10-30", "/b", buscaFalsa({ "2026-10-30": 500 })), /respondeu 500/);
  await assert.rejects(buscaFoto("2026-10-30", "/b", buscaFalsa({ "2026-10-30": new Error("offline") })), /Não consegui falar com o GitHub/);
  const jsonRuim = async () => ({ status: 200, ok: true, json: async () => { throw new SyntaxError("x"); } });
  await assert.rejects(buscaFoto("2026-10-30", "/b", jsonRuim), /não é um JSON válido/);
});

test("procuraFoto anda para trás pulando o fim de semana", async () => {
  const chamadas = [];
  const fotos = { "2026-10-30": fotoMinima() }; // sexta
  const achada = await procuraFoto("2026-11-01", -1, 10, "/b", buscaFalsa(fotos, chamadas)); // domingo
  assert.equal(achada.data, "2026-10-30");
  assert.deepEqual(chamadas.map((u) => u.slice(-15, -5)), ["2026-11-01", "2026-10-31", "2026-10-30"]);
});

test("procuraFoto anda para frente e respeita o limite de dias", async () => {
  assert.equal((await procuraFoto("2026-10-26", +1, 5, "/b", buscaFalsa({ "2026-10-28": fotoMinima() }))).data, "2026-10-28");
  const chamadas = [];
  assert.equal(await procuraFoto("2026-10-26", -1, 3, "/b", buscaFalsa({}, chamadas)), null);
  assert.equal(chamadas.length, 4); // o dia de partida mais 3 para trás
});
