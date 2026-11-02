// Como a página encontra e lê as fotos que o robô guarda na branch `data`.

export const BASE_PADRAO = "https://raw.githubusercontent.com/victor-ozores/Radar-Pricing/data/fotos";
export const VERSAO_SUPORTADA = 1;
export const DIAS_DE_BUSCA = 10;

const MAQUINA_LOCAL = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Pasta de onde as fotos vêm. Só numa máquina local dá para apontar para outra pasta (`?base=/data_local`):
 * no site público a origem dos números é fixa, para ninguém montar um link que mostre números falsos.
 */
export function baseDaFoto(local = globalThis.location) {
  if (local && MAQUINA_LOCAL.has(local.hostname)) {
    const outra = new URLSearchParams(local.search).get("base");
    if (outra) return outra.replace(/\/+$/, "");
  }
  return BASE_PADRAO;
}

/** A data de hoje em Brasília (UTC-3 o ano todo, sem horário de verão desde 2019), no formato AAAA-MM-DD. */
export function hojeEmBrasilia(agora = new Date()) {
  return new Date(agora.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
}

export function somaDias(iso, dias) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Soma meses a uma data (AAAA-MM ou AAAA-MM-DD) e devolve o dia 1 do mês de chegada (AAAA-MM-01). */
export function somaMeses(iso, meses) {
  const [a, m] = iso.split("-").map(Number);
  const total = a * 12 + (m - 1) + meses;
  return `${String(Math.floor(total / 12)).padStart(4, "0")}-${String((total % 12) + 1).padStart(2, "0")}-01`;
}

/** Quantos meses de calendário separam dois meses (o mês de `ate` menos o de `de`); aceita AAAA-MM e AAAA-MM-DD. */
export function mesesEntre(de, ate) {
  const [a1, m1] = de.split("-").map(Number);
  const [a2, m2] = ate.split("-").map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
}

export function diasEntre(deIso, ateIso) {
  return Math.round((new Date(`${ateIso}T12:00:00Z`) - new Date(`${deIso}T12:00:00Z`)) / 86_400_000);
}

export function validaFoto(foto) {
  if (!foto || typeof foto !== "object" || !Array.isArray(foto.fontes) || !Array.isArray(foto.registros) || !foto.derivados) {
    throw new Error("O arquivo da foto não tem o formato esperado.");
  }
  if (foto.versao !== VERSAO_SUPORTADA) {
    throw new Error(`Esta foto usa o formato versão ${foto.versao}, que esta página ainda não conhece.`);
  }
  return foto;
}

/** Busca a foto de um dia. Devolve null se não existe (404: fim de semana, feriado, robô parado). */
export async function buscaFoto(data, base, buscar = globalThis.fetch) {
  let resposta;
  try {
    resposta = await buscar(`${base}/${data}.json`);
  } catch {
    throw new Error("Não consegui falar com o GitHub para baixar a foto. Tente de novo em instantes.");
  }
  if (resposta.status === 404) return null;
  if (!resposta.ok) throw new Error(`O GitHub respondeu ${resposta.status} ao baixar a foto de ${data}.`);
  let corpo;
  try {
    corpo = await resposta.json();
  } catch {
    throw new Error(`A foto de ${data} não é um JSON válido.`);
  }
  return validaFoto(corpo);
}

/**
 * Anda de dia em dia a partir de `inicio` (sentido -1 = para trás, +1 = para frente) até achar uma foto
 * ou passar `limite` dias. Devolve { data, foto } ou null.
 */
export async function procuraFoto(inicio, sentido, limite, base, buscar = globalThis.fetch) {
  for (let i = 0; i <= limite; i++) {
    const data = somaDias(inicio, i * sentido);
    const foto = await buscaFoto(data, base, buscar);
    if (foto) return { data, foto };
  }
  return null;
}
