// Formatação em português do Brasil. Todo número e toda data que a página mostra passa por aqui.

const formatadores = new Map();

function formatador(casas) {
  if (!formatadores.has(casas)) {
    formatadores.set(casas, new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }));
  }
  return formatadores.get(casas);
}

const VAZIO = "—";
const ehNumero = (v) => typeof v === "number" && Number.isFinite(v);

export function num(v, casas = 2) {
  return ehNumero(v) ? formatador(casas).format(v) : VAZIO;
}

export function pct(v, casas = 2) {
  return ehNumero(v) ? `${num(v, casas)}%` : VAZIO;
}

export function reais(v, casas = 2) {
  return ehNumero(v) ? `R$ ${num(v, casas)}` : VAZIO;
}

/** Número com sinal explícito (+ ou −). Um valor que arredonda para zero não leva sinal. */
export function sinal(v, casas = 2) {
  if (!ehNumero(v)) return VAZIO;
  if (Math.round(Math.abs(v) * 10 ** casas) === 0) return num(0, casas);
  return `${v > 0 ? "+" : "−"}${num(Math.abs(v), casas)}`;
}

export function pp(v, casas = 2) {
  return ehNumero(v) ? `${sinal(v, casas)} p.p.` : VAZIO;
}

/** "2026-10-31" -> "31/10/2026" (sem passar por Date, para o fuso nunca mexer no dia). */
export function dataBR(iso) {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return VAZIO;
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-09-30" -> "set/2026" */
export function mesAno(iso) {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}/.test(iso)) return VAZIO;
  return `${MESES[Number(iso.slice(5, 7)) - 1]}/${iso.slice(0, 4)}`;
}

export function diaDaSemana(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "long", timeZone: "UTC" });
}

/** "2026-10-31T00:00:05-03:00" -> "00:00" (a hora de Brasília que o robô gravou). */
export function horaBRT(gerado) {
  return typeof gerado === "string" && gerado.length >= 16 ? gerado.slice(11, 16) : VAZIO;
}

export function idade(dias) {
  if (!ehNumero(dias)) return VAZIO;
  if (dias === 0) return "hoje";
  return dias === 1 ? "1 dia" : `${dias} dias`;
}

/** Valor com a unidade que a fonte informa ("%", "% a.a.", "R$ bilhões", "meses"...). */
export function comUnidade(v, unidade) {
  if (!ehNumero(v)) return VAZIO;
  if (unidade === "%") return pct(v);
  if (unidade === "% a.a.") return `${pct(v)} a.a.`;
  if (unidade === "% ao dia") return `${pct(v, 4)} ao dia`;
  const texto = num(v, Number.isInteger(v) ? 0 : 2);
  if (!unidade || unidade === "unidade") return texto;
  return unidade.startsWith("R$ ") ? `R$ ${texto} ${unidade.slice(3)}` : `${texto} ${unidade}`;
}

/** Diferença entre dois valores na unidade da série: em p.p. quando a série é um percentual. */
export function deltaComUnidade(delta, unidade) {
  if (!ehNumero(delta)) return VAZIO;
  if (unidade === "%" || unidade === "% a.a.") return pp(delta);
  if (unidade === "% ao dia") return `${sinal(delta, 4)} p.p.`;
  const texto = sinal(delta, Number.isInteger(delta) ? 0 : 2);
  if (!unidade || unidade === "unidade") return texto;
  if (!unidade.startsWith("R$ ")) return `${texto} ${unidade}`;
  const temSinal = texto.startsWith("+") || texto.startsWith("−");
  return `${temSinal ? texto[0] : ""}R$ ${temSinal ? texto.slice(1) : texto} ${unidade.slice(3)}`;
}

/**
 * Lê um número digitado em português: "50.000,50", "1,5", "R$ 1.000", "12.5". Devolve null se não for número.
 * Sem vírgula, pontos em grupos de 3 dígitos ("1.500") valem como separador de milhar.
 */
export function lerNumero(texto) {
  if (typeof texto === "number") return Number.isFinite(texto) ? texto : null;
  if (typeof texto !== "string") return null;
  let t = texto.replace(/R\$|%|\s/g, "").replace(/^\+/, "");
  if (t === "" || t === "-") return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** "6 meses", "1 ano", "3 anos". */
export function prazoEmTexto(meses) {
  if (meses % 12 !== 0) return `${meses} meses`;
  const anos = meses / 12;
  return `${anos} ${anos === 1 ? "ano" : "anos"}`;
}
