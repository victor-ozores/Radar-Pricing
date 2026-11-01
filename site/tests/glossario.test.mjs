import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { GLOSSARIO } from "../js/glossario.js";

const raiz = fileURLToPath(new URL("../src", import.meta.url));

function arquivos(pasta) {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    return statSync(caminho).isDirectory() ? arquivos(caminho) : /\.(tsx?|ts)$/.test(nome) && !/\.test\./.test(nome) ? [caminho] : [];
  });
}

test("todo termo do dicionário tem explicação curta, com ponto final", () => {
  for (const [chave, texto] of Object.entries(GLOSSARIO)) {
    assert.ok(texto.length > 20 && texto.length < 260, `${chave}: ${texto.length} letras`);
    assert.ok(texto.trim().endsWith("."), `${chave} deve terminar em ponto`);
  }
});

test("todo <Termo id> usado nas telas existe no dicionário, e todo termo do dicionário é usado em alguma tela", () => {
  const codigo = arquivos(raiz).map((f) => readFileSync(f, "utf-8")).join("\n");
  const usados = new Set([...codigo.matchAll(/<Termo id="(\w+)"/g)].map((m) => m[1]));
  // os termos dos números de manchete são escolhidos em src/kpis.ts
  for (const m of codigo.matchAll(/:\s*"(\w+)",?\s*$/gm)) if (m[1] in GLOSSARIO) usados.add(m[1]);
  for (const id of usados) assert.ok(id in GLOSSARIO, `<Termo id="${id}"> não existe no dicionário`);
  const semUso = Object.keys(GLOSSARIO).filter((k) => !usados.has(k));
  assert.deepEqual(semUso, [], `termos do dicionário que nenhuma tela usa: ${semUso.join(", ")}`);
});

test("todo termo do dicionário tem nome, e só os termos do dicionário têm nome", async () => {
  const { NOMES_DO_GLOSSARIO } = await import("../js/glossario.js");
  assert.deepEqual(Object.keys(NOMES_DO_GLOSSARIO).sort(), Object.keys(GLOSSARIO).sort());
});
